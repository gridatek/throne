import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardType, CARD_VALUES, CARD_DESCRIPTIONS } from '../models/game.models';

@Component({
  selector: 'app-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="card-container"
      [class.selectable]="selectable"
      [class.selected]="selected"
      (click)="onCardClick()"
    >
      <div class="card" [class]="getCardClass()">
        <div class="card-value">{{ getValue() }}</div>
        <div class="card-name">{{ card }}</div>
        @if (showDescription) {
          <div class="card-description">{{ getDescription() }}</div>
        }
        <div class="card-icon">{{ getIcon() }}</div>
      </div>
    </div>
  `,
  styles: [`
    .card-container {
      display: inline-block;
      transition: transform 0.2s;
    }

    .card-container.selectable {
      cursor: pointer;
    }

    .card-container.selectable:hover {
      transform: translateY(-8px);
    }

    .card-container.selected {
      transform: translateY(-12px);
    }

    .card {
      width: 140px;
      height: 200px;
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
      overflow: hidden;
    }

    .card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 100%);
      pointer-events: none;
    }

    .card-value {
      font-size: 32px;
      font-weight: bold;
      color: white;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
    }

    .card-name {
      font-size: 18px;
      font-weight: bold;
      color: white;
      text-shadow: 1px 1px 2px rgba(0,0,0,0.3);
      text-align: center;
    }

    .card-description {
      font-size: 11px;
      color: white;
      opacity: 0.9;
      text-align: center;
      line-height: 1.3;
    }

    .card-icon {
      font-size: 48px;
      text-align: center;
      filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.2));
    }

    .card-guard {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }

    .card-priest {
      background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    }

    .card-baron {
      background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
    }

    .card-handmaid {
      background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
    }

    .card-prince {
      background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
    }

    .card-king {
      background: linear-gradient(135deg, #ffd89b 0%, #19547b 100%);
    }

    .card-countess {
      background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);
    }

    .card-princess {
      background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%);
    }

    .card-container.selected .card {
      box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2), 0 0 0 3px #fbbf24;
    }
  `]
})
export class CardComponent {
  @Input() card!: CardType;
  @Input() selectable = false;
  @Input() selected = false;
  @Input() showDescription = true;

  @Output() cardClick = new EventEmitter<CardType>();

  getValue(): number {
    return CARD_VALUES[this.card];
  }

  getDescription(): string {
    return CARD_DESCRIPTIONS[this.card];
  }

  getCardClass(): string {
    return `card-${this.card.toLowerCase()}`;
  }

  getIcon(): string {
    const icons: Record<CardType, string> = {
      'Guard': '🛡️',
      'Priest': '⛪',
      'Baron': '🎩',
      'Handmaid': '👸',
      'Prince': '🤴',
      'King': '👑',
      'Countess': '💃',
      'Princess': '👰'
    };
    return icons[this.card];
  }

  onCardClick(): void {
    if (this.selectable) {
      this.cardClick.emit(this.card);
    }
  }
}
