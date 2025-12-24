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
  private lastPriestReveal: { targetId: string; card: CardType } | null = null;
  private lastPrinceDiscard: CardType | null = null;
  private targetWasProtected: boolean = false;
  private lastBaronResult: { myCard: CardType; theirCard: CardType; winner: string | null } | null = null;
  private eliminatedCard: { playerId: string; card: CardType } | null = null;

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

  async startGame(gameId: string, startingPlayerId: string): Promise<void> {
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

    // Reorder players so the selected starting player goes first
    const startingPlayerIndex = players.findIndex(p => p.player_id === startingPlayerId);
    const reorderedPlayers = startingPlayerIndex >= 0
      ? [...players.slice(startingPlayerIndex), ...players.slice(0, startingPlayerIndex)]
      : players;

    // Initialize first round
    await this.initializeRound(gameId, 1, reorderedPlayers.map(p => p.player_id));

    // Log game start
    await supabaseClient
      .from('game_actions')
      .insert({
        game_id: gameId,
        round_number: 1,
        turn_number: 0,
        player_id: startingPlayerId,
        action_type: 'win_round',
        details: {
          message: `Game started! Round 1 begins with ${players.find(p => p.player_id === startingPlayerId)?.player_name} going first.`,
          game_start: true
        }
      });

    // Note: Player must manually draw their first card
  }

  async startNextRound(gameId: string): Promise<void> {
    const supabaseClient = this.supabase.getClient();
    const playerId = this.supabase.getCurrentPlayerId();

    // Verify caller is the host
    const { data: player } = await supabaseClient
      .from('game_players')
      .select('is_host')
      .eq('game_id', gameId)
      .eq('player_id', playerId)
      .single();

    if (!player?.is_host) {
      throw new Error('Only the host can start a new round');
    }

    // Get current game state
    const game = this.currentGame();
    if (!game) throw new Error('No active game');

    const previousRound = game.current_round - 1;

    // Get the winner of the previous round
    const { data: previousState } = await supabaseClient
      .from('game_state')
      .select('round_winner_id')
      .eq('game_id', gameId)
      .eq('round_number', previousRound)
      .single();

    if (!previousState?.round_winner_id) {
      throw new Error('Cannot start next round: previous round has no winner');
    }

    // Get all players and reorder so winner goes first
    const { data: players } = await supabaseClient
      .from('game_players')
      .select()
      .eq('game_id', gameId)
      .order('join_order');

    if (!players) throw new Error('No players found');

    // Reorder players so the winner goes first
    const winnerIndex = players.findIndex(p => p.player_id === previousState.round_winner_id);
    const reorderedPlayers = [
      ...players.slice(winnerIndex),
      ...players.slice(0, winnerIndex)
    ];

    // Initialize the new round
    await this.initializeRound(gameId, game.current_round, reorderedPlayers.map(p => p.player_id));

    // Log round start
    const winnerName = players.find(p => p.player_id === previousState.round_winner_id)?.player_name;
    await supabaseClient
      .from('game_actions')
      .insert({
        game_id: gameId,
        round_number: game.current_round,
        turn_number: 0,
        player_id: previousState.round_winner_id,
        action_type: 'win_round',
        details: {
          message: `Round ${game.current_round} has started! ${winnerName} (previous round winner) goes first.`,
          round_start: true
        }
      });
  }

  async playCard(request: PlayCardRequest): Promise<void> {
    const supabaseClient = this.supabase.getClient();
    const playerId = this.supabase.getCurrentPlayerId();
    const state = this.gameState();

    if (!state) throw new Error('No active game state');

    // Reset protection flag
    this.targetWasProtected = false;

    // Verify it's player's turn
    if (state.current_turn_player_id !== playerId) {
      throw new Error('Not your turn');
    }

    // Get player's hand
    const hand = this.myHand();
    if (!hand || !hand.cards.includes(request.card)) {
      throw new Error('Card not in hand');
    }

    // Must draw before playing (should have 2 cards)
    if (hand.cards.length < 2) {
      throw new Error('You must draw a card before playing');
    }

    // Countess rule: Must play Countess if you have King or Prince
    if (hand.cards.includes('Countess') &&
        (hand.cards.includes('King') || hand.cards.includes('Prince')) &&
        request.card !== 'Countess') {
      throw new Error('You must play the Countess when you have King or Prince');
    }

    // Process card effect
    await this.processCardEffect(request, state);

    // Re-fetch hand after card effect (effects like King modify the hand)
    const { data: updatedHand } = await supabaseClient
      .from('player_hands')
      .select()
      .eq('game_id', request.game_id)
      .eq('round_number', state.round_number)
      .eq('player_id', playerId)
      .single();

    if (!updatedHand) throw new Error('Hand not found after card effect');

    // Re-fetch game state after card effect (effects like Prince modify discard pile)
    const { data: stateAfterEffect } = await supabaseClient
      .from('game_state')
      .select()
      .eq('game_id', request.game_id)
      .eq('round_number', state.round_number)
      .single();

    if (!stateAfterEffect) throw new Error('Game state not found after card effect');

    // Remove only ONE instance of the played card from hand
    const cardIndex = updatedHand.cards.findIndex((c: CardType) => c === request.card);
    const newCards = cardIndex >= 0
      ? [...updatedHand.cards.slice(0, cardIndex), ...updatedHand.cards.slice(cardIndex + 1)]
      : updatedHand.cards;

    // Update player hand
    await supabaseClient
      .from('player_hands')
      .update({ cards: newCards })
      .eq('id', updatedHand.id);

    // Add to discard pile (using updated state to preserve cards added by effects)
    // For Prince, add Prince first, then the card it forced to discard
    let newDiscard = [...stateAfterEffect.discard_pile, request.card];
    // Save Prince discard before clearing (we need it later for action logging)
    const princeDiscardedCard = this.lastPrinceDiscard;
    if (this.lastPrinceDiscard) {
      newDiscard.push(this.lastPrinceDiscard);
      this.lastPrinceDiscard = null;
    }
    await supabaseClient
      .from('game_state')
      .update({ discard_pile: newDiscard })
      .eq('id', state.id);

    // Get player names for better logging
    const { data: players } = await supabaseClient
      .from('game_players')
      .select('player_id, player_name')
      .eq('game_id', request.game_id);

    const getPlayerName = (pid: string) => players?.find(p => p.player_id === pid)?.player_name || 'Unknown';
    const playerName = getPlayerName(playerId);
    const targetName = request.target_player_id ? getPlayerName(request.target_player_id) : '';

    // Prepare action details with descriptive messages
    // Store secret information separately for involved players only
    const actionDetails: any = {};
    let message = '';

    switch (request.card) {
      case 'Guard':
        actionDetails.guess_card = request.guess_card;
        if (this.targetWasProtected) {
          actionDetails.target_protected = true;
          message = `${playerName} played Guard on ${targetName}, but ${targetName} is protected by Handmaid. No effect.`;
        } else {
          const correctGuess = await this.wasGuardGuessCorrect(request.target_player_id!, request.guess_card!, state);
          actionDetails.correct_guess = correctGuess;
          // Don't reveal if guess was correct - let elimination speak for itself
          message = `${playerName} played Guard on ${targetName}`;
        }
        break;

      case 'Priest':
        if (this.lastPriestReveal) {
          // Store revealed card for the player who played Priest only
          actionDetails.revealed_card = this.lastPriestReveal.card;
          if (this.targetWasProtected) {
            actionDetails.target_protected = true;
            message = `${playerName} played Priest on ${targetName}, but ${targetName} is protected. No effect.`;
          } else {
            // Public message doesn't reveal the card
            message = `${playerName} played Priest and looked at ${targetName}'s card.`;
          }
        }
        break;

      case 'Baron':
        if (this.lastBaronResult) {
          // Store card values for involved players only
          actionDetails.baron_result = this.lastBaronResult;
          if (this.targetWasProtected) {
            actionDetails.target_protected = true;
            message = `${playerName} played Baron on ${targetName}, but ${targetName} is protected. No effect.`;
          } else {
            if (this.lastBaronResult.winner === null) {
              // Tie - no one is eliminated
              message = `${playerName} played Baron against ${targetName} - It's a tie! No one is eliminated.`;
            } else if (this.lastBaronResult.winner === playerId) {
              message = `${playerName} played Baron against ${targetName}. ${targetName} is eliminated!`;
            } else {
              message = `${playerName} played Baron against ${targetName}. ${playerName} is eliminated!`;
            }
          }
        }
        break;

      case 'Handmaid':
        message = `${playerName} played Handmaid and is now protected until their next turn.`;
        break;

      case 'Prince':
        if (this.targetWasProtected) {
          actionDetails.target_protected = true;
          message = `${playerName} played Prince on ${targetName}, but ${targetName} is protected. No effect.`;
        } else if (request.target_player_id === playerId) {
          message = `${playerName} played Prince on themselves! They discarded their card and drew a new one.`;
        } else {
          message = `${playerName} played Prince on ${targetName}. ${targetName} discarded and drew a new card.`;
        }
        if (princeDiscardedCard) {
          // Store the discarded card
          actionDetails.discarded_card = princeDiscardedCard;
          // Only reveal if it's Princess (since they get eliminated - public knowledge)
          if (princeDiscardedCard === 'Princess') {
            message += ` ${targetName} discarded the Princess and is eliminated!`;
          }
        }
        break;

      case 'King':
        if (this.targetWasProtected) {
          actionDetails.target_protected = true;
          message = `${playerName} played King on ${targetName}, but ${targetName} is protected. No effect.`;
        } else {
          message = `${playerName} played King and swapped hands with ${targetName}.`;
        }
        break;

      case 'Countess':
        message = `${playerName} played Countess.`;
        break;

      case 'Princess':
        message = `${playerName} played Princess and is eliminated!`;
        break;

      default:
        message = `${playerName} played ${request.card}`;
    }

    actionDetails.message = message;

    // Add eliminated card if someone was eliminated
    if (this.eliminatedCard) {
      actionDetails.eliminated_card = this.eliminatedCard.card;
      actionDetails.eliminated_player_id = this.eliminatedCard.playerId;
    }

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
        details: actionDetails
      });

    // Clear temp data after logging
    this.lastPriestReveal = null;
    this.lastBaronResult = null;
    this.eliminatedCard = null;

    // Reload game state to get latest data (might have changed due to card effects)
    const { data: updatedState } = await supabaseClient
      .from('game_state')
      .select()
      .eq('game_id', request.game_id)
      .eq('round_number', state.round_number)
      .single();

    if (!updatedState) return;

    // Check if round is over
    await this.checkRoundEnd(request.game_id, updatedState.round_number);

    // Reload game data to get latest status after potential round end
    await this.loadGameData(request.game_id);

    // Check if round ended (new round started or game finished)
    const currentState = this.gameState();
    const game = this.currentGame();

    console.log('🔄 Turn advancement check:', {
      gameStatus: game?.status,
      currentRound: currentState?.round_number,
      updatedRound: updatedState.round_number,
      currentTurn: currentState?.current_turn_player_id
    });

    // Only advance turn if we're still in the same round
    if (game?.status === 'in_progress' &&
        currentState?.round_number === updatedState.round_number) {
      console.log('⏭️ Advancing to next turn...');
      await this.nextTurn(updatedState);
      // Reload game data to update UI with new turn
      await this.loadGameData(request.game_id);
      console.log('✅ Turn advanced to:', this.gameState()?.current_turn_player_id);
    } else {
      console.log('⏸️ Not advancing turn - conditions not met');
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
        if (request.target_player_id) {
          await this.handlePriest(request.target_player_id, state);
        }
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
        // Note: Princess is already the card being played, so no need to store eliminated card
        await this.eliminatePlayer(playerId, state.game_id, state.round_number);
        break;
      case 'Countess':
        // Countess has no special effect when played
        break;
    }
  }

  private async isPlayerProtected(playerId: string, gameId: string, roundNumber: number): Promise<boolean> {
    const supabaseClient = this.supabase.getClient();
    const { data: hand } = await supabaseClient
      .from('player_hands')
      .select('is_protected')
      .eq('game_id', gameId)
      .eq('round_number', roundNumber)
      .eq('player_id', playerId)
      .maybeSingle();

    return hand?.is_protected || false;
  }

  private async wasGuardGuessCorrect(targetId: string, guessCard: CardType, state: GameState): Promise<boolean> {
    // Can't guess Guard - always wrong even if target has Guard
    if (guessCard === 'Guard') return false;

    const supabaseClient = this.supabase.getClient();
    const { data: targetHand } = await supabaseClient
      .from('player_hands')
      .select()
      .eq('game_id', state.game_id)
      .eq('round_number', state.round_number)
      .eq('player_id', targetId)
      .single();

    return targetHand ? targetHand.cards.includes(guessCard) : false;
  }

  private async handleGuard(targetId: string, guessCard: CardType, state: GameState): Promise<void> {
    if (guessCard === 'Guard') return; // Can't guess Guard

    // Check if target is protected (Handmaid effect)
    if (await this.isPlayerProtected(targetId, state.game_id, state.round_number)) {
      this.targetWasProtected = true;
      return; // No effect on protected players
    }

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
      const finalCard = await this.eliminatePlayer(targetId, state.game_id, state.round_number);
      if (finalCard) {
        this.eliminatedCard = { playerId: targetId, card: finalCard };
      }
    }
  }

  private async handlePriest(targetId: string, state: GameState): Promise<void> {
    // Check if target is protected
    if (await this.isPlayerProtected(targetId, state.game_id, state.round_number)) {
      this.targetWasProtected = true;
      return; // No effect on protected players
    }

    const supabaseClient = this.supabase.getClient();

    // Get target's hand
    const { data: targetHand } = await supabaseClient
      .from('player_hands')
      .select()
      .eq('game_id', state.game_id)
      .eq('round_number', state.round_number)
      .eq('player_id', targetId)
      .single();

    if (!targetHand || targetHand.cards.length === 0) return;

    // Store the revealed card so it can be shown to the player
    // The card will be displayed via the game action
    const revealedCard = targetHand.cards[0];

    // Update the action details to include the revealed card
    // (This will be picked up when logging the action in playCard)
    this.lastPriestReveal = {
      targetId,
      card: revealedCard
    };
  }

  private async handleBaron(targetId: string, state: GameState): Promise<void> {
    // Check if target is protected
    if (await this.isPlayerProtected(targetId, state.game_id, state.round_number)) {
      this.targetWasProtected = true;
      return; // No effect on protected players
    }

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

    if (!myHand || !theirHand || !theirHand.cards[0]) return;

    // Get the card to compare (not the Baron being played)
    const myCardToCompare = myHand.cards.length === 2
      ? myHand.cards.find((c: CardType) => c !== 'Baron') || myHand.cards[0]
      : myHand.cards[0];
    const theirCardToCompare = theirHand.cards[0];

    const myValue = CARD_VALUES[myCardToCompare as CardType];
    const theirValue = CARD_VALUES[theirCardToCompare as CardType];

    // Store result for action logging
    let winner: string | null = null;
    if (myValue < theirValue) {
      winner = targetId;
      const finalCard = await this.eliminatePlayer(playerId, state.game_id, state.round_number);
      if (finalCard) {
        this.eliminatedCard = { playerId, card: finalCard };
      }
    } else if (theirValue < myValue) {
      winner = playerId;
      const finalCard = await this.eliminatePlayer(targetId, state.game_id, state.round_number);
      if (finalCard) {
        this.eliminatedCard = { playerId: targetId, card: finalCard };
      }
    }
    // If equal, no one is eliminated (winner stays null)

    this.lastBaronResult = {
      myCard: myCardToCompare,
      theirCard: theirCardToCompare,
      winner
    };
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
    // Check if target is protected (unless targeting yourself)
    const playerId = this.supabase.getCurrentPlayerId();
    if (targetId !== playerId && await this.isPlayerProtected(targetId, state.game_id, state.round_number)) {
      this.targetWasProtected = true;
      return; // No effect on protected players
    }

    const supabaseClient = this.supabase.getClient();

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

    // Store discarded card to be added to discard pile after Prince
    // (Prince should be first in discard pile, then the card it forced to discard)
    this.lastPrinceDiscard = discardedCard;

    // If Princess was discarded, eliminate the player
    if (discardedCard === 'Princess') {
      // Note: Princess is already stored in lastPrinceDiscard, no need to store eliminated card
      await this.eliminatePlayer(targetId, state.game_id, state.round_number);
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

      // Build new hand: remove discarded card, add new card
      let newHand: CardType[];
      if (targetId === playerId && targetHand.cards.length === 2) {
        // When targeting yourself: remove the discarded card, keep Prince, add new card
        // Prince will be removed later by main playCard logic
        newHand = targetHand.cards.filter((c: CardType) => c !== discardedCard);
        newHand.push(newCard);
      } else {
        // When targeting others: just replace with new card
        newHand = [newCard];
      }

      await supabaseClient
        .from('player_hands')
        .update({ cards: newHand })
        .eq('id', targetHand.id);

      await supabaseClient
        .from('game_state')
        .update({ deck: newDeck })
        .eq('id', state.id);
    } else if (state.set_aside_card) {
      // Use set aside card
      let newHand: CardType[];
      if (targetId === playerId && targetHand.cards.length === 2) {
        // Remove discarded card, keep Prince, add set-aside card
        newHand = targetHand.cards.filter((c: CardType) => c !== discardedCard);
        newHand.push(state.set_aside_card);
      } else {
        newHand = [state.set_aside_card];
      }

      await supabaseClient
        .from('player_hands')
        .update({ cards: newHand })
        .eq('id', targetHand.id);
    }
  }

  private async handleKing(targetId: string, state: GameState): Promise<void> {
    // Check if target is protected
    if (await this.isPlayerProtected(targetId, state.game_id, state.round_number)) {
      this.targetWasProtected = true;
      return; // No effect on protected players
    }

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

    // Get the card to swap (not the King being played)
    const myCardToSwap = myHand.cards.length === 2
      ? myHand.cards.find((c: CardType) => c !== 'King') || myHand.cards[0]
      : myHand.cards[0];
    const theirCardToSwap = theirHand.cards[0];

    // Swap the cards
    const myNewHand = myHand.cards.length === 2
      ? ['King', theirCardToSwap] // Keep the King, get their card
      : [theirCardToSwap];

    await supabaseClient
      .from('player_hands')
      .update({ cards: myNewHand })
      .eq('id', myHand.id);

    await supabaseClient
      .from('player_hands')
      .update({ cards: [myCardToSwap] })
      .eq('id', theirHand.id);
  }

  private async eliminatePlayer(playerId: string, gameId: string, roundNumber?: number): Promise<CardType | null> {
    const supabaseClient = this.supabase.getClient();

    // Get the player's final card before elimination
    let finalCard: CardType | null = null;
    if (roundNumber !== undefined) {
      const { data: hand } = await supabaseClient
        .from('player_hands')
        .select('cards')
        .eq('game_id', gameId)
        .eq('round_number', roundNumber)
        .eq('player_id', playerId)
        .single();

      if (hand && hand.cards && hand.cards.length > 0) {
        finalCard = hand.cards[0];
      }
    }

    await supabaseClient
      .from('game_players')
      .update({ is_eliminated: true })
      .eq('game_id', gameId)
      .eq('player_id', playerId);

    return finalCard;
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

    // Remove protection from next player's hand (Handmaid effect ends)
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
        .update({ is_protected: false })
        .eq('id', nextHand.id);
    }

    // Update to next turn (player must manually draw)
    await supabaseClient
      .from('game_state')
      .update({
        current_turn_player_id: nextPlayerId,
        turn_number: state.turn_number + 1
      })
      .eq('id', state.id);
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
    const playersWithMaxValue: string[] = [];

    for (const hand of hands) {
      if (!hand.cards[0]) continue;
      const value = CARD_VALUES[hand.cards[0] as CardType];
      if (value > maxValue) {
        maxValue = value;
        playersWithMaxValue.length = 0;
        playersWithMaxValue.push(hand.player_id);
      } else if (value === maxValue) {
        playersWithMaxValue.push(hand.player_id);
      }
    }

    // If only one player has the highest card, they win
    if (playersWithMaxValue.length === 1) {
      return playersWithMaxValue[0];
    }

    // Tiebreaker: player who discarded cards with highest total value wins
    const { data: actions } = await supabaseClient
      .from('game_actions')
      .select('player_id, card_played')
      .eq('game_id', gameId)
      .eq('round_number', roundNumber)
      .eq('action_type', 'play_card')
      .in('player_id', playersWithMaxValue);

    const discardSums: Record<string, number> = {};
    playersWithMaxValue.forEach(id => discardSums[id] = 0);

    if (actions) {
      for (const action of actions) {
        if (action.card_played) {
          discardSums[action.player_id] += CARD_VALUES[action.card_played as CardType];
        }
      }
    }

    // Find player with highest discard sum
    let winnerId = playersWithMaxValue[0];
    let maxSum = discardSums[winnerId];

    for (const playerId of playersWithMaxValue) {
      if (discardSums[playerId] > maxSum) {
        maxSum = discardSums[playerId];
        winnerId = playerId;
      }
    }

    return winnerId;
  }

  private async endRound(gameId: string, roundNumber: number, winnerId: string): Promise<void> {
    const supabaseClient = this.supabase.getClient();

    // Get winner's name for logging
    const { data: winnerPlayer } = await supabaseClient
      .from('game_players')
      .select('player_name, tokens, is_eliminated')
      .eq('game_id', gameId)
      .eq('player_id', winnerId)
      .single();

    // Count non-eliminated players to determine win reason
    const { data: allPlayers } = await supabaseClient
      .from('game_players')
      .select('is_eliminated')
      .eq('game_id', gameId);

    const activePlayers = allPlayers?.filter(p => !p.is_eliminated) || [];
    const wonByElimination = activePlayers.length === 1;

    // Get winner's card if they won by highest card
    let winningCard: CardType | null = null;
    if (!wonByElimination) {
      const { data: winnerHand } = await supabaseClient
        .from('player_hands')
        .select('cards')
        .eq('game_id', gameId)
        .eq('round_number', roundNumber)
        .eq('player_id', winnerId)
        .single();

      if (winnerHand && winnerHand.cards && winnerHand.cards.length > 0) {
        winningCard = winnerHand.cards[0] as CardType;
      }
    }

    // Award token - get current tokens and increment
    const newTokenCount = (winnerPlayer?.tokens || 0) + 1;

    await supabaseClient
      .from('game_players')
      .update({ tokens: newTokenCount })
      .eq('game_id', gameId)
      .eq('player_id', winnerId);

    // Update game_state with round winner
    await supabaseClient
      .from('game_state')
      .update({ round_winner_id: winnerId })
      .eq('game_id', gameId)
      .eq('round_number', roundNumber);

    // Log round end with win reason
    const gameState = this.gameState();
    const actionDetails: any = {
      message: `${winnerPlayer?.player_name} won round ${roundNumber} and earned a token! (Total: ${newTokenCount})`,
      tokens_earned: newTokenCount,
      won_by_elimination: wonByElimination
    };

    if (winningCard) {
      actionDetails.winning_card = winningCard;
    }

    await supabaseClient
      .from('game_actions')
      .insert({
        game_id: gameId,
        round_number: roundNumber,
        turn_number: gameState?.turn_number || 0,
        player_id: winnerId,
        action_type: 'win_round',
        details: actionDetails
      });

    // Store all players' final cards for display
    const { data: allHands } = await supabaseClient
      .from('player_hands')
      .select('player_id, cards')
      .eq('game_id', gameId)
      .eq('round_number', roundNumber);

    if (allHands) {
      for (const hand of allHands) {
        if (hand.cards && hand.cards.length > 0) {
          await supabaseClient
            .from('game_actions')
            .insert({
              game_id: gameId,
              round_number: roundNumber,
              turn_number: (gameState?.turn_number || 0) + 1,
              player_id: hand.player_id,
              action_type: 'round_end_reveal',
              details: {
                final_card: hand.cards[0]
              }
            });
        }
      }
    }

    // Check if game is over
    const game = this.currentGame();
    if (!game) return;

    if (newTokenCount >= game.winning_tokens) {
      // Game over - winner has enough tokens
      await supabaseClient
        .from('games')
        .update({
          status: 'finished',
          finished_at: new Date().toISOString(),
          winner_id: winnerId
        })
        .eq('id', gameId);

      // Log game end
      await supabaseClient
        .from('game_actions')
        .insert({
          game_id: gameId,
          round_number: roundNumber,
          turn_number: gameState?.turn_number || 0,
          player_id: winnerId,
          action_type: 'win_round',
          details: {
            message: `🎉 ${winnerPlayer?.player_name} wins the game with ${newTokenCount} tokens!`,
            game_over: true
          }
        });
    } else {
      // Increment current_round and wait for host to start next round
      await supabaseClient
        .from('games')
        .update({ current_round: roundNumber + 1 })
        .eq('id', gameId);

      // Log waiting for next round
      await supabaseClient
        .from('game_actions')
        .insert({
          game_id: gameId,
          round_number: roundNumber,
          turn_number: gameState?.turn_number || 0,
          player_id: winnerId,
          action_type: 'win_round',
          details: {
            message: `Waiting for host to start Round ${roundNumber + 1}...`,
            waiting_for_host: true
          }
        });
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

  async drawCardForPlayer(gameId: string, roundNumber: number, playerId: string): Promise<void> {
    const supabaseClient = this.supabase.getClient();

    // Get current game state
    const { data: state } = await supabaseClient
      .from('game_state')
      .select()
      .eq('game_id', gameId)
      .eq('round_number', roundNumber)
      .single();

    if (!state || state.deck.length === 0) {
      throw new Error('No cards left to draw');
    }

    // Get player's hand
    const { data: playerHand } = await supabaseClient
      .from('player_hands')
      .select()
      .eq('game_id', gameId)
      .eq('round_number', roundNumber)
      .eq('player_id', playerId)
      .single();

    if (!playerHand) {
      throw new Error('Player hand not found');
    }

    // Prevent drawing if already have 2+ cards
    if (playerHand.cards.length >= 2) {
      throw new Error('You have already drawn this turn');
    }

    // Draw top card from deck
    const drawnCard = state.deck[0];
    const newDeck = state.deck.slice(1);

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

    // Load game
    const { data: game } = await supabaseClient
      .from('games')
      .select()
      .eq('id', gameId)
      .single();

    if (game) {
      this.currentGame.set(game);
    }

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
