-- Migration: add orders/payments table for YuKassa integration
-- Run in Supabase SQL editor or psql

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game TEXT NOT NULL,
  pack_name TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  yukassa_payment_id TEXT,
  customer_email TEXT,
  room_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No public access — only service role bypasses RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Index for webhook lookups by yukassa_payment_id
CREATE INDEX IF NOT EXISTS orders_yukassa_payment_id_idx ON orders(yukassa_payment_id);
