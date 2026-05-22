// src/lib/survivach/gameModes.ts
// ─── Extensible Game Mode Registry ───────────────────────────────────────────
//
// HOW TO ADD A NEW MODE:
//   1. Add its id to `RoundMode` in types.ts
//   2. Add a GameModeDescriptor entry to GAME_MODE_REGISTRY below
//   3. Add question-loading logic to handleMoveAnimDone in host page.tsx
//   4. Add rendering in host and player screens
//   The core selection algorithm (getRandomMode) never needs to change.

import type { RoundMode, ModeCategory } from './types';

// ─── Category ────────────────────────────────────────────────────────────────

// Re-exported from types.ts for convenience — see types.ts for the canonical definition.
export type { ModeCategory } from './types';

// ─── Descriptor ──────────────────────────────────────────────────────────────

export interface GameModeDescriptor {
  /** Unique mode identifier — must match RoundMode in types.ts */
  id: RoundMode;
  /** Display name shown on screen */
  label: string;
  /** Hex colour for UI accents */
  color: string;
  /** Emoji icon */
  emoji: string;
  /** Broad category for filtering / UI grouping */
  category: ModeCategory;
  /** Default timer in seconds for this mode */
  timerSec: number;
  /**
   * Relative weight for weighted-random selection.
   * Higher = appears more often. 1 is the baseline.
   * e.g. weight 3 means ~3× as likely as weight 1.
   */
  weight: number;
}

// ─── Registry ─────────────────────────────────────────────────────────────────
// Add new modes here. Blitz is intentionally EXCLUDED — it lives in its own
// fixed lane (cells 19+) and is never chosen by getRandomMode.

export const GAME_MODE_REGISTRY: GameModeDescriptor[] = [
  {
    id: 'umnik',
    label: 'Умник',
    color: '#4ade80',
    emoji: '🧠',
    category: 'NORMAL',
    timerSec: 30,
    weight: 3,
  },
  {
    id: 'mathematician',
    label: 'Математик',
    color: '#60a5fa',
    emoji: '🔢',
    category: 'NORMAL',
    timerSec: 60,
    weight: 2,
  },
  {
    id: 'art_historian',
    label: 'Искусствовед',
    color: '#f97316',
    emoji: '🖼',
    category: 'NORMAL',
    timerSec: 30,
    weight: 2,
  },
  {
    id: 'interpreter',
    label: 'Переводчик',
    color: '#a855f7',
    emoji: '🎵',
    category: 'NORMAL',
    timerSec: 30,
    weight: 2,
  },
  {
    id: 'memory_diary',
    label: 'Дневник памяти',
    color: '#ec4899',
    emoji: '🔴',
    category: 'NORMAL',
    timerSec: 30,
    weight: 2,
  },
  {
    id: 'tag_puzzle',
    label: 'Пятнашки',
    color: '#fbbf24',
    emoji: '🧩',
    category: 'SPECIAL',
    timerSec: 120,
    weight: 1,
  },
];

// ─── Selection algorithm ──────────────────────────────────────────────────────

/**
 * Picks a random game mode, avoiding recent repeats.
 *
 * @param recentHistory  - Ordered list of recently played mode ids (oldest first).
 *                         Pass `usedModesHistoryRef.current` from the host page.
 * @param maxHistory     - How many of the most-recent modes to exclude.
 *                         Defaults to (registrySize - 1), meaning every mode
 *                         must be played at least once before it can repeat.
 *
 * The algorithm is **weighted**: modes with higher `weight` are proportionally
 * more likely. If all modes are excluded (exhausted history), the exclusion is
 * dropped and the full pool is used — guaranteeing the game never gets stuck.
 */
export function getRandomMode(
  recentHistory: RoundMode[],
  maxHistory?: number,
): RoundMode {
  const pool = GAME_MODE_REGISTRY;
  const avoidCount = maxHistory ?? pool.length - 1;
  const recent = recentHistory.slice(-avoidCount);

  // Build candidate list — filter out recently played modes
  let candidates = pool.filter(m => !recent.includes(m.id));

  // Safety fallback: if everything is excluded, use the full pool
  if (candidates.length === 0) candidates = pool;

  // Weighted random selection
  const totalWeight = candidates.reduce((sum, m) => sum + m.weight, 0);
  let rand = Math.random() * totalWeight;
  for (const m of candidates) {
    rand -= m.weight;
    if (rand <= 0) return m.id;
  }

  // Numeric precision fallback — should never reach here
  return candidates[candidates.length - 1].id;
}

/**
 * Looks up a descriptor from the registry by mode id.
 * Returns undefined if the mode is not in the registry (e.g. 'blitz').
 */
export function getModeDescriptor(id: RoundMode): GameModeDescriptor | undefined {
  return GAME_MODE_REGISTRY.find(m => m.id === id);
}

/**
 * Returns the timer duration (seconds) for a given mode.
 * Falls back to 30 seconds if the mode is not in the registry.
 */
export function getModeDuration(id: RoundMode): number {
  return getModeDescriptor(id)?.timerSec ?? 30;
}
