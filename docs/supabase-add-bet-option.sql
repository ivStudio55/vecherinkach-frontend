-- Migration: add bet_option column to survivach_bets
-- Supports new bet condition types: all_correct, majority_correct, leader_mistake, all_wrong

ALTER TABLE survivach_bets
  ADD COLUMN IF NOT EXISTS bet_option TEXT NOT NULL DEFAULT 'all_wrong'
    CHECK (bet_option IN ('all_correct', 'majority_correct', 'leader_mistake', 'all_wrong'));

-- (Optional) back-fill any existing rows — they default to 'all_wrong'
-- No data migration needed; old bets are already resolved.
