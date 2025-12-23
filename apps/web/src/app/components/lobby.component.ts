import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { GameService } from '../services/game.service';
import { SupabaseService } from '../services/supabase.service';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-gradient-to-br from-pink-100 via-purple-100 to-red-100 p-4">
      <div class="max-w-4xl mx-auto">
        <!-- Header -->
        <div class="text-center mb-8 mt-8">
          <h1 class="text-4xl font-bold text-purple-900 mb-2">💌 Game Lobby</h1>

          @if (game()) {
            <div class="bg-white rounded-lg shadow-lg inline-block px-8 py-4 mt-4">
              <p class="text-sm text-gray-600 mb-2">Room Code</p>
              <p class="text-4xl font-bold font-mono tracking-widest text-purple-600">
                {{ game()!.room_code }}
              </p>
              <p class="text-xs text-gray-500 mt-2">Share this code with friends!</p>
            </div>
          }
        </div>

        <!-- Main Content -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Players List -->
          <div class="bg-white rounded-2xl shadow-xl p-6">
            <div class="flex justify-between items-center mb-4">
              <h2 class="text-2xl font-bold text-gray-800">Players</h2>
              <span class="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm font-medium">
                {{ players().length }} / {{ game()?.max_players }}
              </span>
            </div>

            <div class="space-y-3">
              @for (player of players(); track player.id) {
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div class="flex items-center space-x-3">
                    <div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white font-bold">
                      {{ player.player_name.charAt(0).toUpperCase() }}
                    </div>
                    <div>
                      <p class="font-medium text-gray-900">{{ player.player_name }}</p>
                      @if (player.is_host) {
                        <p class="text-xs text-purple-600">👑 Host</p>
                      }
                    </div>
                  </div>

                  @if (player.tokens > 0) {
                    <div class="flex items-center space-x-1">
                      @for (token of [].constructor(player.tokens); track $index) {
                        <span class="text-red-500">❤️</span>
                      }
                    </div>
                  }
                </div>
              } @empty {
                <p class="text-gray-500 text-center py-8">Waiting for players...</p>
              }
            </div>

            <!-- Start Button (only for host) -->
            @if (isHost()) {
              <div class="mt-6">
                <button
                  (click)="startGame()"
                  [disabled]="!canStart() || starting()"
                  class="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                >
                  @if (starting()) {
                    <span>Starting...</span>
                  } @else {
                    <span>🚀 Start Game</span>
                  }
                </button>
                @if (!canStart()) {
                  <p class="text-sm text-yellow-600 text-center mt-2">Need at least 2 players to start</p>
                }
              </div>
            } @else {
              <div class="mt-6 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg text-sm text-center">
                Waiting for host to start the game...
              </div>
            }
          </div>

          <!-- Game Info -->
          <div class="space-y-6">
            <!-- Game Settings -->
            <div class="bg-white rounded-2xl shadow-xl p-6">
              <h2 class="text-2xl font-bold text-gray-800 mb-4">Game Settings</h2>

              <div class="space-y-3">
                <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span class="text-gray-700">Max Players</span>
                  <span class="font-bold text-purple-600">{{ game()?.max_players }}</span>
                </div>

                <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span class="text-gray-700">Tokens to Win</span>
                  <span class="font-bold text-purple-600">{{ game()?.winning_tokens }} ❤️</span>
                </div>

                <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span class="text-gray-700">Status</span>
                  <span class="font-bold" [class]="getStatusClass()">
                    {{ getStatusText() }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Card Reference -->
            <div class="bg-white rounded-2xl shadow-xl p-6">
              <h3 class="text-xl font-bold text-gray-800 mb-4">Card Reference</h3>

              <div class="space-y-2 text-sm">
                <div class="flex items-start space-x-2">
                  <span class="font-bold text-purple-600 min-w-[20px]">8</span>
                  <span class="font-medium">Princess:</span>
                  <span class="text-gray-600">Lose if discarded</span>
                </div>

                <div class="flex items-start space-x-2">
                  <span class="font-bold text-purple-600 min-w-[20px]">7</span>
                  <span class="font-medium">Countess:</span>
                  <span class="text-gray-600">Discard if King/Prince in hand</span>
                </div>

                <div class="flex items-start space-x-2">
                  <span class="font-bold text-purple-600 min-w-[20px]">6</span>
                  <span class="font-medium">King:</span>
                  <span class="text-gray-600">Trade hands</span>
                </div>

                <div class="flex items-start space-x-2">
                  <span class="font-bold text-purple-600 min-w-[20px]">5</span>
                  <span class="font-medium">Prince:</span>
                  <span class="text-gray-600">Discard & draw</span>
                </div>

                <div class="flex items-start space-x-2">
                  <span class="font-bold text-purple-600 min-w-[20px]">4</span>
                  <span class="font-medium">Handmaid:</span>
                  <span class="text-gray-600">Protected until next turn</span>
                </div>

                <div class="flex items-start space-x-2">
                  <span class="font-bold text-purple-600 min-w-[20px]">3</span>
                  <span class="font-medium">Baron:</span>
                  <span class="text-gray-600">Compare hands</span>
                </div>

                <div class="flex items-start space-x-2">
                  <span class="font-bold text-purple-600 min-w-[20px]">2</span>
                  <span class="font-medium">Priest:</span>
                  <span class="text-gray-600">Look at hand</span>
                </div>

                <div class="flex items-start space-x-2">
                  <span class="font-bold text-purple-600 min-w-[20px]">1</span>
                  <span class="font-medium">Guard:</span>
                  <span class="text-gray-600">Guess card</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        @if (error()) {
          <div class="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {{ error() }}
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
export class LobbyComponent implements OnInit, OnDestroy {
  starting = signal(false);
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
      console.error('Failed to load lobby data:', err);
      this.error.set('Failed to load game data');
    }

    // Check if game is already in progress
    const game = this.game();
    if (game?.status === 'in_progress') {
      this.router.navigate(['/game', this.gameId]);
    }
  }

  ngOnDestroy(): void {
    // Cleanup handled by service
  }

  isHost(): boolean {
    const currentPlayerId = this.supabaseService.getCurrentPlayerId();
    const players = this.players();
    const me = players.find(p => p.player_id === currentPlayerId);
    return me?.is_host || false;
  }

  canStart(): boolean {
    return this.players().length >= 2;
  }

  async startGame(): Promise<void> {
    if (!this.gameId || !this.canStart()) return;

    this.starting.set(true);
    this.error.set('');

    try {
      await this.gameService.startGame(this.gameId);
      // Navigate to game
      this.router.navigate(['/game', this.gameId]);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to start game');
    } finally {
      this.starting.set(false);
    }
  }

  getStatusText(): string {
    const status = this.game()?.status;
    switch (status) {
      case 'waiting':
        return 'Waiting';
      case 'in_progress':
        return 'In Progress';
      case 'finished':
        return 'Finished';
      default:
        return 'Unknown';
    }
  }

  getStatusClass(): string {
    const status = this.game()?.status;
    switch (status) {
      case 'waiting':
        return 'text-yellow-600';
      case 'in_progress':
        return 'text-green-600';
      case 'finished':
        return 'text-gray-600';
      default:
        return 'text-gray-600';
    }
  }
}
