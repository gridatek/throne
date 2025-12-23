-- Simplify deck initialization to only support standard Love Letter (2-4 players)
-- Remove extended deck support for 5-8 players

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
  -- Validate player count (2-4 players only)
  IF array_length(p_player_ids, 1) < 2 OR array_length(p_player_ids, 1) > 4 THEN
    RAISE EXCEPTION 'Standard Love Letter supports 2-4 players only';
  END IF;

  -- Create standard Love Letter deck (16 cards)
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

  -- Shuffle deck (simple random shuffle)
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
