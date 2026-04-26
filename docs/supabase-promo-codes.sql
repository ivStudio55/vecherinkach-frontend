-- Promo codes: supports both percentage/fixed discount (Variant A) and free access (Variant B, discount_pct=100)
-- Run this against the self-hosted PostgreSQL:
--   psql -h <DB_HOST> -U postgres -d default_db -f supabase-promo-codes.sql
--   OR:
--   docker exec <postgres_container> psql -U postgres -d default_db < supabase-promo-codes.sql

CREATE TABLE IF NOT EXISTS promo_codes (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text        UNIQUE NOT NULL,           -- uppercase, e.g. 'SUMMER30'
  discount_pct   integer     NOT NULL DEFAULT 0         -- 0–100; 100 = fully free (Variant B)
                             CHECK (discount_pct >= 0 AND discount_pct <= 100),
  discount_fixed integer     NOT NULL DEFAULT 0         -- fixed ruble discount applied after %
                             CHECK (discount_fixed >= 0),
  game           text,                                  -- NULL = all games
  pack_id        text,                                  -- NULL = all packs within the game
  expires_at     timestamptz,                           -- NULL = never expires
  max_uses       integer,                               -- NULL = unlimited
  used_count     integer     NOT NULL DEFAULT 0,
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Add promo_code tracking to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS original_amount integer;

-- Atomic function: validate + increment used_count in one transaction
-- Returns { valid: true, discount_pct, discount_fixed } or { valid: false, error }
CREATE OR REPLACE FUNCTION use_promo_code(p_code text, p_game text, p_pack_id text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_row promo_codes%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM promo_codes
  WHERE code = upper(trim(p_code))
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_uses IS NULL OR used_count < max_uses)
    AND (game IS NULL OR game = p_game)
    AND (pack_id IS NULL OR pack_id = p_pack_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Промокод недействителен');
  END IF;

  UPDATE promo_codes SET used_count = used_count + 1 WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'valid', true,
    'discount_pct', v_row.discount_pct,
    'discount_fixed', v_row.discount_fixed
  );
END;
$$;
