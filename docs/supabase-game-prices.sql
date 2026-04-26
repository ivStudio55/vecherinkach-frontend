-- Migration: game_prices table
-- Stores configurable prices for each game, managed via admin panel

CREATE TABLE IF NOT EXISTS game_prices (
  game        TEXT PRIMARY KEY,
  price       INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO game_prices (game, price) VALUES
  ('vecherinkach', 300),
  ('jokester',     200),
  ('creativach',   200)
ON CONFLICT (game) DO NOTHING;
