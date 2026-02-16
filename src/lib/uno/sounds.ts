/**
 * UNO Game Sounds — Web Audio API procedural sounds + audio file playback
 */

let _ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!_ctx || _ctx.state === 'closed') {
    _ctx = new AudioContext();
  }
  if (_ctx.state === 'suspended') {
    _ctx.resume().catch(() => {});
  }
  return _ctx;
}

/* ─── helpers ─── */

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.15) {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

function playNoise(duration: number, volume = 0.06) {
  const ctx = getCtx();
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / bufferSize);
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 2000;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(ctx.currentTime);
}

/* ─── Audio file playback ─── */

let _lobbyAudio: HTMLAudioElement | null = null;

/** Play lobby background music (loops) */
export function playLobbyMusic() {
  stopLobbyMusic();
  try {
    _lobbyAudio = new Audio('/audio/sound/jingle_uno.mp3');
    _lobbyAudio.loop = true;
    _lobbyAudio.volume = 0.3;
    _lobbyAudio.play().catch(() => {});
  } catch {}
}

/** Stop lobby background music */
export function stopLobbyMusic() {
  if (_lobbyAudio) {
    _lobbyAudio.pause();
    _lobbyAudio.currentTime = 0;
    _lobbyAudio = null;
  }
}

/** Play random duck sound (for player joins) */
export function playDuckSound() {
  try {
    const n = Math.floor(Math.random() * 7) + 1; // 1-7
    const audio = new Audio(`/audio/duck/${n}.mp3`);
    audio.volume = 0.5;
    audio.play().catch(() => {});
  } catch {}
}

/* ─── sound effects ─── */

/** Card played on table */
export function sfxPlayCard() {
  playNoise(0.08, 0.1);
  playTone(800, 0.06, 'square', 0.05);
}

/** Card drawn from pile */
export function sfxDrawCard() {
  playNoise(0.06, 0.07);
  playTone(500, 0.08, 'sine', 0.06);
}

/** Deal cards (rapid sequence) */
export function sfxDeal(cardCount = 7) {
  const ctx = getCtx();
  for (let i = 0; i < cardCount; i++) {
    setTimeout(() => {
      playNoise(0.04, 0.05);
      playTone(600 + i * 30, 0.04, 'sine', 0.04);
    }, i * 60);
  }
}

/** Your turn notification */
export function sfxYourTurn() {
  playTone(523, 0.12, 'sine', 0.12);  // C5
  setTimeout(() => playTone(659, 0.12, 'sine', 0.12), 100);  // E5
  setTimeout(() => playTone(784, 0.18, 'sine', 0.14), 200);  // G5
}

/** Someone says UNO! (1 card left) */
export function sfxUno() {
  playTone(880, 0.1, 'square', 0.08);
  setTimeout(() => playTone(1100, 0.1, 'square', 0.08), 80);
  setTimeout(() => playTone(1320, 0.15, 'square', 0.1), 160);
  setTimeout(() => playTone(1760, 0.25, 'square', 0.12), 250);
}

/** Game won — victory fanfare */
export function sfxWin() {
  const notes = [523, 587, 659, 784, 1047]; // C-D-E-G-C
  notes.forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.2 + i * 0.05, 'sine', 0.12), i * 120);
  });
}

/** Game lost */
export function sfxLose() {
  playTone(400, 0.3, 'sine', 0.1);
  setTimeout(() => playTone(350, 0.3, 'sine', 0.1), 200);
  setTimeout(() => playTone(300, 0.5, 'sine', 0.12), 400);
}

/** Wild card played */
export function sfxWild() {
  playTone(600, 0.1, 'triangle', 0.1);
  setTimeout(() => playTone(900, 0.1, 'triangle', 0.1), 60);
  setTimeout(() => playTone(1200, 0.15, 'triangle', 0.12), 120);
}

/** +2 or +4 draw penalty */
export function sfxPenalty() {
  playTone(300, 0.15, 'sawtooth', 0.06);
  setTimeout(() => playTone(250, 0.2, 'sawtooth', 0.06), 120);
}

/** Skip / Reverse played */
export function sfxAction() {
  playTone(700, 0.08, 'triangle', 0.08);
  setTimeout(() => playTone(500, 0.1, 'triangle', 0.08), 70);
}

/** Player joined lobby */
export function sfxPlayerJoin() {
  playTone(440, 0.08, 'sine', 0.08);
  setTimeout(() => playTone(554, 0.12, 'sine', 0.08), 80);
}

/** Game started */
export function sfxGameStart() {
  sfxDeal(7);
  setTimeout(() => sfxYourTurn(), 500);
}

/** Button click / interaction */
export function sfxClick() {
  playTone(1000, 0.03, 'square', 0.04);
}
