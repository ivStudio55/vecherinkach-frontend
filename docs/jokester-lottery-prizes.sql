CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.jokester_lottery_prizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.jokester_rooms(id) ON DELETE CASCADE,
  round integer NOT NULL CHECK (round >= 1 AND round <= 3),
  winner_id uuid REFERENCES public.jokester_players(id) ON DELETE SET NULL,
  promo_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, round)
);

CREATE INDEX IF NOT EXISTS jokester_lottery_prizes_room_idx
  ON public.jokester_lottery_prizes(room_id);

CREATE INDEX IF NOT EXISTS jokester_lottery_prizes_winner_idx
  ON public.jokester_lottery_prizes(winner_id);

ALTER TABLE public.jokester_lottery_prizes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jokester_lottery_prizes_all ON public.jokester_lottery_prizes;
CREATE POLICY jokester_lottery_prizes_all
  ON public.jokester_lottery_prizes
  FOR ALL
  USING (true)
  WITH CHECK (true);
