-- Migration v2: add pack_id and room_id to orders
-- Run in Supabase SQL editor or psql

ALTER TABLE orders ADD COLUMN IF NOT EXISTS pack_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS room_id TEXT;

-- Index for host redirect lookup by room_id
CREATE INDEX IF NOT EXISTS orders_room_id_idx ON orders(room_id);
