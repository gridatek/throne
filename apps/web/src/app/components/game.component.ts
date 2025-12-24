import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GameService } from '../services/game.service';
import { SupabaseService } from '../services/supabase.service';
import { CardComponent } from './card.component';
import { CardType, GamePlayer } from '../models/game.models';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule, FormsModule, CardComponent],
  template: `
    <div class="min-h-screen bg-gradient-to-br from-pink-100 via-purple-100 to-red-100">
      <!-- Global Sticky Header -->
      <header class="sticky top-0 z-50 bg-gradient-to-r from-purple-600 via-pink-600 to-red-600 text-white shadow-lg">
        <div class="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <h1 class="text-3xl font-bold">💌 Love Letter</h1>
          </div>
          <div class="flex items-center gap-2">
            @if (isSpectator()) {
              <div class="text-right">
                <p class="text-xs opacity-90">Spectator Mode</p>
                <p class="text-lg font-bold">👁️ Watching</p>
              </div>
            } @else {
              <div class="text-right">
                <p class="text-xs opacity-90">Playing as</p>
                <p class="text-lg font-bold">{{ getMyPlayerName() }}</p>
              </div>
              <div class="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-xl font-bold">
                {{ getMyPlayerName().charAt(0).toUpperCase() }}
              </div>
            }
          </div>
        </div>
      </header>

      <!-- 3-Section Grid Container -->
      <div class="grid grid-cols-1 md:grid-cols-[300px_1fr] lg:grid-cols-[280px_1fr_340px] gap-4 max-w-[1600px] mx-auto p-4">

        <!-- LEFT SECTION: Players List -->
        <aside class="bg-white rounded-xl shadow-lg p-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] overflow-y-auto">
          <h2 class="text-xl font-bold text-gray-800 mb-4">Players</h2>
          <div class="space-y-3">
            @for (player of players(); track player.id) {
              <div
                class="bg-gray-50 rounded-lg p-3 border-2"
                [class.border-yellow-400]="isCurrentTurn(player)"
                [class.bg-yellow-50]="isCurrentTurn(player)"
                [class.border-gray-200]="!isCurrentTurn(player)"
                [class.opacity-50]="player.is_eliminated"
              >
                <!-- Player Header -->
                <div class="flex items-center space-x-3 mb-3">
                  <div class="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white font-bold text-lg shrink-0">
                    {{ player.player_name.charAt(0).toUpperCase() }}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                      <p class="font-bold text-gray-900 truncate text-base">{{ player.player_name }}</p>
                      @if (isMe(player)) {
                        <span class="bg-blue-500 text-white text-xs px-2 py-0.5 rounded font-bold shrink-0">YOU</span>
                      }
                    </div>
                    <!-- Coins/Tokens -->
                    <div class="flex items-center gap-2">
                      <span class="text-xs font-semibold text-gray-600">Coins:</span>
                      <div class="flex items-center gap-1">
                        <span class="text-lg font-bold text-purple-600">{{ player.tokens }}</span>
                        @for (token of [].constructor(player.tokens); track $index) {
                          <span class="text-sm">❤️</span>
                        }
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Status Badge -->
                @if (player.is_eliminated) {
                  <div class="bg-red-100 text-red-700 text-xs font-bold px-2 py-1.5 rounded text-center mb-2">
                    ❌ ELIMINATED
                  </div>
                } @else if (isCurrentTurn(player)) {
                  <div class="bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1.5 rounded text-center animate-pulse mb-2">
                    ⚡ ACTIVE TURN
                  </div>
                } @else if (isProtected(player)) {
                  <div class="bg-green-100 text-green-700 text-xs font-bold px-2 py-1.5 rounded text-center mb-2">
                    🛡️ PROTECTED
                  </div>
                } @else {
                  <div class="bg-gray-200 text-gray-600 text-xs font-bold px-2 py-1.5 rounded text-center mb-2">
                    ⏳ WAITING
                  </div>
                }

                <!-- Discarded Cards -->
                <div class="mt-2 pt-2 border-t border-gray-300">
                  <p class="text-xs font-semibold text-gray-700 mb-1.5">Discarded Cards:</p>
                  @if (getPlayerDiscards(player.player_id).length > 0) {
                    <div class="flex flex-wrap gap-1">
                      @for (card of getPlayerDiscards(player.player_id); track $index) {
                        <span class="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-semibold border border-purple-300">
                          {{ card }}
                        </span>
                      }
                    </div>
                  } @else {
                    <p class="text-xs text-gray-500 italic">None</p>
                  }
                </div>
              </div>
            }
          </div>
        </aside>

        <!-- MIDDLE SECTION: Game Desk -->
        <main class="bg-white rounded-xl shadow-lg overflow-hidden">
          <!-- Game Status Bar -->
          <div class="bg-gradient-to-r from-purple-50 to-pink-50 p-4 border-b">
            <div class="flex justify-center items-center">
              <div class="text-center">
                <p class="text-lg font-bold text-purple-900">Round {{ gameState()?.round_number || 1 }}</p>
                <p class="text-xs text-gray-600">Turn {{ gameState()?.turn_number || 1 }}</p>
              </div>
            </div>
          </div>

          <!-- Your Hand Area -->
          <div class="p-6">
            <!-- Deck and Discard Pile -->
            <div class="mb-8">
              <!-- Cards Remaining Counter -->
              <div class="text-center mb-4">
                <p class="text-sm text-gray-600 font-semibold">Cards Remaining</p>
                <p class="text-3xl font-bold text-purple-600">{{ gameState()?.deck?.length || 0 }}</p>
              </div>

              <div class="flex items-center justify-center gap-8">
                <!-- Draw Deck (Face Down) -->
                <div class="text-center">
                  <div class="relative">
                    <button
                      (click)="drawCard()"
                      [disabled]="!canDraw() || isSpectator()"
                      class="relative group transition-transform hover:scale-105 disabled:hover:scale-100"
                      [class.cursor-pointer]="canDraw() && !isSpectator()"
                      [class.cursor-not-allowed]="!canDraw() || isSpectator()"
                    >
                      <!-- Stacked deck effect -->
                      <div class="absolute top-1 left-1 w-32 h-44 bg-purple-400 rounded-lg opacity-60"></div>
                      <div class="absolute top-0.5 left-0.5 w-32 h-44 bg-purple-500 rounded-lg opacity-80"></div>

                      <!-- Main deck card -->
                      <div class="relative w-32 h-44 bg-gradient-to-br from-purple-600 to-pink-600 rounded-lg shadow-xl border-4 border-white flex items-center justify-center">
                        <div class="text-7xl">🃏</div>
                        @if (!canDraw()) {
                          <div class="absolute inset-0 bg-gray-900/50 rounded-lg flex items-center justify-center">
                            @if (hasDrawn()) {
                              <span class="text-white text-xs font-bold px-2 py-1 bg-green-600 rounded">✓ Drawn</span>
                            } @else if (!isMyTurn()) {
                              <span class="text-white text-xs font-bold px-2 py-1 bg-gray-600 rounded">Wait</span>
                            }
                          </div>
                        }
                      </div>
                    </button>
                  </div>
                  <p class="text-xs text-gray-600 mt-2 font-semibold">Draw Deck</p>
                </div>

              <!-- Discard Pile (Face Up) -->
              <div class="text-center">
                <div class="relative w-32 h-44">
                  @if (getLastDiscardedCard()) {
                    <!-- Stacked discard effect -->
                    <div class="absolute top-1 left-1 w-32 h-44 bg-gray-300 rounded-lg opacity-40"></div>
                    <div class="absolute top-0.5 left-0.5 w-32 h-44 bg-gray-200 rounded-lg opacity-60"></div>

                    <!-- Top card -->
                    <div class="relative w-32 h-44 bg-white rounded-lg shadow-xl border-4 border-purple-300 flex flex-col items-center justify-center">
                      <div class="text-3xl font-bold text-purple-600 mb-1">{{ getCardValue(getLastDiscardedCard()!) }}</div>
                      <div class="text-sm font-bold text-gray-800 px-2 text-center">{{ getLastDiscardedCard() }}</div>
                    </div>
                  } @else {
                    <!-- Empty discard pile -->
                    <div class="w-32 h-44 border-4 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
                      <div class="text-gray-400 text-center">
                        <div class="text-4xl mb-1">🗑️</div>
                        <div class="text-xs font-semibold">Empty</div>
                      </div>
                    </div>
                  }
                </div>
                <p class="text-xs text-gray-600 mt-2 font-semibold">Discard Pile</p>
              </div>
            </div>
            </div>

            @if (myHand()?.cards && myHand()!.cards.length > 0) {
              <div class="flex flex-wrap gap-4 justify-center">
                @for (card of myHand()!.cards; track $index) {
                  <app-card
                    [card]="card"
                    [selectable]="!isSpectator() && isMyTurn() && hasDrawn() && canSelectCard(card)"
                    [selected]="selectedCard() === card"
                    (cardClick)="selectCard(card)"
                  />
                }
              </div>

              <!-- Always Visible Status Message -->
              <div class="mt-4 px-4 py-3 rounded-lg text-center font-medium"
                [class.bg-purple-50]="isSpectator()"
                [class.border-purple-200]="isSpectator()"
                [class.text-purple-800]="isSpectator()"
                [class.bg-red-50]="!isSpectator() && isEliminated()"
                [class.border-red-200]="!isSpectator() && isEliminated()"
                [class.text-red-800]="!isSpectator() && isEliminated()"
                [class.bg-green-50]="!isSpectator() && isMyTurn() && !isEliminated()"
                [class.border-green-200]="!isSpectator() && isMyTurn() && !isEliminated()"
                [class.text-green-800]="!isSpectator() && isMyTurn() && !isEliminated()"
                [class.bg-blue-50]="!isSpectator() && !isMyTurn() && !isEliminated()"
                [class.border-blue-200]="!isSpectator() && !isMyTurn() && !isEliminated()"
                [class.text-blue-800]="!isSpectator() && !isMyTurn() && !isEliminated()"
                class="border">
                @if (isSpectator()) {
                  <span>👁️ Spectator Mode - Watching {{ getCurrentTurnPlayerName() }}'s turn</span>
                } @else if (isEliminated()) {
                  <span>❌ You've been eliminated - wait for next round</span>
                } @else if (isMyTurn() && !hasDrawn()) {
                  <span>🎯 Your turn - Draw a card to begin</span>
                } @else if (isMyTurn() && hasDrawn() && !selectedCard()) {
                  <span>🎯 Your turn - Select and play a card</span>
                } @else if (isMyTurn() && selectedCard()) {
                  <span>🎯 Your turn - Complete your card action</span>
                } @else {
                  <span>⏳ Waiting for {{ getCurrentTurnPlayerName() }}...</span>
                }
              </div>

              <!-- Always Visible Controls -->
              <div class="mt-6 space-y-4">
                <!-- Target Selection -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">
                    Select Target Player
                  </label>
                  <div class="grid grid-cols-2 gap-2">
                    @for (player of getAllPlayersWithMeFirst(); track player.id) {
                      <button
                        (click)="targetPlayer.set(player.player_id)"
                        [disabled]="player.is_eliminated || isSpectator()"
                        [class.ring-2]="targetPlayer() === player.player_id"
                        [class.ring-purple-500]="targetPlayer() === player.player_id"
                        [class.opacity-50]="player.is_eliminated || isSpectator()"
                        [class.cursor-not-allowed]="player.is_eliminated || isSpectator()"
                        class="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-all"
                      >
                        {{ player.player_name }}@if (isMe(player)) {
                          <span class="text-xs"> (You)</span>
                        }
                      </button>
                    }
                  </div>
                </div>

                <!-- Guard Card Guess -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">
                    Guess Their Card
                  </label>
                  <div class="grid grid-cols-3 gap-2">
                    @for (cardType of getGuessableCards(); track cardType) {
                      <button
                        (click)="guessCard.set(cardType)"
                        [disabled]="isSpectator()"
                        [class.ring-2]="guessCard() === cardType"
                        [class.ring-purple-500]="guessCard() === cardType"
                        [class.opacity-50]="isSpectator()"
                        [class.cursor-not-allowed]="isSpectator()"
                        class="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium text-sm"
                      >
                        {{ cardType }}
                      </button>
                    }
                  </div>
                </div>

                <!-- Play Button -->
                <div>
                  <button
                    (click)="playSelectedCard()"
                    [disabled]="!canPlayCard() || playing() || isSpectator()"
                    class="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors"
                  >
                    @if (isSpectator()) {
                      <span>Spectator Mode</span>
                    } @else if (playing()) {
                      <span>Playing...</span>
                    } @else {
                      <span>Play</span>
                    }
                  </button>
                </div>
              </div>
            } @else {
              <div class="text-center py-12 text-gray-500">
                @if (isEliminated()) {
                  <p class="text-xl">You've been eliminated this round!</p>
                  <p class="text-sm mt-2">Wait for the next round to continue playing.</p>
                } @else {
                  <p>Waiting for cards...</p>
                }
              </div>
            }
          </div>
        </main>

        <!-- RIGHT SECTION: Game Logs -->
        <aside class="bg-white rounded-xl shadow-lg overflow-hidden lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] md:col-span-2 lg:col-span-1">
          <div class="p-4 border-b bg-gray-50 sticky top-0">
            <h2 class="text-lg font-bold text-gray-800">Game Log</h2>
          </div>
          <div class="p-4 space-y-2 overflow-y-auto max-h-[calc(100vh-8rem)]">
            @for (action of recentActions(); track action.id) {
              <div class="text-xs bg-gray-50 p-2 rounded">
                <p class="font-medium">{{ getPlayerName(action.player_id) }}</p>
                <p class="text-gray-600">{{ formatAction(action) }}</p>
              </div>
            } @empty {
              <p class="text-gray-500 text-sm">No actions yet</p>
            }
          </div>
        </aside>
      </div>

      <!-- Error Messages and Overlays -->
      @if (error()) {
        <div class="col-span-1 md:col-span-2 lg:col-span-3">
          <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {{ error() }}
          </div>
        </div>
      }

      @if (waitingForNextRound) {
        <div class="col-span-1 md:col-span-2 lg:col-span-3">
          <div class="bg-gradient-to-r from-yellow-100 to-orange-100 border-4 border-yellow-400 rounded-2xl shadow-2xl p-6">
            <div class="text-center">
              <h2 class="text-3xl font-bold text-purple-900 mb-4">🏆 Round Over!</h2>
              @if (roundWinner) {
                <p class="text-xl mb-2">
                  {{ roundWinner.player_name }} won this round!
                </p>
                <p class="text-lg mb-6 text-gray-600">
                  Tokens: {{ roundWinner.tokens }} / {{ game()?.winning_tokens }}
                </p>
              }
              @if (isHost) {
                <button
                  (click)="startNextRound()"
                  [disabled]="startingNextRound()"
                  class="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-4 px-6 rounded-lg transition-colors shadow-lg"
                >
                  @if (startingNextRound()) {
                    <span>Starting Round {{ game()?.current_round }}...</span>
                  } @else {
                    <span>Start Round {{ game()?.current_round }}</span>
                  }
                </button>
              } @else {
                <div class="bg-blue-50 border-2 border-blue-400 text-blue-800 px-4 py-3 rounded-lg shadow-md">
                  <p class="font-semibold">Waiting for host to start Round {{ game()?.current_round }}...</p>
                </div>
              }
            </div>
          </div>
        </div>
      }

      @if (gameOver) {
          <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
              <h2 class="text-3xl font-bold text-purple-900 mb-4">🎉 Game Over!</h2>
              <p class="text-xl mb-6">
                {{ getWinnerName() }} wins!
              </p>
              <button
                (click)="returnToHome()"
                class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg"
              >
                Return to Home
              </button>
            </div>
          </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
  `]
})
export class GameComponent implements OnInit, OnDestroy {
  selectedCard = signal<CardType | null>(null);
  targetPlayer = signal<string | null>(null);
  guessCard = signal<CardType | null>(null);
  playing = signal(false);
  drawing = signal(false);
  error = signal('');

  private gameId: string | null = null;

  constructor(
    private gameService: GameService,
    private supabaseService: SupabaseService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  get game() {
    return this.gameService.currentGame;
  }

  get players() {
    return this.gameService.players;
  }

  get gameState() {
    return this.gameService.gameState;
  }

  get myHand() {
    return this.gameService.myHand;
  }

  get recentActions() {
    return this.gameService.recentActions;
  }

  get gameOver() {
    return this.game()?.status === 'finished';
  }

  get isHost() {
    const myId = this.supabaseService.getCurrentPlayerId();
    const me = this.players().find(p => p.player_id === myId);
    return me?.is_host || false;
  }

  get waitingForNextRound() {
    const game = this.game();
    const state = this.gameState();

    // We're waiting for next round if:
    // 1. Game is in progress
    // 2. Current round in game is higher than the round in game_state
    //    (meaning endRound was called but initializeRound wasn't)
    if (game?.status !== 'in_progress') return false;
    if (!game || !state) return false;

    return game.current_round > state.round_number;
  }

  get roundWinner() {
    const state = this.gameState();
    if (!state?.round_winner_id) return null;
    return this.players().find(p => p.player_id === state.round_winner_id);
  }

  startingNextRound = signal(false);

  async startNextRound(): Promise<void> {
    if (!this.gameId || !this.isHost) return;

    this.startingNextRound.set(true);
    this.error.set('');

    try {
      await this.gameService.startNextRound(this.gameId);

      // Reload game data
      await this.gameService.loadGameData(this.gameId);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to start next round');
    } finally {
      this.startingNextRound.set(false);
    }
  }

  async ngOnInit(): Promise<void> {
    this.gameId = this.route.snapshot.paramMap.get('id');

    if (!this.gameId) {
      this.router.navigate(['/']);
      return;
    }

    // Load game data and subscribe to real-time updates
    try {
      await this.gameService.loadGameData(this.gameId);
      this.gameService.subscribeToGame(this.gameId);
    } catch (err) {
      console.error('Failed to load game data:', err);
      this.error.set('Failed to load game data');
    }

    // Check if game is finished
    const game = this.game();
    if (game?.status === 'waiting') {
      // Game hasn't started yet, go back to lobby
      this.router.navigate(['/lobby', this.gameId]);
    }
  }

  ngOnDestroy(): void {
    this.gameService.unsubscribe();
  }

  isMyTurn(): boolean {
    const state = this.gameState();
    const myId = this.supabaseService.getCurrentPlayerId();
    return state?.current_turn_player_id === myId;
  }

  isCurrentTurn(player: GamePlayer): boolean {
    const state = this.gameState();
    return state?.current_turn_player_id === player.player_id;
  }

  isProtected(player: GamePlayer): boolean {
    const state = this.gameState();
    if (!state) return false;

    // Check if player's hand is protected (from Handmaid)
    // We need to get this from the game state or player data
    // For now, we'll check if the player has Handmaid protection
    // This should be stored in player_hands.is_protected, but we need access to it

    // TODO: This needs to be exposed in a public way since we can't access other players' hands
    // For now, return false until we add is_protected to game_players table
    return false;
  }

  isMe(player: GamePlayer): boolean {
    const myId = this.supabaseService.getCurrentPlayerId();
    return player.player_id === myId;
  }

  getMyPlayerName(): string {
    const myId = this.supabaseService.getCurrentPlayerId();
    const me = this.players().find(p => p.player_id === myId);
    return me?.player_name || 'Guest';
  }

  getAllPlayersWithMeFirst(): GamePlayer[] {
    const myId = this.supabaseService.getCurrentPlayerId();
    const allPlayers = this.players();

    // Sort so current player is first
    return [...allPlayers].sort((a, b) => {
      if (a.player_id === myId) return -1;
      if (b.player_id === myId) return 1;
      return 0;
    });
  }

  isSpectator(): boolean {
    const myId = this.supabaseService.getCurrentPlayerId();
    const me = this.players().find(p => p.player_id === myId);
    return !me; // Spectator if not in players list
  }

  isEliminated(): boolean {
    const myId = this.supabaseService.getCurrentPlayerId();
    const me = this.players().find(p => p.player_id === myId);
    return me?.is_eliminated || false;
  }

  hasDrawn(): boolean {
    const hand = this.myHand();
    // If you have 2 cards, you've already drawn
    return hand ? hand.cards.length >= 2 : false;
  }

  canDraw(): boolean {
    return this.isMyTurn() && !this.hasDrawn() && !this.drawing();
  }

  async drawCard(): Promise<void> {
    if (!this.gameId || !this.isMyTurn() || this.hasDrawn() || this.drawing()) return;

    this.drawing.set(true);
    this.error.set('');

    try {
      const state = this.gameState();
      const myId = this.supabaseService.getCurrentPlayerId();

      if (!state) {
        throw new Error('No active game state');
      }

      await this.gameService.drawCardForPlayer(this.gameId, state.round_number, myId);

      // Reload game data to see the new card
      await this.gameService.loadGameData(this.gameId);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to draw card');
    } finally {
      this.drawing.set(false);
    }
  }

  canSelectCard(card: CardType): boolean {
    const hand = this.myHand();
    if (!hand) return true;

    // Countess rule: Can't select King or Prince if you have Countess
    if (hand.cards.includes('Countess') &&
        (card === 'King' || card === 'Prince')) {
      return false;
    }

    return true;
  }

  selectCard(card: CardType): void {
    if (!this.canSelectCard(card)) return;

    this.selectedCard.set(card);
    this.targetPlayer.set(null);
    this.guessCard.set(null);

    // Auto-select target if there's only one valid option
    const validTargets = this.getValidTargets();
    if (validTargets.length === 1) {
      this.targetPlayer.set(validTargets[0].player_id);
    }
  }

  cancelSelection(): void {
    this.selectedCard.set(null);
    this.targetPlayer.set(null);
    this.guessCard.set(null);
  }

  needsTarget(): boolean {
    const card = this.selectedCard();
    return card !== 'Handmaid' && card !== 'Countess' && card !== 'Princess';
  }

  getValidTargets(): GamePlayer[] {
    const myId = this.supabaseService.getCurrentPlayerId();
    const card = this.selectedCard();

    return this.players().filter(p => {
      if (p.is_eliminated) return false;
      if (this.isProtected(p)) return false;

      // Prince can target yourself, other cards cannot
      if (card === 'Prince') return true;

      return p.player_id !== myId;
    });
  }

  getGuessableCards(): CardType[] {
    return ['Guard', 'Priest', 'Baron', 'Handmaid', 'Prince', 'King', 'Countess', 'Princess'];
  }

  canPlayCard(): boolean {
    const card = this.selectedCard();
    if (!card) return false;

    if (this.needsTarget()) {
      if (!this.targetPlayer()) return false;
      if (card === 'Guard' && !this.guessCard()) return false;
    }

    return true;
  }

  async playSelectedCard(): Promise<void> {
    if (!this.canPlayCard() || !this.gameId) return;

    this.playing.set(true);
    this.error.set('');

    try {
      await this.gameService.playCard({
        game_id: this.gameId,
        card: this.selectedCard()!,
        target_player_id: this.targetPlayer() || undefined,
        guess_card: this.guessCard() || undefined
      });

      this.cancelSelection();
    } catch (err: any) {
      this.error.set(err.message || 'Failed to play card');
    } finally {
      this.playing.set(false);
    }
  }

  getPlayerName(playerId: string): string {
    const player = this.players().find(p => p.player_id === playerId);
    return player?.player_name || 'Unknown';
  }

  getCurrentTurnPlayerName(): string {
    const state = this.gameState();
    if (!state?.current_turn_player_id) return 'Unknown';
    return this.getPlayerName(state.current_turn_player_id);
  }

  formatAction(action: any): string {
    const myId = this.supabaseService.getCurrentPlayerId();
    const playerName = this.getPlayerName(action.player_id);
    const targetName = action.target_player_id ? this.getPlayerName(action.target_player_id) : '';

    // Check if I'm involved in this action
    const isInvolved = action.player_id === myId || action.target_player_id === myId;

    // If action has a detailed message in details, use that as base
    if (action.details?.message) {
      let message = action.details.message;

      // Add secret information only for involved players
      if (isInvolved) {
        // Priest: Show revealed card to the player who played it
        if (action.card_played === 'Priest' && action.player_id === myId && action.details?.revealed_card && !action.details?.target_protected) {
          message += ` [You saw: ${action.details.revealed_card}]`;
        }

        // Baron: Show card values to involved players
        if (action.card_played === 'Baron' && action.details?.baron_result && !action.details?.target_protected) {
          const result = action.details.baron_result;
          const myCard = result.myCard;
          const theirCard = result.theirCard;
          message += ` [${playerName}: ${myCard}, ${targetName}: ${theirCard}]`;
        }

        // Prince: Show discarded card to involved players (unless it was Princess - already public)
        if (action.card_played === 'Prince' && action.details?.discarded_card && action.details.discarded_card !== 'Princess' && !action.details?.target_protected) {
          message += ` [Discarded: ${action.details.discarded_card}]`;
        }
      }

      return message;
    }

    // Fallback to old formatting for backwards compatibility

    switch (action.card_played) {
      case 'Guard':
        if (action.details?.target_protected) {
          return `${playerName} played Guard on ${targetName} - No effect (protected)`;
        }
        const guess = action.details?.guess_card || 'Unknown';
        return `${playerName} played Guard on ${targetName}, guessed ${guess}`;

      case 'Priest':
        if (action.details?.target_protected) {
          return `${playerName} played Priest on ${targetName} - No effect (protected)`;
        }
        if (action.player_id === myId && action.details?.revealed_card) {
          return `${playerName} played Priest on ${targetName} - Saw: ${action.details.revealed_card}`;
        }
        return `${playerName} played Priest on ${targetName}`;

      case 'Baron':
        if (action.details?.target_protected) {
          return `${playerName} played Baron on ${targetName} - No effect (protected)`;
        }
        if (action.details?.baron_result) {
          const result = action.details.baron_result;
          const myCard = result.myCard;
          const theirCard = result.theirCard;
          if (result.winner === null) {
            return `${playerName} (${myCard}) vs ${targetName} (${theirCard}) - Tie!`;
          } else {
            const winnerName = this.getPlayerName(result.winner);
            const loserName = result.winner === action.player_id ? targetName : playerName;
            return `${playerName} (${myCard}) vs ${targetName} (${theirCard}) - ${winnerName} wins, ${loserName} eliminated`;
          }
        }
        return `${playerName} played Baron on ${targetName}`;

      case 'Handmaid':
        return `${playerName} played Handmaid - Protected until next turn 🛡️`;

      case 'Prince':
        if (action.details?.target_protected) {
          return `${playerName} played Prince on ${targetName} - No effect (protected)`;
        }
        if (action.player_id === action.target_player_id) {
          return `${playerName} played Prince on themselves`;
        }
        return `${playerName} played Prince on ${targetName}`;

      case 'King':
        if (action.details?.target_protected) {
          return `${playerName} played King on ${targetName} - No effect (protected)`;
        }
        return `${playerName} played King on ${targetName} - Swapped hands`;

      case 'Princess':
        return `${playerName} played Princess - Eliminated! 💀`;

      case 'Countess':
        return `${playerName} played Countess`;

      default:
        return `${playerName} played ${action.card_played}`;
    }
  }

  getWinnerName(): string {
    const game = this.game();
    if (!game?.winner_id) return '';
    return this.getPlayerName(game.winner_id);
  }

  returnToHome(): void {
    this.router.navigate(['/']);
  }

  getPlayerDiscards(playerId: string): CardType[] {
    const actions = this.recentActions();
    const discards: CardType[] = [];

    actions.forEach(action => {
      // Cards this player played
      if (action.player_id === playerId && action.card_played) {
        discards.push(action.card_played);
      }

      // Cards forced to discard by Prince (target was this player)
      if (action.card_played === 'Prince' &&
          action.target_player_id === playerId &&
          action.details?.['discarded_card']) {
        discards.push(action.details['discarded_card']);
      }
    });

    return discards;
  }

  getLastDiscardedCard(): CardType | null {
    // Get the most recent card played by any player
    const actions = this.recentActions();

    // Find the most recent play_card action
    for (let i = actions.length - 1; i >= 0; i--) {
      const action = actions[i];
      if (action.card_played) {
        return action.card_played;
      }
    }

    return null;
  }

  getCardValue(card: CardType): number {
    const values: Record<CardType, number> = {
      'Guard': 1,
      'Priest': 2,
      'Baron': 3,
      'Handmaid': 4,
      'Prince': 5,
      'King': 6,
      'Countess': 7,
      'Princess': 8
    };
    return values[card];
  }
}
