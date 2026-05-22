// src/lib/survivach/audio.ts
// Audio URL pools and player helper for Выживач

const BASE = 'https://storage.yandexcloud.net/vecherinkach/json/survivach';

/* ─── Lobby & connect ─── */
export const LOBBY_THEME = `${BASE}/lobby/lobby_theme.mp3`;
export const CONNECT_SOUND = `${BASE}/connect/1.mp3`;   // on player join

export const MEET_POOL = `${BASE}/meet/`;                // single random file played in lobby
// Files are named meet1.mp3 … meet13.mp3 (not 1.mp3)
export function randomMeetFile(): string {
  const n = Math.floor(Math.random() * 13) + 1;
  return `${MEET_POOL}meet${n}.mp3`;
}
export const RULES_MUSIC = `${BASE}/soundtrack/rules.mp3`;
export const RULES_VO_POOL = `${BASE}/rules/`;           // random VO narration of rules

export const MOVE_ANIMATION = `${BASE}/soundtrack/move_animation.mp3`; // 7 seconds
export const TIMER_POOL = `${BASE}/soundtrack/timer/`;   // random bg during timer
export const DUEL_POOL = `${BASE}/soundtrack/duel/`;     // duel intro
export const BET_MUSIC = `${BASE}/soundtrack/bet.mp3`;

/* ─── Player/duel actions background music ─── */
export const PLAYER_ACTIONS_POOL = `${BASE}/player_actions/`;
export const DUELISTS_ACTIONS_POOL = `${BASE}/duelists_actions/`;

/* ─── Bet results ─── */
export const BET_WORKED_POOL = `${BASE}/bet_worked/`;
export const BET_MIX_POOL = `${BASE}/bet_mix/`;
export const BET_UNWORKED_POOL = `${BASE}/bet_unworked/`;

/* ─── Duel outcomes ─── */
export const DRAW_POOL = `${BASE}/draw/`;
export const SUMMONED_WON_POOL = `${BASE}/summoned_won/`;
export const CALLER_WON_POOL = `${BASE}/caller_won/`;
export const ZOMBIE_WON_POOL = `${BASE}/zombie_won/`;

/* ─── Per-mode audio pools ─── */
export const MODE_AUDIO = {
  umnik: {
    normal: `${BASE}/quiz/normal/`,
    zombie_bomb: `${BASE}/quiz/zombybomb/`,
    all_correct: `${BASE}/quiz/all_correct/`,
    everyone_mistake: `${BASE}/quiz/everyone_mistake/`,
    mixed: `${BASE}/quiz/mixed/`,
  },
  mathematician: {
    normal: `${BASE}/mathematician/normal/`,
    zombie_bomb: `${BASE}/mathematician/zombybpmb/`,  // typo preserved from spec
    mixed: `${BASE}/mathematician/mixed/`,
  },
  art_historian: {
    normal: `${BASE}/art_historian/normal/`,
    zombie_bomb: `${BASE}/art_historian/zombybomb/`,
    all_correct: `${BASE}/art_historian/all_correct/`,
    everyone_mistake: `${BASE}/art_historian/everyone_mistake/`,
    mixed: `${BASE}/art_historian/mixed/`,
  },
  interpreter: {
    normal: `${BASE}/interpreter/normal/`,
    zombie_bomb: `${BASE}/interpreter/zombybomb/`,
    all_correct: `${BASE}/interpreter/all_correct/`,
    everyone_mistake: `${BASE}/interpreter/everyone_mistake/`,
    only_one_answered: `${BASE}/interpreter/only_one_answered/`,
    only_one_not_answer: `${BASE}/interpreter/only_one_not_answer/`,
    mixed: `${BASE}/interpreter/mixed/`,
  },
  memory_diary: {
    normal: `${BASE}/memory_diary/normal/`,
    zombie_bomb: `${BASE}/memory_diary/zombybomb/`,
    mixed: `${BASE}/memory_diary/mixed/`,
  },
  tag_puzzle: {
    normal: `${BASE}/tag_puzzle/normal/`,
    zombie_bomb: `${BASE}/tag_puzzle/zombybomb/`,
    mixed: `${BASE}/tag_puzzle/mixed/`,
  },
  blitz: {
    normal: `${BASE}/quiz/normal/`,
    mixed: `${BASE}/quiz/mixed/`,
  },
} as const;

/* ─── Blitz mode audio ─── */
export const BLITZ_THEME = `${BASE}/soundtrack/blitz.mp3`;
export const BLITZ_START_POOL = `${BASE}/blitz/start/`;
export const BLITZ_CHANGE_LEADER_POOL = `${BASE}/blitz/change_leader/`;

/* ─── Reaction sounds ─── */
export const LAUGH_POOL = `${BASE}/laugh/`;   // played on correct answer
export const SCREAM_POOL = `${BASE}/scream/`; // played when player becomes zombie

/* ─── Hot Potato audio ─── */
export const HOT_POTATO_START_POOL = `${BASE}/hot_potatoes/start/`;   // 1-3.mp3
export const HOT_POTATO_FAIL_POOL = `${BASE}/hot_potatoes/fail/`;     // 1-3.mp3 (alive loser)
export const HOT_POTATO_FAIL_Z_POOL = `${BASE}/hot_potatoes/fail_z/`; // 1-3.mp3 (zombie loser)

/* ─── Duel mode audio ─── */
export const DUEL_AUDIO = {
  minesweeper: {
    setup: `${BASE}/minesweeper/`,
    duelists: `${BASE}/minesweeper/for_duelists/`,
  },
  arithmetic_mean: {
    crowd: `${BASE}/arithmetic_mean/`,
    duelists: `${BASE}/arithmetic_mean/for_duelists/`,
  },
  crowd_forecast: {
    crowd: `${BASE}/crowd_forecast/`,
    duelists: `${BASE}/crowd_forecast/for_duelists/`,
  },
};

/* ─── Known file counts per pool (override the default of 5) ─── */
export const POOL_COUNTS: Record<string, number> = {
  [`${BASE}/hot_potatoes/start/`]: 3,
  [`${BASE}/hot_potatoes/fail/`]: 3,
  [`${BASE}/hot_potatoes/fail_z/`]: 3,
  [`${BASE}/quiz/mixed/`]: 3,
  [`${BASE}/art_historian/mixed/`]: 3,
  [`${BASE}/interpreter/mixed/`]: 3,
  [`${BASE}/mathematician/mixed/`]: 3,
  [`${BASE}/memory_diary/mixed/`]: 3,
  [`${BASE}/tag_puzzle/mixed/`]: 3,
  [`${BASE}/quiz/all_correct/`]: 3,
  [`${BASE}/quiz/everyone_mistake/`]: 3,
  [`${BASE}/art_historian/all_correct/`]: 3,
  [`${BASE}/art_historian/everyone_mistake/`]: 3,
  [`${BASE}/interpreter/all_correct/`]: 3,
  [`${BASE}/interpreter/everyone_mistake/`]: 3,
  [`${BASE}/interpreter/only_one_answered/`]: 3,
  [`${BASE}/interpreter/only_one_not_answer/`]: 3,
  [`${BASE}/scream/`]: 3,
  // Duel soundtrack
  [`${BASE}/soundtrack/duel/`]: 8,
  [`${BASE}/soundtrack/timer/`]: 6,
  // Duel outcomes
  [`${BASE}/draw/`]: 3,
  [`${BASE}/summoned_won/`]: 3,
  [`${BASE}/caller_won/`]: 3,
  [`${BASE}/zombie_won/`]: 3,
  // Duel ratings reveal
  [`${BASE}/duelists_actions/`]: 2,
  [`${BASE}/player_actions/`]: 3,
  // Arithmetic mean mode
  [`${BASE}/arithmetic_mean/`]: 3,
  [`${BASE}/arithmetic_mean/for_duelists/`]: 3,
};

/* ─── Helper: pick random file from a pool directory (numbered 1.mp3, 2.mp3, …) ─── */
export function randomFromPool(poolUrl: string, count = 5): string {
  const actualCount = POOL_COUNTS[poolUrl] ?? count;
  const n = Math.floor(Math.random() * actualCount) + 1;
  return `${poolUrl}${n}.mp3`;
}

/* ─── Simple audio player class for a single track ─── */
export class SurvivachAudio {
  private el: HTMLAudioElement | null = null;

  play(url: string, loop = false, onEnd?: () => void) {
    this.stop();
    if (typeof window === 'undefined') return;
    this.el = new Audio(url);
    this.el.loop = loop;
    if (onEnd) {
      let called = false;
      const safeEnd = () => { if (!called) { called = true; onEnd(); } };
      this.el.addEventListener('ended', safeEnd, { once: true });
      // Fallback: if the audio errors or can't load, still advance so the game doesn't get stuck
      this.el.addEventListener('error', safeEnd, { once: true });
      this.el.play().catch(() => { if (!loop) safeEnd(); });
    } else {
      this.el.play().catch(() => {});
    }
  }

  stop() {
    if (this.el) {
      this.el.pause();
      this.el.src = '';
      this.el = null;
    }
  }

  setVolume(v: number) {
    if (this.el) this.el.volume = Math.max(0, Math.min(1, v));
  }
}
