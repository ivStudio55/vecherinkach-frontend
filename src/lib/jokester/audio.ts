// src/lib/jokester/audio.ts
// Аудио-менеджер для «Пошути-кач»

const AUDIO_BASE_URL = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_AUDIO_BASE) || 'https://storage.yandexcloud.net/vecherinkach/audio';

/* ─── Утилита: случайный файл ─── */
function randomIndex(count: number): number {
  return Math.floor(Math.random() * count) + 1;
}

function randomFile(basePath: string, count: number, ext = 'mp3'): string {
  return `${basePath}/${randomIndex(count)}.${ext}`;
}

// Настроенные размеры папок с озвучкой (чтобы не повторять файлы чаще чем нужно)
const VOICE_COUNTS: Record<string, number> = {
  [`${AUDIO_BASE_URL}/sound/Jokester/meet`]: 9,
  [`${AUDIO_BASE_URL}/sound/Jokester/round`]: 10,
  [`${AUDIO_BASE_URL}/sound/Jokester/round1`]: 5,
  [`${AUDIO_BASE_URL}/sound/Jokester/round2`]: 5,
  [`${AUDIO_BASE_URL}/sound/Jokester/round3`]: 5,
  [`${AUDIO_BASE_URL}/sound/Jokester/round4`]: 5,
  [`${AUDIO_BASE_URL}/sound/Jokester/choosing_category`]: 7,
  [`${AUDIO_BASE_URL}/sound/Jokester/vote`]: 12,
  [`${AUDIO_BASE_URL}/sound/Jokester/stop_timer`]: 10,
  [`${AUDIO_BASE_URL}/sound/Jokester/stop_vote_timer`]: 8,
  [`${AUDIO_BASE_URL}/sound/Jokester/after_1`]: 3,
  [`${AUDIO_BASE_URL}/sound/Jokester/after_f`]: 10,
  [`${AUDIO_BASE_URL}/sound/Jokester/vote_comment/50`]: 5,
  [`${AUDIO_BASE_URL}/sound/Jokester/vote_comment/51-69`]: 5,
  [`${AUDIO_BASE_URL}/sound/Jokester/vote_comment/70-99`]: 5,
  [`${AUDIO_BASE_URL}/sound/Jokester/vote_comment/100`]: 5,
};

function getVoiceCount(folder: string, fallback = 1): number {
  if (VOICE_COUNTS[folder]) return VOICE_COUNTS[folder];
  if (folder.startsWith(`${AUDIO_BASE_URL}/sound/Jokester/connect/`)) return 1; // по одному файлу на каждый размер комнаты
  return fallback;
}

// Non-repeating queue per folder for voice files
const voiceQueues = new Map<string, number[]>();

function shuffledRange(count: number): number[] {
  const arr = Array.from({ length: count }, (_, i) => i + 1);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function nextVoiceIndex(folder: string, count: number): number {
  if (count <= 1) return 1;
  let queue = voiceQueues.get(folder);
  if (!queue || queue.length === 0) {
    queue = shuffledRange(count);
    voiceQueues.set(folder, queue);
  }
  return queue.pop() || 1;
}

/* ─── Пути к аудио ─── */
export const JOKESTER_AUDIO = {
  // Саундтреки
  lobbyMusic: `${AUDIO_BASE_URL}/sound/Jokester/soundTrack/lobby.mp3`,
  rulesMusic: `${AUDIO_BASE_URL}/sound/Jokester/soundTrack/rules.mp3`,
  categoryMusic: `${AUDIO_BASE_URL}/sound/Jokester/soundTrack/category.mp3`,
  timerMusic120: `${AUDIO_BASE_URL}/sound/Jokester/soundTrack/120sec.mp3`,
  voteMusic30: `${AUDIO_BASE_URL}/sound/Jokester/soundTrack/vote30sec.mp3`,
  betweenMusic: `${AUDIO_BASE_URL}/sound/Jokester/soundTrack/beetween.mp3`,
  afterRoundMusic: `${AUDIO_BASE_URL}/sound/Jokester/soundTrack/after_round.mp3`,
  finalMusic: `${AUDIO_BASE_URL}/sound/Jokester/soundTrack/final.mp3`,

  // Голос ведущего — пути к папкам
  meetFolder: `${AUDIO_BASE_URL}/sound/Jokester/meet`,
  connectFolder: (count: number) => `${AUDIO_BASE_URL}/sound/Jokester/connect/${count}`,
  round1Folder: `${AUDIO_BASE_URL}/sound/Jokester/round1`,
  round2Folder: `${AUDIO_BASE_URL}/sound/Jokester/round2`,
  round3Folder: `${AUDIO_BASE_URL}/sound/Jokester/round3`,
  round4Folder: `${AUDIO_BASE_URL}/sound/Jokester/round4`,
  roundFolder: `${AUDIO_BASE_URL}/sound/Jokester/round`,
  choosingCategoryFolder: `${AUDIO_BASE_URL}/sound/Jokester/choosing_category`,
  voteFolder: `${AUDIO_BASE_URL}/sound/Jokester/vote`,
  voteComment50: `${AUDIO_BASE_URL}/sound/Jokester/vote_comment/50`,
  voteComment51_69: `${AUDIO_BASE_URL}/sound/Jokester/vote_comment/51-69`,
  voteComment70_99: `${AUDIO_BASE_URL}/sound/Jokester/vote_comment/70-99`,
  voteComment100: `${AUDIO_BASE_URL}/sound/Jokester/vote_comment/100`,
  afterRound: (round: number) => `${AUDIO_BASE_URL}/sound/Jokester/after_${round}`,
  afterFinal: `${AUDIO_BASE_URL}/sound/Jokester/after_f`,

  // Звуки подключения (утки)
  duckSounds: [
    `${AUDIO_BASE_URL}/sound/The_duck_quacked_fun_#1.mp3`,
    `${AUDIO_BASE_URL}/sound/The_duck_quacked_fun_#2.mp3`,
    `${AUDIO_BASE_URL}/sound/The_duck_quacked_fun_#3.mp3`,
    `${AUDIO_BASE_URL}/sound/The_duck_quacked_fun_#4.mp3`,
    `${AUDIO_BASE_URL}/sound/The_duk_quacked_funn_#1.mp3`,
    `${AUDIO_BASE_URL}/sound/The_duk_quacked_funn_#2.mp3`,
    `${AUDIO_BASE_URL}/sound/The_duk_quacked_funn_#3.mp3`,
    `${AUDIO_BASE_URL}/sound/The_duk_quacked_funn_#4.mp3`,
  ],

  // Звуки голосования
  duckVote: `${AUDIO_BASE_URL}/duck`,
} as const;

/**
 * Аудиоплеер с 3 каналами: BGM (лупинг), Voice (голос ведущего), SFX (эффекты)
 */
export class JokesterAudioPlayer {
  private bgm: HTMLAudioElement | null = null;
  private voice: HTMLAudioElement | null = null;
  private sfx: HTMLAudioElement | null = null;

  private bgmMuted = false;
  private voiceMuted = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.bgmMuted = localStorage.getItem('jokester_bgm_muted') === 'true';
      this.voiceMuted = localStorage.getItem('jokester_voice_muted') === 'true';
    }
  }

  /* ─── BGM ─── */

  playBgm(src: string, volume = 0.4, loop = true) {
    this.stopBgm();
    if (this.bgmMuted) return;
    const a = new Audio(src);
    a.loop = loop;
    a.volume = volume;
    a.play().catch(() => {});
    this.bgm = a;
  }

  stopBgm() {
    if (this.bgm) {
      this.bgm.pause();
      this.bgm.currentTime = 0;
      this.bgm = null;
    }
  }

  fadeBgm(targetVol: number, durationMs = 1000) {
    if (!this.bgm) return;
    const audio = this.bgm;
    const startVol = audio.volume;
    const diff = targetVol - startVol;
    const steps = 30;
    const stepMs = durationMs / steps;
    let step = 0;
    const fade = () => {
      step++;
      audio.volume = Math.max(0, Math.min(1, startVol + diff * (step / steps)));
      if (step < steps) setTimeout(fade, stepMs);
    };
    fade();
  }

  /* ─── Voice ─── */

  playVoice(src: string, volume = 0.7): Promise<void> {
    return new Promise(resolve => {
      this.stopVoice();
      if (this.voiceMuted) { resolve(); return; }
      const a = new Audio(src);
      a.volume = volume;
      a.onended = () => {
        this.voice = null;
        this.fadeBgm(0.4, 500);
        resolve();
      };
      a.onerror = () => {
        this.voice = null;
        this.fadeBgm(0.4, 500);
        resolve();
      };
      a.play().catch(() => resolve());
      this.voice = a;
      // Приглушить фоновую музыку
      this.fadeBgm(0.15, 500);
    });
  }

  stopVoice() {
    if (this.voice) {
      this.voice.pause();
      this.voice.currentTime = 0;
      this.voice = null;
      this.fadeBgm(0.4, 500);
    }
  }

  /**
   * Plays a random voice file from a folder.
   * Assumes files are named 1.mp3, 2.mp3, ... up to `count`.
   * If count==0, tries to play 1.mp3 only.
   */
  playVoiceRandom(folderPath: string, count?: number, volume = 0.7): Promise<void> {
    const resolvedCount = count && count > 0 ? count : getVoiceCount(folderPath);
    const idx = resolvedCount > 0 ? nextVoiceIndex(folderPath, resolvedCount) : 1;
    return this.playVoice(`${folderPath}/${idx}.mp3`, volume);
  }

  /* ─── SFX ─── */

  playSfx(src: string, volume = 0.5) {
    const a = new Audio(src);
    a.volume = volume;
    a.play().catch(() => {});
    this.sfx = a;
  }

  playRandomDuck(volume = 0.5) {
    const sounds = JOKESTER_AUDIO.duckSounds;
    const src = sounds[Math.floor(Math.random() * sounds.length)];
    this.playSfx(src, volume);
  }

  playRandomDuckVote(volume = 0.4) {
    // Duck quack from Yandex Cloud duck folder
    const idx = Math.floor(Math.random() * 5) + 1;
    this.playSfx(`${AUDIO_BASE_URL}/duck/${idx}.mp3`, volume);
  }

  playBeep(frequency = 440, durationMs = 200, volume = 0.1) {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + durationMs / 1000);
    } catch (e) {
      console.error('Beep error', e);
    }
  }

  /* ─── Mute controls ─── */

  toggleBgmMute() {
    this.bgmMuted = !this.bgmMuted;
    if (this.bgmMuted) this.stopBgm();
    if (typeof window !== 'undefined') {
      localStorage.setItem('jokester_bgm_muted', String(this.bgmMuted));
    }
    return this.bgmMuted;
  }

  toggleVoiceMute() {
    this.voiceMuted = !this.voiceMuted;
    if (this.voiceMuted) this.stopVoice();
    if (typeof window !== 'undefined') {
      localStorage.setItem('jokester_voice_muted', String(this.voiceMuted));
    }
    return this.voiceMuted;
  }

  get isBgmMuted() { return this.bgmMuted; }
  get isVoiceMuted() { return this.voiceMuted; }

  /* ─── Cleanup ─── */

  destroy() {
    this.stopBgm();
    this.stopVoice();
    if (this.sfx) {
      this.sfx.pause();
      this.sfx = null;
    }
  }

  /* ─── Convenience: vote comment by percentage ─── */

  playVoteComment(winnerPercent: number): Promise<void> {
    let folder: string;
    if (winnerPercent <= 50) {
      folder = JOKESTER_AUDIO.voteComment50;
    } else if (winnerPercent <= 69) {
      folder = JOKESTER_AUDIO.voteComment51_69;
    } else if (winnerPercent <= 99) {
      folder = JOKESTER_AUDIO.voteComment70_99;
    } else {
      folder = JOKESTER_AUDIO.voteComment100;
    }
    return this.playVoiceRandom(folder);
  }

  /* ─── Round rules voice ─── */

  playRoundRules(round: number): Promise<void> {
    const folders: Record<number, string> = {
      1: JOKESTER_AUDIO.round1Folder,
      2: JOKESTER_AUDIO.round2Folder,
      3: JOKESTER_AUDIO.round3Folder,
      4: JOKESTER_AUDIO.round4Folder,
    };
    const folder = folders[round] || JOKESTER_AUDIO.round1Folder;
    return this.playVoiceRandom(folder);
  }
}
