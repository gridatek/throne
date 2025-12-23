import { Component, OnInit, signal, computed } from '@angular/core';
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
    <div class="min-h-screen bg-gradient-to-br from-pink-100 via-purple-100 to-red-100 p-4">
      <div class="max-w-7xl mx-auto">
        <!-- Header -->
        <div class="bg-white rounded-xl shadow-lg p-4 mb-4">
          <div class="flex justify-between items-center">
            <div>
              <h1 class="text-2xl font-bold text-purple-900">💌 Love Letter</h1>
              <p class="text-sm text-gray-600">Round {{ gameState()?.round_number || 1 }}</p>
            </div>

            <div class="text-right">
              <p class="text-sm text-gray-600">Deck</p>
              <p class="text-2xl font-bold text-purple-600">{{ gameState()?.deck?.length || 0 }} 🃏</p>
            </div>
          </div>
        </div>

        <!-- Players -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          @for (player of players(); track player.id) {
            <div
              class="bg-white rounded-xl shadow-lg p-4"
              [class.ring-4]="isCurrentTurn(player)"
              [class.ring-yellow-400]="isCurrentTurn(player)"
              [class.opacity-50]="player.is_eliminated"
            >
              <div class="flex items-center space-x-3 mb-2">
                <div class="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white font-bold text-lg">
                  {{ player.player_name.charAt(0).toUpperCase() }}
                </div>
                <div class="flex-1">
                  <p class="font-bold text-gray-900">{{ player.player_name }}</p>
                  <div class="flex items-center space-x-1">
                    @for (token of [].constructor(player.tokens); track $index) {
                      <span class="text-sm">❤️</span>
                    }
                  </div>
                </div>
              </div>

              @if (player.is_eliminated) {
                <div class="bg-red-100 text-red-700 text-xs font-medium px-2 py-1 rounded text-center">
                  Eliminated
                </div>
              } @else if (isCurrentTurn(player)) {
                <div class="bg-yellow-100 text-yellow-700 text-xs font-medium px-2 py-1 rounded text-center animate-pulse">
                  Current Turn
                </div>
              } @else if (isProtected(player)) {
                <div class="bg-green-100 text-green-700 text-xs font-medium px-2 py-1 rounded text-center">
                  Protected 🛡️
                </div>
              }
            </div>
          }
        </div>

        <!-- Game Area -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- My Hand -->
          <div class="lg:col-span-2">
            <div class="bg-white rounded-xl shadow-lg p-6">
              <h2 class="text-xl font-bold text-gray-800 mb-4">Your Hand</h2>

              @if (myHand()?.cards && myHand()!.cards.length > 0) {
                <div class="flex flex-wrap gap-4 justify-center">
                  @for (card of myHand()!.cards; track $index) {
                    <app-card
                      [card]="card"
                      [selectable]="isMyTurn() && !selectedCard()"
                      [selected]="selectedCard() === card"
                      (cardClick)="selectCard(card)"
                    />
                  }
                </div>

                @if (selectedCard()) {
                  <div class="mt-6 space-y-4">
                    <!-- Target Selection -->
                    @if (needsTarget()) {
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">
                          Select Target Player
                        </label>
                        <div class="grid grid-cols-2 gap-2">
                          @for (player of getValidTargets(); track player.id) {
                            <button
                              (click)="targetPlayer.set(player.player_id)"
                              [class.ring-2]="targetPlayer() === player.player_id"
                              [class.ring-purple-500]="targetPlayer() === player.player_id"
                              class="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium"
                            >
                              {{ player.player_name }}
                            </button>
                          }
                        </div>
                      </div>
                    }

                    <!-- Guard Card Guess -->
                    @if (selectedCard() === 'Guard' && targetPlayer()) {
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">
                          Guess Their Card
                        </label>
                        <div class="grid grid-cols-3 gap-2">
                          @for (cardType of getGuessableCards(); track cardType) {
                            <button
                              (click)="guessCard.set(cardType)"
                              [class.ring-2]="guessCard() === cardType"
                              [class.ring-purple-500]="guessCard() === cardType"
                              class="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium text-sm"
                            >
                              {{ cardType }}
                            </button>
                          }
                        </div>
                      </div>
                    }

                    <!-- Play Button -->
                    <div class="flex space-x-2">
                      <button
                        (click)="playSelectedCard()"
                        [disabled]="!canPlayCard() || playing()"
                        class="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                      >
                        @if (playing()) {
                          <span>Playing...</span>
                        } @else {
                          <span>Play Card</span>
                        }
                      </button>

                      <button
                        (click)="cancelSelection()"
                        class="px-6 bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-3 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                }
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

              @if (!isMyTurn() && !isEliminated()) {
                <div class="mt-4 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg text-center">
                  Waiting for other players...
                </div>
              }
            </div>
          </div>

          <!-- Sidebar -->
          <div class="space-y-4">
            <!-- Discard Pile -->
            <div class="bg-white rounded-xl shadow-lg p-4">
              <h3 class="text-lg font-bold text-gray-800 mb-3">Discard Pile</h3>
              @if (gameState()?.discard_pile && gameState()!.discard_pile.length > 0) {
                <div class="flex flex-wrap gap-2">
                  @for (card of gameState()!.discard_pile; track $index) {
                    <span class="px-2 py-1 bg-gray-100 rounded text-sm">
                      {{ card }}
                    </span>
                  }
                </div>
              } @else {
                <p class="text-gray-500 text-sm">Empty</p>
              }
            </div>

            <!-- Recent Actions -->
            <div class="bg-white rounded-xl shadow-lg p-4">
              <h3 class="text-lg font-bold text-gray-800 mb-3">Recent Actions</h3>
              <div class="space-y-2 max-h-64 overflow-y-auto">
                @for (action of recentActions(); track action.id) {
                  <div class="text-xs bg-gray-50 p-2 rounded">
                    <p class="font-medium">{{ getPlayerName(action.player_id) }}</p>
                    <p class="text-gray-600">{{ formatAction(action) }}</p>
                  </div>
                } @empty {
                  <p class="text-gray-500 text-sm">No actions yet</p>
                }
              </div>
            </div>
          </div>
        </div>

        @if (error()) {
          <div class="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {{ error() }}
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
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
  `]
})
export class GameComponent implements OnInit {
  selectedCard = signal<CardType | null>(null);
  targetPlayer = signal<string | null>(null);
  guessCard = signal<CardType | null>(null);
  playing = signal(false);
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

  ngOnInit(): void {
    this.gameId = this.route.snapshot.paramMap.get('id');
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
    // This would need to be tracked in player_hands table
    return false; // Simplified for now
  }

  isEliminated(): boolean {
    const myId = this.supabaseService.getCurrentPlayerId();
    const me = this.players().find(p => p.player_id === myId);
    return me?.is_eliminated || false;
  }

  selectCard(card: CardType): void {
    this.selectedCard.set(card);
    this.targetPlayer.set(null);
    this.guessCard.set(null);
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
    return this.players().filter(p =>
      !p.is_eliminated &&
      p.player_id !== myId &&
      !this.isProtected(p)
    );
  }

  getGuessableCards(): CardType[] {
    return ['Priest', 'Baron', 'Handmaid', 'Prince', 'King', 'Countess', 'Princess'];
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

  formatAction(action: any): string {
    let text = `Played ${action.card_played}`;
    if (action.target_player_id) {
      text += ` on ${this.getPlayerName(action.target_player_id)}`;
    }
    return text;
  }

  getWinnerName(): string {
    const game = this.game();
    if (!game?.winner_id) return '';
    return this.getPlayerName(game.winner_id);
  }

  returnToHome(): void {
    this.router.navigate(['/']);
  }
}
