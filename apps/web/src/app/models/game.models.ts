// Card types in Love Letter
export type CardType =
  | 'Guard'      // 1 - Guess opponent's card
  | 'Priest'     // 2 - Look at opponent's hand
  | 'Baron'      // 3 - Compare hands, lower eliminated
  | 'Handmaid'   // 4 - Protection until next turn
  | 'Prince'     // 5 - Force discard and draw
  | 'King'       // 6 - Swap hands
  | 'Countess'   // 7 - Must discard if Prince or King in hand
  | 'Princess';  // 8 - Eliminated if discarded

export const CARD_VALUES: Record<CardType, number> = {
  'Guard': 1,
  'Priest': 2,
  'Baron': 3,
  'Handmaid': 4,
  'Prince': 5,
  'King': 6,
  'Countess': 7,
  'Princess': 8
};

export const CARD_DESCRIPTIONS: Record<CardType, string> = {
  'Guard': 'Guess a player\'s card (not Guard). If correct, they are eliminated.',
  'Priest': 'Look at another player\'s hand.',
  'Baron': 'Compare hands with another player. Lower value is eliminated.',
  'Handmaid': 'You are protected until your next turn.',
  'Prince': 'Choose a player (may be yourself) to discard and draw a new card.',
  'King': 'Trade hands with another player.',
  'Countess': 'Must discard if Prince or King is in your hand.',
  'Princess': 'If you discard this card, you are eliminated.'
};

export interface Card {
  type: CardType;
  value: number;
  description: string;
}

export type GameStatus = 'waiting' | 'in_progress' | 'finished';

export interface Game {
  id: string;
  room_code: string;
  status: GameStatus;
  max_players: number;
  current_round: number;
  winning_tokens: number;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  winner_id?: string;
  created_by: string;
}

export interface GamePlayer {
  id: string;
  game_id: string;
  player_id: string;
  player_name: string;
  is_host: boolean;
  tokens: number;
  is_eliminated: boolean;
  join_order: number;
  joined_at: string;
}

export interface GameState {
  id: string;
  game_id: string;
  round_number: number;
  current_turn_player_id: string;
  turn_number: number;
  deck: CardType[];
  discard_pile: CardType[];
  set_aside_card?: CardType;
  round_winner_id?: string;
  created_at: string;
  updated_at: string;
}

export interface PlayerHand {
  id: string;
  game_id: string;
  round_number: number;
  player_id: string;
  cards: CardType[];
  is_protected: boolean;
  created_at: string;
  updated_at: string;
}

export type ActionType =
  | 'play_card'
  | 'eliminate'
  | 'win_round'
  | 'draw_card'
  | 'force_discard'
  | 'view_hand'
  | 'swap_hands'
  | 'guess_card';

export interface GameAction {
  id: string;
  game_id: string;
  round_number: number;
  turn_number: number;
  player_id: string;
  action_type: ActionType;
  card_played?: CardType;
  target_player_id?: string;
  target_card?: CardType;
  details?: Record<string, any>;
  created_at: string;
}

export interface CreateGameRequest {
  player_name: string;
  max_players?: number;
}

export interface JoinGameRequest {
  room_code: string;
  player_name: string;
}

export interface PlayCardRequest {
  game_id: string;
  card: CardType;
  target_player_id?: string;
  guess_card?: CardType; // for Guard
}
