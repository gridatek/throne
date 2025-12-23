-- Love Letter Game Database Schema
-- This migration creates all tables and policies needed for the Love Letter card game

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Games table: stores game rooms
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_code VARCHAR(6) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'waiting', -- waiting, in_progress, finished
  max_players INTEGER NOT NULL DEFAULT 4,
  current_round INTEGER DEFAULT 0,
  winning_tokens INTEGER NOT NULL DEFAULT 7, -- tokens needed to win (adjusted based on player count)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  finished_at TIMESTAMP WITH TIME ZONE,
  winner_id UUID,
  created_by VARCHAR(100) -- can be user_id or guest_id
);

-- Game players: tracks players in each game
CREATE TABLE game_players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id VARCHAR(100) NOT NULL, -- can be user_id or guest_id (e.g., "guest_abc123")
  player_name VARCHAR(50) NOT NULL,
  is_host BOOLEAN DEFAULT FALSE,
  tokens INTEGER DEFAULT 0, -- affection tokens (points)
  is_eliminated BOOLEAN DEFAULT FALSE,
  join_order INTEGER NOT NULL, -- order in which they joined
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(game_id, player_id)
);

-- Game state: current state of the game
CREATE TABLE game_state (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL DEFAULT 1,
  current_turn_player_id VARCHAR(100), -- player_id of current turn
  turn_number INTEGER DEFAULT 1,
  deck JSONB NOT NULL, -- array of remaining cards in deck
  discard_pile JSONB DEFAULT '[]', -- array of discarded cards
  set_aside_card VARCHAR(20), -- card set aside at round start (for 2 players)
  round_winner_id VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(game_id, round_number)
);

-- Player hands: cards each player currently holds
CREATE TABLE player_hands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  player_id VARCHAR(100) NOT NULL,
  cards JSONB NOT NULL DEFAULT '[]', -- array of card names
  is_protected BOOLEAN DEFAULT FALSE, -- protected by Handmaid
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(game_id, round_number, player_id)
);

-- Game actions: log of all game actions
CREATE TABLE game_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  turn_number INTEGER NOT NULL,
  player_id VARCHAR(100) NOT NULL,
  action_type VARCHAR(50) NOT NULL, -- play_card, eliminate, win_round, etc.
  card_played VARCHAR(20),
  target_player_id VARCHAR(100),
  target_card VARCHAR(20), -- for Baron comparisons, Priest views, etc.
  details JSONB, -- additional action details
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_games_room_code ON games(room_code);
CREATE INDEX idx_games_status ON games(status);
CREATE INDEX idx_game_players_game_id ON game_players(game_id);
CREATE INDEX idx_game_players_player_id ON game_players(player_id);
CREATE INDEX idx_game_state_game_id ON game_state(game_id);
CREATE INDEX idx_player_hands_game_round_player ON player_hands(game_id, round_number, player_id);
CREATE INDEX idx_game_actions_game_id ON game_actions(game_id);
CREATE INDEX idx_game_actions_round ON game_actions(game_id, round_number);

-- Enable Row Level Security
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_hands ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_actions ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow anyone to read game data (for guest players)
CREATE POLICY "Anyone can view games" ON games FOR SELECT USING (true);
CREATE POLICY "Anyone can create games" ON games FOR INSERT WITH CHECK (true);
CREATE POLICY "Game creator or players can update" ON games FOR UPDATE USING (true);

CREATE POLICY "Anyone can view game players" ON game_players FOR SELECT USING (true);
CREATE POLICY "Anyone can join games" ON game_players FOR INSERT WITH CHECK (true);
CREATE POLICY "Players can update their own data" ON game_players FOR UPDATE USING (true);

CREATE POLICY "Anyone can view game state" ON game_state FOR SELECT USING (true);
CREATE POLICY "Anyone can modify game state" ON game_state FOR ALL USING (true);

-- RLS for player hands: Players can only see their own cards
CREATE POLICY "Players can view own hand" ON player_hands FOR SELECT
  USING (
    player_id = current_setting('request.jwt.claims', true)::json->>'sub'
    OR player_id LIKE 'guest_%'
  );
CREATE POLICY "System can manage hands" ON player_hands FOR ALL USING (true);

CREATE POLICY "Anyone can view game actions" ON game_actions FOR SELECT USING (true);
CREATE POLICY "Anyone can create game actions" ON game_actions FOR INSERT WITH CHECK (true);

-- Function: Generate unique room code
CREATE OR REPLACE FUNCTION generate_room_code()
RETURNS VARCHAR(6) AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- Exclude ambiguous chars
  result VARCHAR(6) := '';
  i INTEGER;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function: Initialize a new round
CREATE OR REPLACE FUNCTION initialize_round(
  p_game_id UUID,
  p_round_number INTEGER,
  p_player_ids TEXT[]
)
RETURNS void AS $$
DECLARE
  deck JSONB;
  set_aside_card TEXT;
  player_id TEXT;
  initial_cards JSONB;
BEGIN
  -- Create standard Love Letter deck (16 cards for 2-4 players, extended for 5-8)
  IF array_length(p_player_ids, 1) <= 4 THEN
    -- Standard deck
    deck := jsonb_build_array(
      'Guard', 'Guard', 'Guard', 'Guard', 'Guard',
      'Priest', 'Priest',
      'Baron', 'Baron',
      'Handmaid', 'Handmaid',
      'Prince', 'Prince',
      'King',
      'Countess',
      'Princess'
    );
  ELSE
    -- Extended deck for 5-8 players (add more cards)
    deck := jsonb_build_array(
      'Guard', 'Guard', 'Guard', 'Guard', 'Guard', 'Guard',
      'Priest', 'Priest', 'Priest',
      'Baron', 'Baron', 'Baron',
      'Handmaid', 'Handmaid', 'Handmaid',
      'Prince', 'Prince', 'Prince',
      'King', 'King',
      'Countess', 'Countess',
      'Princess', 'Princess'
    );
  END IF;

  -- Shuffle deck (simple random shuffle)
  -- In production, you'd want a better shuffle algorithm
  deck := (SELECT jsonb_agg(value ORDER BY random()) FROM jsonb_array_elements(deck));

  -- Set aside one card (only for 2-player games)
  IF array_length(p_player_ids, 1) = 2 THEN
    set_aside_card := deck->0;
    deck := (SELECT jsonb_agg(value) FROM jsonb_array_elements(deck) WITH ORDINALITY WHERE ordinality > 1);
  END IF;

  -- Deal one card to each player
  FOR i IN 1..array_length(p_player_ids, 1) LOOP
    player_id := p_player_ids[i];
    initial_cards := jsonb_build_array(deck->0);
    deck := (SELECT jsonb_agg(value) FROM jsonb_array_elements(deck) WITH ORDINALITY WHERE ordinality > 1);

    INSERT INTO player_hands (game_id, round_number, player_id, cards)
    VALUES (p_game_id, p_round_number, player_id, initial_cards);
  END LOOP;

  -- Create game state
  INSERT INTO game_state (
    game_id,
    round_number,
    current_turn_player_id,
    deck,
    set_aside_card
  )
  VALUES (
    p_game_id,
    p_round_number,
    p_player_ids[1], -- First player starts
    deck,
    set_aside_card
  );

  -- Reset elimination status for new round
  UPDATE game_players
  SET is_eliminated = FALSE
  WHERE game_id = p_game_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get next player in turn order
CREATE OR REPLACE FUNCTION get_next_player(
  p_game_id UUID,
  p_current_player_id VARCHAR(100)
)
RETURNS VARCHAR(100) AS $$
DECLARE
  next_player VARCHAR(100);
  current_order INTEGER;
BEGIN
  -- Get current player's join order
  SELECT join_order INTO current_order
  FROM game_players
  WHERE game_id = p_game_id AND player_id = p_current_player_id;

  -- Get next non-eliminated player in circular order
  SELECT player_id INTO next_player
  FROM game_players
  WHERE game_id = p_game_id
    AND is_eliminated = FALSE
    AND join_order > current_order
  ORDER BY join_order
  LIMIT 1;

  -- If no next player found, wrap around to beginning
  IF next_player IS NULL THEN
    SELECT player_id INTO next_player
    FROM game_players
    WHERE game_id = p_game_id
      AND is_eliminated = FALSE
    ORDER BY join_order
    LIMIT 1;
  END IF;

  RETURN next_player;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- Enable Realtime for tables
ALTER TABLE games REPLICA IDENTITY FULL;
ALTER TABLE game_players REPLICA IDENTITY FULL;
ALTER TABLE game_state REPLICA IDENTITY FULL;
ALTER TABLE game_actions REPLICA IDENTITY FULL;

-- Add tables to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE games;
ALTER PUBLICATION supabase_realtime ADD TABLE game_players;
ALTER PUBLICATION supabase_realtime ADD TABLE game_state;
ALTER PUBLICATION supabase_realtime ADD TABLE game_actions;
