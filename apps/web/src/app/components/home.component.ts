import { Component, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GameService } from '../services/game.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-gradient-to-br from-pink-100 via-purple-100 to-red-100 flex items-center justify-center p-4">
      <div class="max-w-md w-full">
        <!-- Logo/Title -->
        <div class="text-center mb-8">
          <h1 class="text-5xl font-bold text-purple-900 mb-2">💌 Love Letter</h1>
          <p class="text-gray-700">Win the Princess's heart through cunning and luck!</p>
        </div>

        <!-- Main Card -->
        <div class="bg-white rounded-2xl shadow-2xl p-8">
          @if (!showJoinForm()) {
            <!-- Create Game Section -->
            <div class="space-y-4">
              <h2 class="text-2xl font-bold text-gray-800 mb-4">Create a New Game</h2>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Your Name</label>
                <input
                  type="text"
                  [(ngModel)]="playerName"
                  placeholder="Enter your name"
                  class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  maxlength="20"
                />
              </div>

              <button
                (click)="createGame()"
                [disabled]="!playerName() || creating()"
                class="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-bold py-3 px-4 rounded-lg transition-colors"
              >
                @if (creating()) {
                  <span>Creating...</span>
                } @else {
                  <span>🎮 Create Game</span>
                }
              </button>

              <div class="relative my-6">
                <div class="absolute inset-0 flex items-center">
                  <div class="w-full border-t border-gray-300"></div>
                </div>
                <div class="relative flex justify-center text-sm">
                  <span class="px-2 bg-white text-gray-500">or</span>
                </div>
              </div>

              <button
                (click)="showJoinForm.set(true)"
                class="w-full bg-white hover:bg-gray-50 border-2 border-purple-600 text-purple-600 font-bold py-3 px-4 rounded-lg transition-colors"
              >
                🚪 Join Existing Game
              </button>
            </div>
          } @else {
            <!-- Join Game Section -->
            <div class="space-y-4">
              <div class="flex items-center justify-between mb-4">
                <h2 class="text-2xl font-bold text-gray-800">Join a Game</h2>
                <button
                  (click)="showJoinForm.set(false)"
                  class="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Your Name</label>
                <input
                  type="text"
                  [(ngModel)]="playerName"
                  placeholder="Enter your name"
                  class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  maxlength="20"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Room Code</label>
                <input
                  type="text"
                  [(ngModel)]="roomCode"
                  placeholder="Enter 6-digit code"
                  class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent uppercase text-center text-2xl tracking-widest font-mono"
                  maxlength="6"
                  (input)="roomCode.set(roomCode().toUpperCase())"
                />
              </div>

              @if (error()) {
                <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                  {{ error() }}
                </div>
              }

              <button
                (click)="joinGame()"
                [disabled]="!playerName() || !roomCode() || joining()"
                class="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-bold py-3 px-4 rounded-lg transition-colors"
              >
                @if (joining()) {
                  <span>Joining...</span>
                } @else {
                  <span>🎮 Join Game</span>
                }
              </button>
            </div>
          }
        </div>

        <!-- Game Rules -->
        <div class="mt-8 bg-white bg-opacity-80 rounded-lg p-6">
          <h3 class="text-lg font-bold text-gray-800 mb-3">How to Play</h3>
          <ul class="text-sm text-gray-700 space-y-2">
            <li>🎯 Win tokens by being the last player standing or having the highest card</li>
            <li>🃏 Each turn, draw a card and play one of your two cards</li>
            <li>💫 Use card effects strategically to eliminate opponents</li>
            <li>👑 First to collect enough tokens wins the game!</li>
          </ul>
        </div>
      </div>
    </div>
  `,
  styles: [`
    input:focus, select:focus, button:focus {
      outline: none;
    }
  `]
})
export class HomeComponent {
  playerName = signal('');
  roomCode = signal('');
  showJoinForm = signal(false);
  creating = signal(false);
  joining = signal(false);
  error = signal('');

  constructor(
    private gameService: GameService,
    private router: Router
  ) {}

  async createGame(): Promise<void> {
    if (!this.playerName()) return;

    this.creating.set(true);
    this.error.set('');

    try {
      const game = await this.gameService.createGame({
        player_name: this.playerName(),
        max_players: 4 // Support 2-4 players
      });

      // Navigate to lobby
      this.router.navigate(['/lobby', game.id]);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to create game');
    } finally {
      this.creating.set(false);
    }
  }

  async joinGame(): Promise<void> {
    if (!this.playerName() || !this.roomCode()) return;

    this.joining.set(true);
    this.error.set('');

    try {
      const game = await this.gameService.joinGame({
        room_code: this.roomCode(),
        player_name: this.playerName()
      });

      // Navigate to lobby
      this.router.navigate(['/lobby', game.id]);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to join game');
    } finally {
      this.joining.set(false);
    }
  }
}
