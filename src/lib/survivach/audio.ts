// src/lib/survivach/audio.ts
// Audio URL pools and player helper for Выживач

const BASE = 'https://storage.yandexcloud.net/vecherinkach/json/survivach';

/* ─── Lobby & connect ─── */
export const LOBBY_THEME = `${BASE}/lobby/lobby_theme.mp3`;
export const CONNECT_SOUND = `${BASE}/connect/1.mp3`;   // on player join

export const MEET_POOL = `${BASE}/meet/`;                // single random file played in lobby
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

/* ─── Helper: pick random file from a pool directory (numbered 1.mp3, 2.mp3, …) ─── */
export function randomFromPool(poolUrl: string, count = 5): string {
  const n = Math.floor(Math.random() * count) + 1;
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
    if (onEnd) this.el.addEventListener('ended', onEnd, { once: true });
    this.el.play().catch(() => {});
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
