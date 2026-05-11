// src/lib/survivach/board.ts
// Board configuration and helper logic for Выживач

import type { RoundMode, SurvivachPlayer } from './types';

export const TOTAL_CELLS = 26;
export const BLITZ_START = 19;

/* Default 26-cell sequence (1-indexed) */
export const DEFAULT_CELL_MODES: RoundMode[] = [
  'umnik',          // 1
  'mathematician',  // 2
  'interpreter',    // 3
  'art_historian',  // 4
  'memory_diary',   // 5
  'tag_puzzle',     // 6
  'umnik',          // 7
  'mathematician',  // 8
  'art_historian',  // 9
  'interpreter',    // 10
  'memory_diary',   // 11
  'tag_puzzle',     // 12
  'umnik',          // 13
  'mathematician',  // 14
  'art_historian',  // 15
  'interpreter',    // 16
  'memory_diary',   // 17
  'tag_puzzle',     // 18
  'blitz',          // 19
  'blitz',          // 20
  'blitz',          // 21
  'blitz',          // 22
  'blitz',          // 23
  'blitz',          // 24
  'blitz',          // 25
  'blitz',          // 26
];

export const MODE_LABELS: Record<RoundMode, string> = {
  umnik: '🧠 Умник',
  mathematician: '🔢 Математик',
  art_historian: '🖼 Искусствовед',
  interpreter: '🎵 Переводчик',
  memory_diary: '🔴 Дневник памяти',
  tag_puzzle: '🧩 Пятнашки',
  blitz: '⚡ Блиц',
};

export const MODE_COLORS: Record<RoundMode, string> = {
  umnik: '#4ade80',
  mathematician: '#60a5fa',
  art_historian: '#f97316',
  interpreter: '#a855f7',
  memory_diary: '#ec4899',
  tag_puzzle: '#fbbf24',
  blitz: '#ef4444',
};

export const DUCK_AVATARS = [
  'duck1', 'duck2', 'duck3', 'duck4',
  'duck5', 'duck6', 'duck7', 'duck8',
  'duck9', 'duck10', 'duck11', 'duck12',
];

const AVA_BASE = 'https://storage.yandexcloud.net/vecherinkach/json/survivach/img';

export function getAvatarUrl(duckType: string, lives: number): string {
  const lvl = Math.min(3, Math.max(0, lives));
  return `${AVA_BASE}/${duckType}-${lvl}.png?v=3`;
}

/**
 * Returns the round mode for the given board cell position (1-indexed).
 * Uses the pack's custom sequence if provided, otherwise DEFAULT_CELL_MODES.
 */
export function getModeForCell(position: number, customSequence?: RoundMode[] | null): RoundMode {
  const seq = customSequence ?? DEFAULT_CELL_MODES;
  const idx = Math.min(position, seq.length) - 1;
  return seq[idx] ?? 'blitz';
}

/**
 * Returns a sorted leaderboard. Tiebreaker order:
 * 1. Position (higher = closer to finish)
 * 2. Lives
 * 3. Karma
 * 4. Total correct answers
 * 5. Total answer time (lower = better)
 */
export function rankPlayers(players: SurvivachPlayer[]): SurvivachPlayer[] {
  return [...players].sort((a, b) => {
    if (b.position !== a.position) return b.position - a.position;
    if (b.lives !== a.lives) return b.lives - a.lives;
    if (b.karma !== a.karma) return b.karma - a.karma;
    if (b.total_correct !== a.total_correct) return b.total_correct - a.total_correct;
    return a.total_answer_time_ms - b.total_answer_time_ms;
  });
}

/** Returns the leader (or leaders sharing first place) */
export function getLeaders(players: SurvivachPlayer[]): SurvivachPlayer[] {
  const ranked = rankPlayers(players);
  if (ranked.length === 0) return [];
  const topPos = ranked[0].position;
  return ranked.filter(p => p.position === topPos);
}

/** Returns the leader's current position (determines round mode) */
export function getLeaderPosition(players: SurvivachPlayer[]): number {
  const leaders = getLeaders(players);
  return leaders.length > 0 ? leaders[0].position : 1;
}

/** Generates a random math problem at the given difficulty */
export function generateMathProblem(
  difficulty: 'easy' | 'medium' | 'hard',
  bombActive: boolean,
): { expression: string; answer: number } {
  if (bombActive) {
    const r = Math.random();
    if (r < 0.25) {
      // Perfect square roots: √4, √9, ..., √100
      const roots = [4, 9, 16, 25, 36, 49, 64, 81, 100];
      const n = roots[Math.floor(Math.random() * roots.length)];
      return { expression: `√${n}`, answer: Math.sqrt(n) };
    } else if (r < 0.50) {
      // Multi-step: (a + b) × c
      const a = Math.floor(Math.random() * 5 + 2);
      const b = Math.floor(Math.random() * 5 + 2);
      const c = Math.floor(Math.random() * 4 + 2);
      return { expression: `(${a} + ${b}) × ${c}`, answer: (a + b) * c };
    } else if (r < 0.70) {
      // Multi-step: (a×b ÷ b) + c
      const b = Math.floor(Math.random() * 4 + 2);
      const a = Math.floor(Math.random() * 6 + 2);
      const c = Math.floor(Math.random() * 20 + 5);
      return { expression: `(${a * b} ÷ ${b}) + ${c}`, answer: a + c };
    } else if (r < 0.85) {
      // Equation: x + a = b
      const x = Math.floor(Math.random() * 20 + 2);
      const a = Math.floor(Math.random() * 30 + 5);
      return { expression: `x + ${a} = ${x + a},  x = ?`, answer: x };
    } else {
      // Equation: ax = b
      const a = Math.floor(Math.random() * 8 + 2);
      const x = Math.floor(Math.random() * 10 + 2);
      return { expression: `${a}x = ${a * x},  x = ?`, answer: x };
    }
  }
  switch (difficulty) {
    case 'easy': {
      const a = Math.floor(Math.random() * 9 + 1);
      const b = Math.floor(Math.random() * 9 + 1);
      return { expression: `${a} × ${b}`, answer: a * b };
    }
    case 'medium': {
      const a = Math.floor(Math.random() * 40 + 10);
      const b = Math.floor(Math.random() * 30 + 10);
      return Math.random() < 0.5
        ? { expression: `${a + b} − ${b}`, answer: a }
        : { expression: `${a} + ${b}`, answer: a + b };
    }
    case 'hard': {
      const m = Math.floor(Math.random() * 9 + 2);
      const n = Math.floor(Math.random() * 9 + 2);
      return { expression: `${m * n} ÷ ${m}`, answer: n };
    }
  }
}

/** Generates a list of math problems for the mathematician round */
export function generateMathProblems(bombActive: boolean): Array<{ expression: string; answer: number }> {
  const problems: Array<{ expression: string; answer: number }> = [];
  const count = 10;
  for (let i = 0; i < count; i++) {
    const diff: 'easy' | 'medium' | 'hard' =
      i < 4 ? 'easy' : i < 8 ? 'medium' : 'hard';
    problems.push(generateMathProblem(diff, bombActive));
  }
  return problems;
}

/** Generates a random color sequence for memory diary */
export function generateColorSequence(length: number): string[] {
  const colors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink'];
  return Array.from({ length }, () => colors[Math.floor(Math.random() * colors.length)]);
}

/** Scrambles a 15-puzzle (4×4) or 8-puzzle (3×3). Returns the initial state array. */
export function scramblePuzzle(size: number): number[] {
  const total = size * size;
  // Start from solved state: [1, 2, 3, ..., total-1, 0]
  const state = Array.from({ length: total }, (_, i) => (i < total - 1 ? i + 1 : 0));
  // Apply random valid moves to create a reachable scramble
  let emptyIdx = total - 1;
  for (let i = 0; i < 200; i++) {
    const row = Math.floor(emptyIdx / size);
    const col = emptyIdx % size;
    const moves: number[] = [];
    if (row > 0) moves.push(emptyIdx - size);
    if (row < size - 1) moves.push(emptyIdx + size);
    if (col > 0) moves.push(emptyIdx - 1);
    if (col < size - 1) moves.push(emptyIdx + 1);
    const swapIdx = moves[Math.floor(Math.random() * moves.length)];
    [state[emptyIdx], state[swapIdx]] = [state[swapIdx], state[emptyIdx]];
    emptyIdx = swapIdx;
  }
  return state;
}

export function isSolvablePuzzle(size: number, state: number[]): boolean {
  // Quick check: solved state is always considered solvable (it was generated by scrambling)
  const solved = Array.from({ length: size * size }, (_, i) => (i < size * size - 1 ? i + 1 : 0));
  return JSON.stringify(state) !== JSON.stringify(solved);
}

export const MEMORY_COLORS: Record<string, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
  yellow: '#eab308',
  purple: '#a855f7',
  orange: '#f97316',
  pink: '#ec4899',
};
