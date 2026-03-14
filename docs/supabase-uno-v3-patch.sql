-- ================================================================
-- UNO v3 Patch: Bug fixes + Zwischenzug + Classic-Verbs mode
-- Run AFTER supabase-uno-v2.sql
-- ================================================================

-- =================== BUG FIX: Direction-aware helpers ============

-- Next player with explicit direction (fixes Reverse card bug)
CREATE OR REPLACE FUNCTION public._uno_next_player_dir(p_room_id uuid, p_current uuid, p_dir integer)
RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  ids uuid[];
  idx integer;
BEGIN
  SELECT array_agg(id ORDER BY seat) INTO ids FROM public.uno_players WHERE room_id = p_room_id;
  IF ids IS NULL OR array_length(ids,1) = 0 THEN RETURN NULL; END IF;
  idx := array_position(ids, p_current);
  IF idx IS NULL THEN RETURN ids[1]; END IF;
  idx := idx + p_dir;
  IF idx < 1 THEN idx := array_length(ids,1);
  ELSIF idx > array_length(ids,1) THEN idx := 1;
  END IF;
  RETURN ids[idx];
END;
$$;

-- Skip-then-next with explicit direction
CREATE OR REPLACE FUNCTION public._uno_skip_next_dir(p_room_id uuid, p_current uuid, p_dir integer)
RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE skipped uuid;
BEGIN
  skipped := public._uno_next_player_dir(p_room_id, p_current, p_dir);
  RETURN public._uno_next_player_dir(p_room_id, skipped, p_dir);
END;
$$;

-- =================== BUG FIX: Update mode constraint ==============

-- Allow new mode 'classic-verbs'
ALTER TABLE public.uno_rooms DROP CONSTRAINT IF EXISTS uno_rooms_mode_check;
ALTER TABLE public.uno_rooms ADD CONSTRAINT uno_rooms_mode_check
  CHECK (mode IN ('classic', 'irregular-verbs', 'verb-match', 'classic-verbs'));

-- =================== NEW: Classic-Verbs deck builder ==============

-- Build classic deck with verb annotations on numbered cards
CREATE OR REPLACE FUNCTION public._uno_build_classic_verbs_deck(p_verb_count integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  deck jsonb := '[]'::jsonb;
  colors text[] := ARRAY['red','yellow','green','blue'];
  c text;
  verbs jsonb;
  verb_forms text[];
  form_idx integer := 0;
  total_forms integer;
  v jsonb;
  vf text;
BEGIN
  -- Pick random verbs
  verbs := public._uno_pick_verbs(p_verb_count);

  -- Build array of all verb forms (cycling through infinitive, past_simple, past_participle, translation)
  verb_forms := ARRAY[]::text[];
  FOR i IN 0..jsonb_array_length(verbs)-1 LOOP
    v := verbs -> i;
    verb_forms := verb_forms || (v ->> 'infinitive');
    verb_forms := verb_forms || (v ->> 'past_simple');
    verb_forms := verb_forms || (v ->> 'past_participle');
    verb_forms := verb_forms || COALESCE(v ->> 'translation', '');
  END LOOP;
  total_forms := array_length(verb_forms, 1);

  -- Build deck same as classic, but numbered cards get verb_display
  FOREACH c IN ARRAY colors LOOP
    -- one 0 per color (with verb)
    IF total_forms > 0 THEN
      form_idx := form_idx % total_forms + 1;
      vf := verb_forms[form_idx];
    ELSE
      vf := '';
    END IF;
    deck := deck || jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid()::text, 'color', c, 'kind', 'number', 'value', 0,
      'verb_display', vf
    ));
    FOR i IN 1..9 LOOP
      -- two copies per number per color
      FOR cp IN 1..2 LOOP
        IF total_forms > 0 THEN
          form_idx := form_idx % total_forms + 1;
          vf := verb_forms[form_idx];
        ELSE
          vf := '';
        END IF;
        deck := deck || jsonb_build_array(jsonb_build_object(
          'id', gen_random_uuid()::text, 'color', c, 'kind', 'number', 'value', i,
          'verb_display', vf
        ));
      END LOOP;
    END LOOP;
    -- 2x action cards per color (no verb)
    FOR j IN 1..2 LOOP
      deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', c, 'kind', 'skip'));
      deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', c, 'kind', 'reverse'));
      deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', c, 'kind', 'draw2'));
    end loop;
  END LOOP;
  -- 4x wild, 4x wild+4
  FOR k IN 1..4 LOOP
    deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', 'wild', 'kind', 'wild'));
    deck := deck || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'color', 'wild', 'kind', 'wild4'));
  END LOOP;
  RETURN deck;
END;
$$;

-- =================== FIX: uno_create_room (add classic-verbs) =====

DROP FUNCTION IF EXISTS public.uno_create_room(text, text, integer, text);
CREATE OR REPLACE FUNCTION public.uno_create_room(
  p_code text,
  p_mode text DEFAULT 'classic',
  p_verb_count integer DEFAULT 20,
  p_host_name text DEFAULT 'Host'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  deck jsonb;
  dealt jsonb;
  room_row public.uno_rooms;
  host_row public.uno_players;
BEGIN
  IF p_mode = 'verb-match' THEN
    deck := public._uno_build_match_deck(public._uno_pick_verbs(p_verb_count));
  ELSIF p_mode = 'irregular-verbs' THEN
    deck := public._uno_build_verb_deck(public._uno_pick_verbs(p_verb_count));
  ELSIF p_mode = 'classic-verbs' THEN
    deck := public._uno_build_classic_verbs_deck(p_verb_count);
  ELSE
    deck := public._uno_build_classic_deck();
  END IF;
  deck := public._uno_shuffle(deck);

  INSERT INTO public.uno_rooms (code, mode, verb_count, draw_pile)
  VALUES (p_code, p_mode, greatest(15, least(p_verb_count, 25)), deck)
  RETURNING * INTO room_row;

  INSERT INTO public.uno_players (room_id, name, is_host, seat)
  VALUES (room_row.id, coalesce(nullif(p_host_name,''), 'Host'), true, 1)
  RETURNING * INTO host_row;

  -- deal 7 cards
  dealt := public._uno_deal(room_row.draw_pile, '[]'::jsonb, 7);

  UPDATE public.uno_rooms
  SET draw_pile = dealt -> 'pile',
      hands = jsonb_build_object(host_row.id::text, dealt -> 'hand'),
      host_id = host_row.id,
      current_player_id = host_row.id,
      state_version = state_version + 1
  WHERE id = room_row.id
  RETURNING * INTO room_row;

  RETURN jsonb_build_object('room', to_jsonb(room_row), 'player', to_jsonb(host_row));
END;
$$;

GRANT EXECUTE ON FUNCTION public.uno_create_room(text, text, integer, text) TO PUBLIC;

-- =================== FIX: uno_play_card (direction bug) ===========

DROP FUNCTION IF EXISTS public.uno_play_card(text, uuid, text, text);
CREATE OR REPLACE FUNCTION public.uno_play_card(
  p_room_code text,
  p_player_id uuid,
  p_card_id text,
  p_chosen_color text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  room_row public.uno_rooms;
  hand jsonb;
  card jsonb;
  top_card jsonb;
  idx integer := -1;
  pile jsonb;
  dir integer;
  next_p uuid;
  draw_n integer := 0;
  target_hand jsonb;
  dealt jsonb;
  player_count integer;
  reshuffled jsonb;
BEGIN
  SELECT * INTO room_row FROM public.uno_rooms WHERE code = p_room_code FOR UPDATE;
  IF room_row.id IS NULL THEN RAISE EXCEPTION 'Комната не найдена'; END IF;
  IF room_row.status <> 'playing' THEN RAISE EXCEPTION 'Игра не запущена'; END IF;
  IF room_row.current_player_id <> p_player_id THEN RAISE EXCEPTION 'Сейчас ход другого игрока'; END IF;

  hand := coalesce(room_row.hands -> p_player_id::text, '[]'::jsonb);

  -- find card in hand
  FOR i IN 0..jsonb_array_length(hand)-1 LOOP
    IF (hand -> i) ->> 'id' = p_card_id THEN
      idx := i; card := hand -> i; EXIT;
    END IF;
  END LOOP;
  IF card IS NULL THEN RAISE EXCEPTION 'Карта не найдена в руке'; END IF;

  -- top card
  IF jsonb_array_length(room_row.discard_pile) > 0 THEN
    top_card := room_row.discard_pile -> (jsonb_array_length(room_row.discard_pile) - 1);
  END IF;

  -- rule validation
  IF card ->> 'kind' NOT IN ('wild','wild4') AND top_card IS NOT NULL THEN
    IF NOT (
         (card ->> 'color') = (top_card ->> 'color')
      OR ((card ->> 'kind') = 'verb-match' AND (top_card ->> 'kind') = 'verb-match' AND (card ->> 'verb_id') = (top_card ->> 'verb_id'))
      OR ((card ->> 'kind') = 'verb'       AND (top_card ->> 'kind') = 'verb'       AND (card -> 'verb' ->> 'id') = (top_card -> 'verb' ->> 'id'))
      OR ((card ->> 'kind') = 'number'     AND (top_card ->> 'kind') = 'number'     AND (card ->> 'value') = (top_card ->> 'value'))
      OR ((card ->> 'kind') = (top_card ->> 'kind') AND (card ->> 'kind') IN ('skip','reverse','draw2'))
    ) THEN
      RAISE EXCEPTION 'Нельзя сходить этой картой';
    END IF;
  END IF;

  -- wild -> override colour
  IF card ->> 'kind' IN ('wild','wild4') THEN
    IF p_chosen_color IS NULL THEN RAISE EXCEPTION 'Нужно выбрать цвет для wild'; END IF;
    card := jsonb_set(card, '{color}', to_jsonb(p_chosen_color));
  END IF;

  -- remove card from hand
  hand := hand - idx;

  -- push to discard
  pile := room_row.discard_pile || jsonb_build_array(card);

  -- direction (update BEFORE computing next player — FIX)
  dir := room_row.direction;
  IF card ->> 'kind' = 'reverse' THEN dir := dir * -1; END IF;

  -- count players for 2-player Reverse=Skip rule
  SELECT count(*) INTO player_count FROM public.uno_players WHERE room_id = room_row.id;

  -- determine next player + specials (using dir-aware functions)
  IF card ->> 'kind' = 'skip' THEN
    next_p := public._uno_skip_next_dir(room_row.id, p_player_id, dir);
  ELSIF card ->> 'kind' = 'reverse' AND player_count = 2 THEN
    -- In 2-player UNO, Reverse acts as Skip
    next_p := public._uno_skip_next_dir(room_row.id, p_player_id, dir);
  ELSIF card ->> 'kind' = 'draw2' THEN
    next_p := public._uno_next_player_dir(room_row.id, p_player_id, dir);
    draw_n := 2;
  ELSIF card ->> 'kind' = 'wild4' THEN
    next_p := public._uno_next_player_dir(room_row.id, p_player_id, dir);
    draw_n := 4;
  ELSE
    next_p := public._uno_next_player_dir(room_row.id, p_player_id, dir);
  END IF;

  -- update the playing player's hand in room_row
  room_row.hands := jsonb_set(room_row.hands, ARRAY[p_player_id::text], hand, true);

  -- apply draws to target player (for +2 and +4)
  IF draw_n > 0 AND next_p IS NOT NULL THEN
    -- If draw pile exhausted, reshuffle discard (keep top card which is the one just played)
    IF jsonb_array_length(room_row.draw_pile) < draw_n THEN
      IF jsonb_array_length(pile) > 1 THEN
        reshuffled := '[]'::jsonb;
        FOR ri IN 0..(jsonb_array_length(pile) - 2) LOOP
          reshuffled := reshuffled || jsonb_build_array(pile -> ri);
        END LOOP;
        room_row.draw_pile := room_row.draw_pile || public._uno_shuffle(reshuffled);
        pile := jsonb_build_array(pile -> (jsonb_array_length(pile) - 1));
      END IF;
    END IF;

    target_hand := coalesce(room_row.hands -> next_p::text, '[]'::jsonb);
    dealt := public._uno_deal(room_row.draw_pile, target_hand, draw_n);
    room_row.draw_pile := dealt -> 'pile';
    room_row.hands := jsonb_set(room_row.hands, ARRAY[next_p::text], dealt -> 'hand', true);
    -- after drawing, skip that player's turn (standard UNO rule)
    next_p := public._uno_next_player_dir(room_row.id, next_p, dir);
  END IF;

  -- check win
  IF jsonb_array_length(hand) = 0 THEN
    UPDATE public.uno_rooms
    SET discard_pile = pile,
        draw_pile = room_row.draw_pile,
        hands = room_row.hands,
        direction = dir,
        current_player_id = NULL,
        winner_id = p_player_id,
        status = 'finished',
        state_version = state_version + 1,
        updated_at = now()
    WHERE id = room_row.id
    RETURNING * INTO room_row;
  ELSE
    UPDATE public.uno_rooms
    SET discard_pile = pile,
        draw_pile = room_row.draw_pile,
        hands = room_row.hands,
        direction = dir,
        current_player_id = next_p,
        state_version = state_version + 1,
        updated_at = now()
    WHERE id = room_row.id
    RETURNING * INTO room_row;
  END IF;

  -- log event
  INSERT INTO public.uno_events (room_id, player_id, event_type, payload)
  VALUES (room_row.id, p_player_id, 'play_card', jsonb_build_object('card', card));

  RETURN jsonb_build_object('room', to_jsonb(room_row));
END;
$$;

GRANT EXECUTE ON FUNCTION public.uno_play_card(text, uuid, text, text) TO PUBLIC;

-- =================== NEW: Zwischenzug (Jump-In) ===================

CREATE OR REPLACE FUNCTION public.uno_zwischenzug(
  p_room_code text,
  p_player_id uuid,
  p_card_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  room_row public.uno_rooms;
  hand jsonb;
  card jsonb;
  top_card jsonb;
  idx integer := -1;
  pile jsonb;
  next_p uuid;
  dir integer;
BEGIN
  SELECT * INTO room_row FROM public.uno_rooms WHERE code = p_room_code FOR UPDATE;
  IF room_row.id IS NULL THEN RAISE EXCEPTION 'Комната не найдена'; END IF;
  IF room_row.status <> 'playing' THEN RAISE EXCEPTION 'Игра не запущена'; END IF;

  -- Zwischenzug: player can play OUT OF TURN, so no turn check

  hand := coalesce(room_row.hands -> p_player_id::text, '[]'::jsonb);

  -- find card in hand
  FOR i IN 0..jsonb_array_length(hand)-1 LOOP
    IF (hand -> i) ->> 'id' = p_card_id THEN
      idx := i; card := hand -> i; EXIT;
    END IF;
  END LOOP;
  IF card IS NULL THEN RAISE EXCEPTION 'Карта не найдена в руке'; END IF;

  -- top card
  IF jsonb_array_length(room_row.discard_pile) = 0 THEN
    RAISE EXCEPTION 'Нет карты на столе для цвишенцуга';
  END IF;
  top_card := room_row.discard_pile -> (jsonb_array_length(room_row.discard_pile) - 1);

  -- Zwischenzug requires EXACT DUPLICATE: same color + same kind + same value/verb
  -- Wild cards cannot be used for zwischenzug
  IF card ->> 'kind' IN ('wild', 'wild4') THEN
    RAISE EXCEPTION 'Wild карты нельзя использовать для цвишенцуга';
  END IF;

  IF NOT (
    (card ->> 'color') = (top_card ->> 'color')
    AND (card ->> 'kind') = (top_card ->> 'kind')
    AND (
      -- number: same value
      ((card ->> 'kind') = 'number' AND (card ->> 'value') = (top_card ->> 'value'))
      -- action: same kind is enough (already checked above)
      OR (card ->> 'kind') IN ('skip', 'reverse', 'draw2')
      -- verb: same verb
      OR ((card ->> 'kind') = 'verb' AND (card -> 'verb' ->> 'id') = (top_card -> 'verb' ->> 'id'))
      -- verb-match: same verb_id + same form
      OR ((card ->> 'kind') = 'verb-match' AND (card ->> 'verb_id') = (top_card ->> 'verb_id') AND (card ->> 'form') = (top_card ->> 'form'))
    )
  ) THEN
    RAISE EXCEPTION 'Для цвишенцуга нужна точная копия верхней карты';
  END IF;

  -- remove card from hand
  hand := hand - idx;

  -- push to discard
  pile := room_row.discard_pile || jsonb_build_array(card);

  dir := room_row.direction;

  -- Zwischenzug: turn continues from the player who jumped in
  -- No special effects applied (standard jump-in rule)
  next_p := public._uno_next_player_dir(room_row.id, p_player_id, dir);

  -- update hands
  room_row.hands := jsonb_set(room_row.hands, ARRAY[p_player_id::text], hand, true);

  -- check win
  IF jsonb_array_length(hand) = 0 THEN
    UPDATE public.uno_rooms
    SET discard_pile = pile,
        hands = room_row.hands,
        current_player_id = NULL,
        winner_id = p_player_id,
        status = 'finished',
        state_version = state_version + 1,
        updated_at = now()
    WHERE id = room_row.id
    RETURNING * INTO room_row;
  ELSE
    UPDATE public.uno_rooms
    SET discard_pile = pile,
        hands = room_row.hands,
        current_player_id = next_p,
        state_version = state_version + 1,
        updated_at = now()
    WHERE id = room_row.id
    RETURNING * INTO room_row;
  END IF;

  -- log event
  INSERT INTO public.uno_events (room_id, player_id, event_type, payload)
  VALUES (room_row.id, p_player_id, 'zwischenzug', jsonb_build_object('card', card));

  RETURN jsonb_build_object('room', to_jsonb(room_row));
END;
$$;

GRANT EXECUTE ON FUNCTION public.uno_zwischenzug(text, uuid, text) TO PUBLIC;

-- =================== VERIFICATION ==================================
SELECT 'patch_applied' AS status,
       (SELECT count(*) FROM information_schema.routines
        WHERE routine_schema='public' AND routine_name IN (
          '_uno_next_player_dir','_uno_skip_next_dir',
          'uno_zwischenzug','_uno_build_classic_verbs_deck'
        )) AS new_functions_count;
