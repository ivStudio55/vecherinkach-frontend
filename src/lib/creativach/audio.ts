// src/lib/creativach/audio.ts
// Аудио-менеджер для «Креативач»

/* ─── Утилита: случайный файл ─── */
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

/* ─── Конфигурация папок с озвучкой ─── */
const VOICE_COUNTS: Record<string, number> = {
  '/audio/creativach/Greetings': 5,
  '/audio/creativach/Round1_rules': 3,
  '/audio/creativach/Round2_rules': 3,
  '/audio/creativach/Round3_rules': 3,
  '/audio/creativach/Round4_rules': 3,
  '/audio/creativach/Round5_rules': 3,
  '/audio/creativach/Motivation': 5,
  '/audio/creativach/voting': 5,
  '/audio/creativach/Results': 5,
  '/audio/creativach/Congratulations': 3,
};

function getVoiceCount(folder: string): number {
  return VOICE_COUNTS[folder] || 3;
}

/* ─── Пути к аудио ─── */
export const CREATIVACH_AUDIO = {
  // Саундтреки
  lobbyMusic: '/audio/creativach/soundtrack/lobby_theme.mp3',
  betweenMusic: '/audio/creativach/soundtrack/beetween.mp3',
  timer60Music: '/audio/creativach/soundtrack/60_sec.mp3',
  timer30Music: '/audio/creativach/soundtrack/30_sec.mp3',
  finalMusic: '/audio/creativach/soundtrack/final.mp3',

  // Голос ведущего — папки
  greetingsFolder: '/audio/creativach/Greetings',
  round1RulesFolder: '/audio/creativach/Round1_rules',
  round2RulesFolder: '/audio/creativach/Round2_rules',
  round3RulesFolder: '/audio/creativach/Round3_rules',
  round4RulesFolder: '/audio/creativach/Round4_rules',
  round5RulesFolder: '/audio/creativach/Round5_rules',
  motivationFolder: '/audio/creativach/Motivation',
  votingFolder: '/audio/creativach/voting',
  resultsFolder: '/audio/creativach/Results',
  congratulationsFolder: '/audio/creativach/Congratulations',

  // Звуки подключения (утки из общей папки)
  duckFolder: '/audio/duck',
} as const;

/**
 * Аудиоплеер с 3 каналами: BGM, Voice, SFX
 */
export class CreativachAudioPlayer {
  private bgm: HTMLAudioElement | null = null;
  private voice: HTMLAudioElement | null = null;
  private sfx: HTMLAudioElement | null = null;

  private bgmMuted = false;
  private voiceMuted = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.bgmMuted = localStorage.getItem('creativach_bgm_muted') === 'true';
      this.voiceMuted = localStorage.getItem('creativach_voice_muted') === 'true';
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
    const idx = Math.floor(Math.random() * 5) + 1;
    this.playSfx(`${CREATIVACH_AUDIO.duckFolder}/${idx}.mp3`, volume);
  }

  /* ─── Mute controls ─── */

  toggleBgmMute() {
    this.bgmMuted = !this.bgmMuted;
    if (this.bgmMuted) this.stopBgm();
    if (typeof window !== 'undefined') {
      localStorage.setItem('creativach_bgm_muted', String(this.bgmMuted));
    }
    return this.bgmMuted;
  }

  toggleVoiceMute() {
    this.voiceMuted = !this.voiceMuted;
    if (this.voiceMuted) this.stopVoice();
    if (typeof window !== 'undefined') {
      localStorage.setItem('creativach_voice_muted', String(this.voiceMuted));
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

  /* ─── Convenience: round rules voice ─── */

  playRoundRules(round: number): Promise<void> {
    const folders: Record<number, string> = {
      1: CREATIVACH_AUDIO.round1RulesFolder,
      2: CREATIVACH_AUDIO.round2RulesFolder,
      3: CREATIVACH_AUDIO.round3RulesFolder,
      4: CREATIVACH_AUDIO.round4RulesFolder,
      5: CREATIVACH_AUDIO.round5RulesFolder,
    };
    const folder = folders[round] || CREATIVACH_AUDIO.round1RulesFolder;
    return this.playVoiceRandom(folder);
  }
}
