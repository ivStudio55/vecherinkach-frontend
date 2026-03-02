/* ===== Drawinkach Audio Manager ===== */

/** Pick a random file from a numbered set */
function randomFile(basePath: string, prefix: string, count: number, ext = '.mp3'): string {
  const idx = Math.floor(Math.random() * count) + 1;
  return `${basePath}/${prefix}${idx}${ext}`;
}

/* ── Audio file mappings ── */

export const AUDIO = {
  /** Random duck quack (7 files) */
  duck: () => randomFile('/audio/duck', '', 7),
  /** Lobby jingle (loopable background) */
  lobbyJingle: '/audio/sound/jingle_draw.mp3',
  /** Host greeting in lobby (3 files) */
  meetDraw: () => randomFile('/audio/sound/meet_draw', 'meet_draw', 3),
  /** Drawing timer background music (60 sec) */
  drawTimer: '/audio/round3/60_sec.mp3',
  /** Host commentary round 1 drawing (5 files) */
  draw1Comment: () => randomFile('/audio/draw1', 'draw', 5),
  /** Host commentary round 2 drawing (5 files) */
  draw2Comment: () => randomFile('/audio/draw2', 'round2_draw', 5),
  /** Host commentary round 3 drawing (5 files) */
  draw3Comment: () => randomFile('/audio/draw3', 'round3_draw', 5),
  /** Voting jingle (same as lobby) */
  votingJingle: '/audio/sound/jingle_draw.mp3',
  /** Voting host commentary (5 files) */
  voteDraw: () => randomFile('/audio/vote_draw', 'vote_draw', 5),
  /** Host commentary for guessing phase (5 files) */
  guessDraw: () => randomFile('/audio/guess_draw', 'guess_draw', 5),
  /** After round - jingle */
  afterRoundJingle: '/audio/round1_end/jingle_after_round1.mp3',
  /** Final host voice (5 files) */
  finalDraw: () => randomFile('/audio/final_draw', 'final_draw', 5),
};

/** Get host commentary for current round */
export function getDrawCommentary(round: number): string {
  switch (round) {
    case 1: return AUDIO.draw1Comment();
    case 2: return AUDIO.draw2Comment();
    case 3: return AUDIO.draw3Comment();
    default: return AUDIO.draw1Comment();
  }
}

/* ── Audio player class for host page ── */

export class DrawAudioPlayer {
  private bgm: HTMLAudioElement | null = null;
  private voice: HTMLAudioElement | null = null;
  private sfx: HTMLAudioElement | null = null;

  private _jingleMuted = false;
  private _voiceMuted = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this._jingleMuted = localStorage.getItem('draw_bgm_muted') === 'true';
      this._voiceMuted = localStorage.getItem('draw_voice_muted') === 'true';
    }
  }

  get jingleMuted() { return this._jingleMuted; }
  get voiceMuted() { return this._voiceMuted; }

  /** Play a background music track (loops) */
  playBgm(src: string, loop = true) {
    this.stopBgm();
    if (this._jingleMuted) return;
    this.bgm = new Audio(src);
    this.bgm.loop = loop;
    this.bgm.volume = 0.4;
    this.bgm.play().catch(() => {});
  }

  stopBgm() {
    if (this.bgm) {
      this.bgm.pause();
      this.bgm.currentTime = 0;
      this.bgm = null;
    }
  }

  /** Play a voice line (one-shot, no loop) */
  playVoice(src: string) {
    this.stopVoice();
    if (this._voiceMuted) return;
    this.voice = new Audio(src);
    this.voice.volume = 0.7;
    this.voice.play().catch(() => {});
  }

  stopVoice() {
    if (this.voice) {
      this.voice.pause();
      this.voice.currentTime = 0;
      this.voice = null;
    }
  }

  /** Play a short sound effect (one-shot) */
  playSfx(src: string) {
    // Don't stop previous sfx, allow overlap
    this.sfx = new Audio(src);
    this.sfx.volume = 0.6;
    this.sfx.play().catch(() => {});
  }

  /** Toggle jingle mute */
  toggleJingleMute(): boolean {
    this._jingleMuted = !this._jingleMuted;
    if (this._jingleMuted) {
      this.stopBgm();
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('draw_bgm_muted', String(this._jingleMuted));
    }
    return this._jingleMuted;
  }

  /** Toggle voice mute */
  toggleVoiceMute(): boolean {
    this._voiceMuted = !this._voiceMuted;
    if (this._voiceMuted) {
      this.stopVoice();
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('draw_voice_muted', String(this._voiceMuted));
    }
    return this._voiceMuted;
  }

  /** Stop everything */
  stopAll() {
    this.stopBgm();
    this.stopVoice();
    if (this.sfx) {
      this.sfx.pause();
      this.sfx = null;
    }
  }
}
