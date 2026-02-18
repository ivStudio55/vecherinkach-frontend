// src/lib/jokester/audio.ts
// Аудио-менеджер для «Пошути-кач»

/* ─── Утилита: случайный файл ─── */
function randomIndex(count: number): number {
  return Math.floor(Math.random() * count) + 1;
}

function randomFile(basePath: string, count: number, ext = 'mp3'): string {
  return `${basePath}/${randomIndex(count)}.${ext}`;
}

/* ─── Пути к аудио ─── */
export const JOKESTER_AUDIO = {
  // Саундтреки
  lobbyMusic: '/audio/sound/Jokester/soundTrack/lobby.mp3',
  rulesMusic: '/audio/sound/Jokester/soundTrack/rules.mp3',
  categoryMusic: '/audio/sound/Jokester/soundTrack/category.mp3',
  timerMusic120: '/audio/sound/Jokester/soundTrack/120sec.mp3',
  voteMusic30: '/audio/sound/Jokester/soundTrack/vote30sec.mp3',
  betweenMusic: '/audio/sound/Jokester/soundTrack/beetween.mp3',
  finalMusic: '/audio/sound/Jokester/soundTrack/final.mp3',

  // Голос ведущего — пути к папкам
  meetFolder: '/audio/sound/Jokester/meet',
  connectFolder: (count: number) => `/audio/sound/Jokester/connect/${count}`,
  round1Folder: '/audio/sound/Jokester/round1',
  round2Folder: '/audio/sound/Jokester/round2',
  round3Folder: '/audio/sound/Jokester/round3',
  round4Folder: '/audio/sound/Jokester/round4',
  roundFolder: '/audio/sound/Jokester/round',
  choosingCategoryFolder: '/audio/sound/Jokester/choosing_category',
  voteFolder: '/audio/sound/Jokester/vote',
  voteComment50: '/audio/sound/Jokester/vote_comment/50',
  voteComment51_69: '/audio/sound/Jokester/vote_comment/51-69',
  voteComment70_99: '/audio/sound/Jokester/vote_comment/70-99',
  voteComment100: '/audio/sound/Jokester/vote_comment/100',
  afterRound: (round: number) => `/audio/sound/Jokester/after_${round}`,
  afterFinal: '/audio/sound/Jokester/after_f',

  // Звуки подключения (утки)
  duckSounds: [
    '/audio/sound/The_duck_quacked_fun_#1.mp3',
    '/audio/sound/The_duck_quacked_fun_#2.mp3',
    '/audio/sound/The_duck_quacked_fun_#3.mp3',
    '/audio/sound/The_duck_quacked_fun_#4.mp3',
    '/audio/sound/The_duk_quacked_funn_#1.mp3',
    '/audio/sound/The_duk_quacked_funn_#2.mp3',
    '/audio/sound/The_duk_quacked_funn_#3.mp3',
    '/audio/sound/The_duk_quacked_funn_#4.mp3',
  ],

  // Звуки голосования
  duckVote: '/audio/duck',
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

  /* ─── BGM ─── */

  playBgm(src: string, volume = 0.4) {
    this.stopBgm();
    if (this.bgmMuted) return;
    const a = new Audio(src);
    a.loop = true;
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
        resolve();
      };
      a.onerror = () => {
        this.voice = null;
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
  playVoiceRandom(folderPath: string, count = 4, volume = 0.7): Promise<void> {
    const idx = count > 0 ? randomIndex(count) : 1;
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
    // Duck quack from /audio/duck/ folder
    const idx = Math.floor(Math.random() * 5) + 1;
    this.playSfx(`/audio/duck/${idx}.mp3`, volume);
  }

  /* ─── Mute controls ─── */

  toggleBgmMute() {
    this.bgmMuted = !this.bgmMuted;
    if (this.bgmMuted) this.stopBgm();
    return this.bgmMuted;
  }

  toggleVoiceMute() {
    this.voiceMuted = !this.voiceMuted;
    if (this.voiceMuted) this.stopVoice();
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

  playVoteComment(winnerPercent: number, count = 3): Promise<void> {
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
    return this.playVoiceRandom(folder, count);
  }

  /* ─── Round rules voice ─── */

  playRoundRules(round: number, count = 3): Promise<void> {
    const folders: Record<number, string> = {
      1: JOKESTER_AUDIO.round1Folder,
      2: JOKESTER_AUDIO.round2Folder,
      3: JOKESTER_AUDIO.round3Folder,
      4: JOKESTER_AUDIO.round4Folder,
    };
    const folder = folders[round] || JOKESTER_AUDIO.round1Folder;
    return this.playVoiceRandom(folder, count);
  }
}
