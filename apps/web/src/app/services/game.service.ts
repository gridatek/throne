import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import {
  Game,
  GamePlayer,
  GameState,
  PlayerHand,
  GameAction,
  CreateGameRequest,
  JoinGameRequest,
  PlayCardRequest,
  CardType,
  CARD_VALUES
} from '../models/game.models';
import { RealtimeChannel } from '@supabase/supabase-js';

@Injectable({
  providedIn: 'root'
})
export class GameService {
  // Signals for reactive state
  currentGame = signal<Game | null>(null);
  players = signal<GamePlayer[]>([]);
  gameState = signal<GameState | null>(null);
  myHand = signal<PlayerHand | null>(null);
  recentActions = signal<GameAction[]>([]);

  private realtimeChannel: RealtimeChannel | null = null;

  constructor(private supabase: SupabaseService) {}

  async createGame(request: CreateGameRequest): Promise<Game> {
    const supabaseClient = this.supabase.getClient();
    const playerId = this.supabase.getCurrentPlayerId();

    // Generate room code
    const roomCode = this.generateRoomCode();

    // Create game (always 4 players max for standard Love Letter)
    const { data: game, error: gameError } = await supabaseClient
      .from('games')
      .insert({
        room_code: roomCode,
        max_players: 4,
        created_by: playerId,
        winning_tokens: this.getWinningTokens(4)
      })
      .select()
      .single();

    if (gameError) throw gameError;

    // Add creator as first player
    const { error: playerError } = await supabaseClient
      .from('game_players')
      .insert({
        game_id: game.id,
        player_id: playerId,
        player_name: request.player_name,
        is_host: true,
        join_order: 1
      });

    if (playerError) throw playerError;

    this.currentGame.set(game);
    await this.loadGameData(game.id);
    this.subscribeToGame(game.id);

    return game;
  }

  async joinGame(request: JoinGameRequest): Promise<Game> {
    const supabaseClient = this.supabase.getClient();
    const playerId = this.supabase.getCurrentPlayerId();

    // Find game by room code
    const { data: game, error: findError } = await supabaseClient
      .from('games')
      .select()
      .eq('room_code', request.room_code.toUpperCase())
      .eq('status', 'waiting')
      .single();

    if (findError || !game) {
      console.error('Join game error:', findError, 'Room code:', request.room_code);
      throw new Error('Game not found or already started');
    }

    // Check if game is full
    const { count } = await supabaseClient
      .from('game_players')
      .select('*', { count: 'exact', head: true })
      .eq('game_id', game.id);

    if (count && count >= game.max_players) {
      throw new Error('Game is full');
    }

    // Get next join order
    const { data: players } = await supabaseClient
      .from('game_players')
      .select('join_order')
      .eq('game_id', game.id)
      .order('join_order', { ascending: false })
      .limit(1);

    const nextOrder = players && players.length > 0 ? players[0].join_order + 1 : 1;

    // Add player to game
    const { error: joinError } = await supabaseClient
      .from('game_players')
      .insert({
        game_id: game.id,
        player_id: playerId,
        player_name: request.player_name,
        is_host: false,
        join_order: nextOrder
      });

    if (joinError) throw joinError;

    this.currentGame.set(game);
    await this.loadGameData(game.id);
    this.subscribeToGame(game.id);

    return game;
  }

  async startGame(gameId: string): Promise<void> {
    const supabaseClient = this.supabase.getClient();

    // Check if enough players (ordered by join_order)
    const { data: players } = await supabaseClient
      .from('game_players')
      .select()
      .eq('game_id', gameId)
      .order('join_order');

    if (!players || players.length < 2) {
      throw new Error('Need at least 2 players to start');
    }

    // Update game status
    const { error: updateError } = await supabaseClient
      .from('games')
      .update({
        status: 'in_progress',
        started_at: new Date().toISOString(),
        current_round: 1
      })
      .eq('id', gameId);

    if (updateError) throw updateError;

    // Initialize first round
    await this.initializeRound(gameId, 1, players.map(p => p.player_id));

    // Draw card for first player (everyone starts with 1, first player needs to draw to have 2)
    const firstPlayerId = players[0].player_id;
    await this.drawCardForPlayer(gameId, 1, firstPlayerId);
  }

  async playCard(request: PlayCardRequest): Promise<void> {
    const supabaseClient = this.supabase.getClient();
    const playerId = this.supabase.getCurrentPlayerId();
    const state = this.gameState();

    if (!state) throw new Error('No active game state');

    // Verify it's player's turn
    if (state.current_turn_player_id !== playerId) {
      throw new Error('Not your turn');
    }

    // Get player's hand
    const hand = this.myHand();
    if (!hand || !hand.cards.includes(request.card)) {
      throw new Error('Card not in hand');
    }

    // Process card effect
    await this.processCardEffect(request, state);

    // Remove card from hand
    const newCards = hand.cards.filter(c => c !== request.card);

    // Update player hand
    await supabaseClient
      .from('player_hands')
      .update({ cards: newCards })
      .eq('id', hand.id);

    // Add to discard pile
    const newDiscard = [...state.discard_pile, request.card];
    await supabaseClient
      .from('game_state')
      .update({ discard_pile: newDiscard })
      .eq('id', state.id);

    // Log action
    await supabaseClient
      .from('game_actions')
      .insert({
        game_id: request.game_id,
        round_number: state.round_number,
        turn_number: state.turn_number,
        player_id: playerId,
        action_type: 'play_card',
        card_played: request.card,
        target_player_id: request.target_player_id,
        details: { guess_card: request.guess_card }
      });

    // Reload game state to get latest data (might have changed due to card effects)
    const { data: updatedState } = await supabaseClient
      .from('game_state')
      .select()
      .eq('game_id', request.game_id)
      .eq('round_number', state.round_number)
      .single();

    if (!updatedState) return;

    // Check if round is over
    await this.checkRoundEnd(request.game_id, state.round_number);

    // If round didn't end, proceed to next turn
    const game = this.currentGame();
    if (game?.status === 'in_progress') {
      await this.nextTurn(updatedState);
    }
  }

  private async processCardEffect(request: PlayCardRequest, state: GameState): Promise<void> {
    const playerId = this.supabase.getCurrentPlayerId();

    switch (request.card) {
      case 'Guard':
        if (request.target_player_id && request.guess_card) {
          await this.handleGuard(request.target_player_id, request.guess_card, state);
        }
        break;
      case 'Priest':
        // Just reveals card to player (handled in UI)
        break;
      case 'Baron':
        if (request.target_player_id) {
          await this.handleBaron(request.target_player_id, state);
        }
        break;
      case 'Handmaid':
        await this.handleHandmaid(state);
        break;
      case 'Prince':
        if (request.target_player_id) {
          await this.handlePrince(request.target_player_id, state);
        }
        break;
      case 'King':
        if (request.target_player_id) {
          await this.handleKing(request.target_player_id, state);
        }
        break;
      case 'Princess':
        // Playing Princess eliminates you immediately
        await this.eliminatePlayer(playerId, state.game_id);
        break;
      case 'Countess':
        // Countess has no special effect when played
        break;
    }
  }

  private async handleGuard(targetId: string, guessCard: CardType, state: GameState): Promise<void> {
    if (guessCard === 'Guard') return; // Can't guess Guard

    const supabaseClient = this.supabase.getClient();
    const { data: targetHand } = await supabaseClient
      .from('player_hands')
      .select()
      .eq('game_id', state.game_id)
      .eq('round_number', state.round_number)
      .eq('player_id', targetId)
      .single();

    if (targetHand && targetHand.cards.includes(guessCard)) {
      // Correct guess - eliminate target
      await this.eliminatePlayer(targetId, state.game_id);
    }
  }

  private async handleBaron(targetId: string, state: GameState): Promise<void> {
    const supabaseClient = this.supabase.getClient();
    const playerId = this.supabase.getCurrentPlayerId();

    const { data: hands } = await supabaseClient
      .from('player_hands')
      .select()
      .eq('game_id', state.game_id)
      .eq('round_number', state.round_number)
      .in('player_id', [playerId, targetId]);

    if (!hands || hands.length !== 2) return;

    const myHand = hands.find(h => h.player_id === playerId);
    const theirHand = hands.find(h => h.player_id === targetId);

    if (!myHand || !theirHand || !myHand.cards[0] || !theirHand.cards[0]) return;

    const myValue = CARD_VALUES[myHand.cards[0] as CardType];
    const theirValue = CARD_VALUES[theirHand.cards[0] as CardType];

    if (myValue < theirValue) {
      await this.eliminatePlayer(playerId, state.game_id);
    } else if (theirValue < myValue) {
      await this.eliminatePlayer(targetId, state.game_id);
    }
  }

  private async handleHandmaid(state: GameState): Promise<void> {
    const supabaseClient = this.supabase.getClient();
    const playerId = this.supabase.getCurrentPlayerId();

    await supabaseClient
      .from('player_hands')
      .update({ is_protected: true })
      .eq('game_id', state.game_id)
      .eq('round_number', state.round_number)
      .eq('player_id', playerId);
  }

  private async handlePrince(targetId: string, state: GameState): Promise<void> {
    const supabaseClient = this.supabase.getClient();
    const playerId = this.supabase.getCurrentPlayerId();

    const { data: targetHand } = await supabaseClient
      .from('player_hands')
      .select()
      .eq('game_id', state.game_id)
      .eq('round_number', state.round_number)
      .eq('player_id', targetId)
      .single();

    if (!targetHand) return;

    // Determine which card to discard
    let discardedCard: CardType;
    if (targetId === playerId && targetHand.cards.length === 2) {
      // If targeting yourself and you have 2 cards, discard the one you're NOT playing (the non-Prince)
      discardedCard = targetHand.cards.find((c: CardType) => c !== 'Prince') || targetHand.cards[0];
    } else {
      // Otherwise discard the only card they have
      discardedCard = targetHand.cards[0];
    }

    // Add discarded card to discard pile
    const newDiscardPile = [...state.discard_pile, discardedCard];
    await supabaseClient
      .from('game_state')
      .update({ discard_pile: newDiscardPile })
      .eq('id', state.id);

    // If Princess was discarded, eliminate the player
    if (discardedCard === 'Princess') {
      await this.eliminatePlayer(targetId, state.game_id);
      // Also clear their hand
      await supabaseClient
        .from('player_hands')
        .update({ cards: [] })
        .eq('id', targetHand.id);
      return;
    }

    // Draw new card from deck
    if (state.deck.length > 0) {
      const newCard = state.deck[0];
      const newDeck = state.deck.slice(1);

      await supabaseClient
        .from('player_hands')
        .update({ cards: [newCard] })
        .eq('id', targetHand.id);

      await supabaseClient
        .from('game_state')
        .update({ deck: newDeck })
        .eq('id', state.id);
    } else if (state.set_aside_card) {
      // Use set aside card
      await supabaseClient
        .from('player_hands')
        .update({ cards: [state.set_aside_card] })
        .eq('id', targetHand.id);
    }
  }

  private async handleKing(targetId: string, state: GameState): Promise<void> {
    const supabaseClient = this.supabase.getClient();
    const playerId = this.supabase.getCurrentPlayerId();

    const { data: hands } = await supabaseClient
      .from('player_hands')
      .select()
      .eq('game_id', state.game_id)
      .eq('round_number', state.round_number)
      .in('player_id', [playerId, targetId]);

    if (!hands || hands.length !== 2) return;

    const myHand = hands.find(h => h.player_id === playerId);
    const theirHand = hands.find(h => h.player_id === targetId);

    if (!myHand || !theirHand) return;

    // Swap hands
    await supabaseClient
      .from('player_hands')
      .update({ cards: theirHand.cards })
      .eq('id', myHand.id);

    await supabaseClient
      .from('player_hands')
      .update({ cards: myHand.cards })
      .eq('id', theirHand.id);
  }

  private async eliminatePlayer(playerId: string, gameId: string): Promise<void> {
    const supabaseClient = this.supabase.getClient();

    await supabaseClient
      .from('game_players')
      .update({ is_eliminated: true })
      .eq('game_id', gameId)
      .eq('player_id', playerId);
  }

  private async nextTurn(state: GameState): Promise<void> {
    const supabaseClient = this.supabase.getClient();

    // Get next player
    const { data: nextPlayerId } = await supabaseClient
      .rpc('get_next_player', {
        p_game_id: state.game_id,
        p_current_player_id: state.current_turn_player_id
      });

    if (!nextPlayerId) return;

    // Draw card for next player
    if (state.deck.length > 0) {
      const drawnCard = state.deck[0];
      const newDeck = state.deck.slice(1);

      const { data: nextHand } = await supabaseClient
        .from('player_hands')
        .select()
        .eq('game_id', state.game_id)
        .eq('round_number', state.round_number)
        .eq('player_id', nextPlayerId)
        .single();

      if (nextHand) {
        await supabaseClient
          .from('player_hands')
          .update({
            cards: [...nextHand.cards, drawnCard],
            is_protected: false // Remove protection at start of turn
          })
          .eq('id', nextHand.id);
      }

      await supabaseClient
        .from('game_state')
        .update({
          current_turn_player_id: nextPlayerId,
          turn_number: state.turn_number + 1,
          deck: newDeck
        })
        .eq('id', state.id);
    }
  }

  private async checkRoundEnd(gameId: string, roundNumber: number): Promise<void> {
    const supabaseClient = this.supabase.getClient();

    // Count non-eliminated players
    const { data: activePlayers } = await supabaseClient
      .from('game_players')
      .select()
      .eq('game_id', gameId)
      .eq('is_eliminated', false);

    if (!activePlayers) return;

    let winnerId: string | null = null;

    // Round ends if only one player left or deck is empty
    if (activePlayers.length === 1) {
      winnerId = activePlayers[0].player_id;
    } else {
      // Reload state from database to get latest deck size
      const { data: state } = await supabaseClient
        .from('game_state')
        .select()
        .eq('game_id', gameId)
        .eq('round_number', roundNumber)
        .maybeSingle();

      if (state && state.deck.length === 0) {
        // Compare hands
        winnerId = await this.determineRoundWinner(gameId, roundNumber, activePlayers.map(p => p.player_id));
      }
    }

    if (winnerId) {
      await this.endRound(gameId, roundNumber, winnerId);
    }
  }

  private async determineRoundWinner(gameId: string, roundNumber: number, playerIds: string[]): Promise<string> {
    const supabaseClient = this.supabase.getClient();

    const { data: hands } = await supabaseClient
      .from('player_hands')
      .select()
      .eq('game_id', gameId)
      .eq('round_number', roundNumber)
      .in('player_id', playerIds);

    if (!hands) return playerIds[0];

    // Find highest card value
    let maxValue = 0;
    let winnerId = playerIds[0];

    for (const hand of hands) {
      if (!hand.cards[0]) continue;
      const value = CARD_VALUES[hand.cards[0] as CardType];
      if (value > maxValue) {
        maxValue = value;
        winnerId = hand.player_id;
      }
    }

    return winnerId;
  }

  private async endRound(gameId: string, roundNumber: number, winnerId: string): Promise<void> {
    const supabaseClient = this.supabase.getClient();

    // Award token - get current tokens and increment
    const { data: player } = await supabaseClient
      .from('game_players')
      .select('tokens')
      .eq('game_id', gameId)
      .eq('player_id', winnerId)
      .single();

    if (player) {
      await supabaseClient
        .from('game_players')
        .update({ tokens: player.tokens + 1 })
        .eq('game_id', gameId)
        .eq('player_id', winnerId);
    }

    // Check if game is over
    const game = this.currentGame();
    if (!game) return;

    const { data: winner } = await supabaseClient
      .from('game_players')
      .select()
      .eq('game_id', gameId)
      .eq('player_id', winnerId)
      .single();

    if (winner && winner.tokens >= game.winning_tokens) {
      // Game over
      await supabaseClient
        .from('games')
        .update({
          status: 'finished',
          finished_at: new Date().toISOString(),
          winner_id: winnerId
        })
        .eq('id', gameId);
    } else {
      // Start next round
      const { data: players } = await supabaseClient
        .from('game_players')
        .select()
        .eq('game_id', gameId)
        .order('join_order');

      if (players) {
        // Reorder players so the winner goes first
        const winnerIndex = players.findIndex(p => p.player_id === winnerId);
        const reorderedPlayers = [
          ...players.slice(winnerIndex),
          ...players.slice(0, winnerIndex)
        ];

        await this.initializeRound(gameId, roundNumber + 1, reorderedPlayers.map(p => p.player_id));
        // Draw card for winner (who starts the new round)
        await this.drawCardForPlayer(gameId, roundNumber + 1, winnerId);
      }
    }
  }

  private async initializeRound(gameId: string, roundNumber: number, playerIds: string[]): Promise<void> {
    const supabaseClient = this.supabase.getClient();

    await supabaseClient.rpc('initialize_round', {
      p_game_id: gameId,
      p_round_number: roundNumber,
      p_player_ids: playerIds
    });
  }

  private async drawCardForPlayer(gameId: string, roundNumber: number, playerId: string): Promise<void> {
    const supabaseClient = this.supabase.getClient();

    // Get current game state
    const { data: state } = await supabaseClient
      .from('game_state')
      .select()
      .eq('game_id', gameId)
      .eq('round_number', roundNumber)
      .single();

    if (!state || state.deck.length === 0) return;

    // Draw top card from deck
    const drawnCard = state.deck[0];
    const newDeck = state.deck.slice(1);

    // Get player's hand
    const { data: playerHand } = await supabaseClient
      .from('player_hands')
      .select()
      .eq('game_id', gameId)
      .eq('round_number', roundNumber)
      .eq('player_id', playerId)
      .single();

    if (!playerHand) return;

    // Add card to hand
    await supabaseClient
      .from('player_hands')
      .update({ cards: [...playerHand.cards, drawnCard] })
      .eq('id', playerHand.id);

    // Update deck
    await supabaseClient
      .from('game_state')
      .update({ deck: newDeck })
      .eq('id', state.id);
  }

  async loadGameData(gameId: string): Promise<void> {
    console.log('📊 Loading game data for:', gameId);
    const supabaseClient = this.supabase.getClient();
    const playerId = this.supabase.getCurrentPlayerId();

    // Load players
    const { data: players } = await supabaseClient
      .from('game_players')
      .select()
      .eq('game_id', gameId)
      .order('join_order');

    if (players) {
      console.log('✅ Players loaded:', players.length, players);
      this.players.set(players);
    }

    // Load game state
    const { data: gameState } = await supabaseClient
      .from('game_state')
      .select()
      .eq('game_id', gameId)
      .order('round_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (gameState) {
      this.gameState.set(gameState);

      // Load my hand
      const { data: myHand } = await supabaseClient
        .from('player_hands')
        .select()
        .eq('game_id', gameId)
        .eq('round_number', gameState.round_number)
        .eq('player_id', playerId)
        .maybeSingle();

      if (myHand) this.myHand.set(myHand);
    }

    // Load recent actions
    const { data: actions } = await supabaseClient
      .from('game_actions')
      .select()
      .eq('game_id', gameId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (actions) this.recentActions.set(actions);
  }

  subscribeToGame(gameId: string): void {
    console.log('🔔 Subscribing to game updates:', gameId);

    this.realtimeChannel = this.supabase.subscribe(
      `game:${gameId}`,
      '*',
      'games',
      (payload) => {
        console.log('🎮 Game update received:', payload);
        if (payload.new) {
          this.currentGame.set(payload.new as Game);
        }
      },
      `id=eq.${gameId}`
    );

    // Subscribe to other tables too
    this.supabase.subscribe(
      `players:${gameId}`,
      '*',
      'game_players',
      (payload) => {
        console.log('👥 Player update received:', payload);
        this.loadGameData(gameId);
      },
      `game_id=eq.${gameId}`
    );

    this.supabase.subscribe(
      `state:${gameId}`,
      '*',
      'game_state',
      () => {
        console.log('🎲 Game state update received');
        this.loadGameData(gameId);
      },
      `game_id=eq.${gameId}`
    );

    this.supabase.subscribe(
      `actions:${gameId}`,
      '*',
      'game_actions',
      () => {
        console.log('⚡ Game action received');
        this.loadGameData(gameId);
      },
      `game_id=eq.${gameId}`
    );
  }

  unsubscribe(): void {
    if (this.realtimeChannel) {
      this.supabase.unsubscribe(this.realtimeChannel);
    }
  }

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  private getWinningTokens(playerCount: number): number {
    // Standard Love Letter rules for 2-4 players
    if (playerCount === 2) return 7;
    if (playerCount === 3) return 5;
    return 4; // 4 players
  }
}
