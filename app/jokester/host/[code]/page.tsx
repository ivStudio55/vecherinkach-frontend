// app/jokester/host/[code]/page.tsx
// Экран ведущего «Пошути-кач»
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { useParams } from 'next/navigation';
import { QRCodeCanvas } from 'qrcode.react';
import {
  fetchJokesterRoom,
  fetchJokesterPlayers,
  fetchJokesterDuels,
  fetchDuelAnswers,
  fetchDuelVotes,
  fetchCategoryVotes,
  updateJokesterRoom,
  subscribeJokesterRoom,
  subscribeJokesterPlayers,
  subscribeJokesterDuels,
  subscribeJokesterAnswers,
  subscribeJokesterVotes,
  subscribeJokesterCategoryVotes,
  generateDuelSchedule,
  createDuels,
  selectQuestions,
  getUsedQuestions,
  markQuestionsUsed,
  updatePlayerPoints,
  jokesterStorage,
} from '@/lib/jokester/api';
import { JokesterAudioPlayer, JOKESTER_AUDIO } from '@/lib/jokester/audio';
import type {
  JokesterRoom,
  JokesterPlayer,
  JokesterDuel,
  JokesterAnswer,
  JokesterVote,
  JokesterCategoryVote,
  JokesterQuestionPack,
  JokesterCategory,
} from '@/lib/jokester/types';
import {
  POINTS,
  roundMultiplier,
  ANSWER_TIME_SEC,
  VOTE_TIME_SEC,
  CATEGORY_VOTE_TIME_SEC,
  MAX_PLAYERS,
} from '@/lib/jokester/types';

type VoteReveal = {
  answer: string;
  playerName: string;
  playerAvatar: string | null;
  question: string;
  winnerLabel: string;
  pointsFrom: number;
  pointsTo: number;
  rank?: number;
  winnerId?: string;
  loserId?: string;
};

type FeatherSpawn = {
  x: number;
  y: number;
  count?: number;
  spread?: number;
  speed?: number;
};

type CreditsAnswer = {
  question: string;
  answer: string;
  round: number;
};

type CreditsPlayerBest = {
  player: JokesterPlayer;
  bestAnswer: { question: string; answer: string; votes: number } | null;
};

const YANDEX_AUDIO_BASE = process.env.NEXT_PUBLIC_AUDIO_BASE ?? 'https://storage.yandexcloud.net/vecherinkach/audio';
const START_DUCK_SOUNDS = [
  `${YANDEX_AUDIO_BASE}/duck/1.mp3`,
  `${YANDEX_AUDIO_BASE}/duck/2.mp3`,
  `${YANDEX_AUDIO_BASE}/duck/3.mp3`,
  `${YANDEX_AUDIO_BASE}/duck/4.mp3`,
  `${YANDEX_AUDIO_BASE}/duck/5.mp3`,
  `${YANDEX_AUDIO_BASE}/duck/6.mp3`,
  `${YANDEX_AUDIO_BASE}/duck/7.mp3`,
];

const panelDelayStyle = (value: string): CSSProperties => ({ '--panel-delay': value } as CSSProperties);

/* ─── Deadline Overlay Component ─── */
function DeadlineOverlay({ seconds }: { seconds: number }) {
  if (seconds > 3 || seconds <= 0) return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center overflow-hidden">
      {/* Comic sunburst background effect */}
      <div className="absolute inset-0 opacity-30 animate-[spin_20s_linear_infinite]" style={{
        background: 'repeating-conic-gradient(from 0deg, transparent 0deg 15deg, #ff0000 15deg 30deg)'
      }} />
      
      {/* Halftone dots overlay */}
      <div className="absolute inset-0 opacity-20 comic-bg-dots-red" />

      {/* Main Explosion Container */}
      <div className="relative flex flex-col items-center justify-center animate-[bounce_0.5s_infinite]">
        {/* Explosion Shape Background */}
        <div className="absolute inset-0 bg-yellow-400 border-8 border-black shadow-[16px_16px_0px_0px_rgba(0,0,0,1)] transform scale-150 rotate-3" style={{
          clipPath: 'polygon(50% 0%, 61% 25%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 25%)'
        }} />
        
        {/* Content */}
        <div className="relative z-10 flex flex-col items-center transform -rotate-3">
          <h2 className="text-7xl md:text-9xl font-black text-red-600 uppercase tracking-tighter" style={{
            WebkitTextStroke: '4px black',
            textShadow: '8px 8px 0 #000'
          }}>
            DEADLINE!
          </h2>
          
          <div className="mt-4 bg-white border-8 border-black rounded-full w-48 h-48 flex flex-col items-center justify-center shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] relative">
            {/* Alarm clock bells */}
            <div className="absolute -top-6 -left-4 w-16 h-16 bg-red-500 border-4 border-black rounded-full shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" />
            <div className="absolute -top-6 -right-4 w-16 h-16 bg-red-500 border-4 border-black rounded-full shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" />
            
            <span className="text-6xl mb-[-10px] animate-wiggle">⏰</span>
            <span className="text-7xl font-black text-black drop-shadow-[4px_4px_0_#ff0000]">
              {seconds}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════ */
export function JokesterHostContent({ isMirror: _isMirror = false }: { isMirror?: boolean }) {
  const params = useParams();
  const roomCode = params.code as string;

  /* ─── State ─── */
  const [room, setRoom] = useState<JokesterRoom | null>(null);
  const [players, setPlayers] = useState<JokesterPlayer[]>([]);
  const [duels, setDuels] = useState<JokesterDuel[]>([]);
  const [currentAnswers, setCurrentAnswers] = useState<JokesterAnswer[]>([]);
  const [currentVotes, setCurrentVotes] = useState<JokesterVote[]>([]);
  const [categoryVotes, setCategoryVotes] = useState<JokesterCategoryVote[]>([]);
  const [categories, setCategories] = useState<JokesterCategory[]>([]);
  const [timer, setTimer] = useState(0);
  const [showDeAnon, setShowDeAnon] = useState(false);
  const [bestAnswer, setBestAnswer] = useState<{ text: string; playerName: string; playerAvatar: string; question: string } | null>(null);
  const [voteReveal, setVoteReveal] = useState<VoteReveal | null>(null);
  const [showRank, setShowRank] = useState(false);
  const [creditsData, setCreditsData] = useState<{ winnerAnswers: CreditsAnswer[]; playerRanks: CreditsPlayerBest[] } | null>(null);
  const [isBgmMuted, setIsBgmMuted] = useState(false);
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const [isAnimationsDisabled, setIsAnimationsDisabled] = useState(false);
  const [isJoinQrModalOpen, setIsJoinQrModalOpen] = useState(false);

  useEffect(() => {
    setIsBgmMuted(localStorage.getItem('jokester_bgm_muted') === 'true');
    setIsVoiceMuted(localStorage.getItem('jokester_voice_muted') === 'true');
    setIsAnimationsDisabled(localStorage.getItem('jokester_animations_disabled') === 'true');
  }, []);
  const [timerTickKey, setTimerTickKey] = useState(0);
  const [vsScreenActive, setVsScreenActive] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<JokesterAudioPlayer | null>(null);
  const prevPlayerCountRef = useRef(0);
  const audioUnlockedRef = useRef(false);
  const pendingConnectSoundsRef = useRef(0);
  const pendingIntroVoiceRef = useRef(false);
  const autoStartingDuelsRef = useRef(false);
  const prevVoteCountRef = useRef(0);
  const prevAnswerCountRef = useRef(0);
  const voteEndLockRef = useRef(false);
  const selectedTopCategoriesRef = useRef<string[]>([]);
  const featherEmitterRef = useRef<((spawn: FeatherSpawn) => void) | null>(null);
  const answeredDoneRef = useRef<Set<string>>(new Set());
  const winnerPanelRef = useRef<HTMLDivElement | null>(null);
  const roomIntroPlayedRef = useRef(false);
  const currentDuel = duels.find(d => d.duel_index === room?.current_duel_index && d.round === room?.current_round);

  const avatarSrc = useCallback((avatar?: string | null) => {
    if (!avatar) return `${YANDEX_AUDIO_BASE}/sound/Jokester/ava/1.png`;
    const normalized = avatar.replace(/^ava(\d+)\.png$/i, '$1.png');
    return `${YANDEX_AUDIO_BASE}/sound/Jokester/ava/${normalized}`;
  }, []);

  const categoryLabel = useCallback((categoryId?: string | null) => {
    if (!categoryId) return 'Категория';
    const found = categories.find(c => c.id === categoryId || c.name === categoryId);
    return found?.name || categoryId;
  }, [categories]);

  const playRandomSound = useCallback((files: string[], volume = 0.85) => {
    if (files.length === 0) return;
    const src = files[Math.floor(Math.random() * files.length)];
    const audio = new Audio(src);
    audio.volume = volume;
    void audio.play().catch(() => {});
  }, []);

  const playConnectQuack = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.playRandomDuckVote(0.75);
    } else {
      playRandomSound(START_DUCK_SOUNDS, 0.75);
    }
  }, [playRandomSound]);

  const playMeetVoice = useCallback(() => {
    audioRef.current?.playVoiceRandom(JOKESTER_AUDIO.meetFolder);
  }, []);

  const unlockAudio = useCallback(() => {
    if (audioUnlockedRef.current) return;
    audioUnlockedRef.current = true;
    const pending = pendingConnectSoundsRef.current;
    pendingConnectSoundsRef.current = 0;
    for (let i = 0; i < Math.min(3, pending); i++) {
      setTimeout(() => playConnectQuack(), i * 180);
    }
    if (pendingIntroVoiceRef.current) {
      pendingIntroVoiceRef.current = false;
      setTimeout(() => playMeetVoice(), Math.min(3, pending) * 180);
    }
  }, [playConnectQuack, playMeetVoice]);

  const registerFeatherEmitter = useCallback((emit: (spawn: FeatherSpawn) => void) => {
    featherEmitterRef.current = emit;
  }, []);

  const emitFeathers = useCallback((spawn: FeatherSpawn) => {
    featherEmitterRef.current?.(spawn);
  }, []);

  const emitAtElement = useCallback((el: HTMLElement | null, options?: Omit<FeatherSpawn, 'x' | 'y'>) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    emitFeathers({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      count: options?.count,
      spread: options?.spread,
      speed: options?.speed,
    });
  }, [emitFeathers]);

  /* ─── Audio init ─── */
  useEffect(() => {
    audioRef.current = new JokesterAudioPlayer();
    return () => { audioRef.current?.destroy(); };
  }, []);

  /* ─── Load questions ─── */
  useEffect(() => {
    fetch('/questions/jokester_questions.json')
      .then(r => r.json())
      .then((data: JokesterQuestionPack) => setCategories(data.categories))
      .catch(console.error);
  }, []);

  /* ─── Initial fetch ─── */
  useEffect(() => {
    if (!roomCode) return;
    (async () => {
      const r = await fetchJokesterRoom(roomCode);
      if (r) {
        setRoom(r);
        const p = await fetchJokesterPlayers(r.id);
        setPlayers(p);
        prevPlayerCountRef.current = p.filter(player => player.role === 'player' && !player.is_host).length;
        const d = await fetchJokesterDuels(r.id);
        setDuels(d);
      }
    })();
  }, [roomCode]);

  /* ─── Room creation cue ─── */
  useEffect(() => {
    if (!room?.id || roomIntroPlayedRef.current) return;
    roomIntroPlayedRef.current = true;
    if (audioUnlockedRef.current) {
      playMeetVoice();
    } else {
      pendingIntroVoiceRef.current = true;
    }
  }, [room?.id, playMeetVoice]);

  /* ─── Realtime subscriptions ─── */
  useEffect(() => {
    if (!room) return;
    const unsubs = [
      subscribeJokesterRoom(room.id, r => setRoom(r)),
      subscribeJokesterPlayers(room.id, p => {
        const nextPlayerCount = p.filter(player => player.role === 'player' && !player.is_host).length;
        const diff = nextPlayerCount - prevPlayerCountRef.current;
        if (diff > 0) {
          if (audioUnlockedRef.current) {
            for (let i = 0; i < Math.min(3, diff); i++) {
              setTimeout(() => playConnectQuack(), i * 160);
            }
          } else {
            pendingConnectSoundsRef.current += diff;
          }
        }
        prevPlayerCountRef.current = nextPlayerCount;
        setPlayers(p);
      }),
      subscribeJokesterDuels(room.id, d => setDuels(d)),
    ];
    return () => unsubs.forEach(fn => fn());
  }, [room?.id, playConnectQuack]);

  useEffect(() => {
    const handleUnlock = () => unlockAudio();
    window.addEventListener('pointerdown', handleUnlock, { once: true });
    window.addEventListener('keydown', handleUnlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', handleUnlock);
      window.removeEventListener('keydown', handleUnlock);
    };
  }, [unlockAudio]);

  useEffect(() => {
    if (!room || room.voting_phase !== 'voting' || !currentDuel) return;
    prevVoteCountRef.current = 0;
    const unsub = subscribeJokesterVotes(currentDuel.id, votes => {
      if (votes.length > prevVoteCountRef.current) {
        audioRef.current?.playRandomDuckVote(0.35);
      }
      prevVoteCountRef.current = votes.length;
      setCurrentVotes(votes);
    });
    return unsub;
  }, [room?.id, room?.voting_phase, currentDuel?.id]);

  useEffect(() => {
    if (!room || room.voting_phase !== 'voting' || !currentDuel) return;
    fetchDuelAnswers(currentDuel.id).then(setCurrentAnswers);
    return subscribeJokesterAnswers(currentDuel.id, setCurrentAnswers);
  }, [room?.id, room?.voting_phase, currentDuel?.id]);

  useEffect(() => {
    if (room?.voting_phase === 'voting') {
      setVsScreenActive(true);
      const t = setTimeout(() => setVsScreenActive(false), 4000);
      return () => clearTimeout(t);
    } else {
      setVsScreenActive(false);
    }
  }, [room?.voting_phase, currentDuel?.id]);

  useEffect(() => {
    if (!room || room.status !== 'category_vote') return;
    fetchCategoryVotes(room.id, room.current_round).then(setCategoryVotes);
    return subscribeJokesterCategoryVotes(room.id, room.current_round, setCategoryVotes);
  }, [room?.id, room?.status, room?.current_round]);

  useEffect(() => {
    setTimerTickKey(prev => prev + 1);
  }, [timer]);

  useEffect(() => {
    if (!room || room.voting_phase !== 'answering') return;
    let cancelled = false;
    prevAnswerCountRef.current = 0;
    const tick = async () => {
      const roundDuels = duels.filter(d => d.round === room.current_round);
      const all = await Promise.all(roundDuels.map(d => fetchDuelAnswers(d.id)));
      if (!cancelled) {
        const flat = all.flat();
        if (flat.length > prevAnswerCountRef.current) {
          audioRef.current?.playRandomDuckVote(0.35);
        }
        prevAnswerCountRef.current = flat.length;
        setCurrentAnswers(flat);
      }
    };
    void tick();
    const iv = setInterval(() => { void tick(); }, 2000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [room?.id, room?.voting_phase, room?.current_round, duels]);

  /* ─── Lobby music ─── */
  useEffect(() => {
    if (room?.status === 'lobby') {
      audioRef.current?.playBgm(JOKESTER_AUDIO.lobbyMusic, 0.3);
      // Голос ведущего на лобби
      audioRef.current?.playVoiceRandom(JOKESTER_AUDIO.meetFolder);
    }
    return () => {};
  }, [room?.status]);

  /* ─── Timer logic ─── */
  const startTimer = useCallback((
    seconds: number,
    onEnd?: () => void,
    options?: { preEndSfxAtSec?: number; preEndSfxFolder?: string; preEndSfxCount?: number; preEndSfxVolume?: number },
  ) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimer(seconds);
    timerRef.current = setInterval(() => {
      setTimer(prev => {
        const nextSec = prev - 1;
        
        if (options?.preEndSfxAtSec && options?.preEndSfxFolder && nextSec === options.preEndSfxAtSec) {
          const count = Math.max(1, options.preEndSfxCount || 1);
          const idx = Math.floor(Math.random() * count) + 1;
          audioRef.current?.playSfx(`${options.preEndSfxFolder}/${idx}.mp3`, options.preEndSfxVolume ?? 0.65);
        }

        if (nextSec <= 10 && nextSec > 0) {
          const freq = 400 + (10 - nextSec) * 50;
          audioRef.current?.playBeep(freq, 150, 0.15);
        } else if (nextSec === 0) {
          audioRef.current?.playBeep(1000, 400, 0.2);
        }

        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          onEnd?.();
          return 0;
        }
        return nextSec;
      });
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setTimer(0);
  }, []);

  /* ─── Computed ─── */
  const gamePlayers = players.filter(p => p.role === 'player' && !p.is_host);
  const spectators = players.filter(p => p.role === 'spectator');
  const allGamePlayers = players.filter(p => p.role === 'player');
  const sortedByPoints = [...allGamePlayers].sort((a, b) => b.total_points - a.total_points);
  const finalists = sortedByPoints.slice(0, 2);
  const inFinalPhase = room?.status === 'final_rules'
    || room?.status === 'final_playing'
    || room?.status === 'final_results'
    || room?.status === 'credits';
  const activePlayers = inFinalPhase ? finalists : gamePlayers;
  const roundDuels = duels.filter(d => d.round === room?.current_round);

  const answerProgress = activePlayers.map(player => {
    const expected = roundDuels.filter(d => d.player1_id === player.id || d.player2_id === player.id).length;
    const answered = currentAnswers.filter(
      a => a.player_id === player.id && a.question_index === 0 && roundDuels.some(d => d.id === a.duel_id),
    ).length;
    const done = expected > 0 && answered >= expected;
    return { player, expected, answered, done };
  });

  useEffect(() => {
    if (room?.voting_phase !== 'answering') {
      answeredDoneRef.current.clear();
      return;
    }
    for (const progress of answerProgress) {
      if (!progress.done || answeredDoneRef.current.has(progress.player.id)) continue;
      answeredDoneRef.current.add(progress.player.id);
      const checkEl = document.getElementById(`answer-check-${progress.player.id}`);
      emitAtElement(checkEl, { count: 24, spread: 90, speed: 4.8 });
      playRandomSound(START_DUCK_SOUNDS, 0.35);
    }
  }, [answerProgress, room?.voting_phase, emitAtElement, playRandomSound]);

  const triggerStartButtonEffects = useCallback((target: HTMLElement | null) => {
    emitAtElement(target, { count: 42, spread: 160, speed: 6.8 });
    playRandomSound(START_DUCK_SOUNDS, 0.7);
  }, [emitAtElement, playRandomSound]);

  /* ─── Category vote ranking ─── */
  const categoryRanking = categories
    .map(cat => ({
      ...cat,
      votes: categoryVotes.filter(v => v.category === cat.id).length,
    }))
    .sort((a, b) => b.votes - a.votes);

  /* ─── Spectator hall seats ─── */
  const spectatorCount = spectators.length;
  const hallSize = spectatorCount <= 50 ? 50 : spectatorCount <= 100 ? 100 : Math.ceil(spectatorCount / 50) * 50;

  /* ══════════════════════════════════════════════
     Actions
     ══════════════════════════════════════════════ */

  const handleStartGame = async () => {
    if (!room) return;
    unlockAudio();
    audioRef.current?.stopBgm();

    // Предыгровой экран
    await updateJokesterRoom(room.id, { status: 'starting', state_version: room.state_version + 1 });

    // Голос по количеству игроков
    const count = gamePlayers.length;
    const folder = JOKESTER_AUDIO.connectFolder(Math.min(Math.max(count, 4), 10));
    await audioRef.current?.playVoiceRandom(folder);

    // Переход к голосованию за категории
    await updateJokesterRoom(room.id, {
      status: 'round_rules',
      current_round: 1,
      voting_phase: 'idle',
      state_version: room.state_version + 2,
    });
  };

  const handleStartRound = async (roomSnapshot?: JokesterRoom) => {
    const effectiveRoom = roomSnapshot || room;
    if (!effectiveRoom) return;
    const round = effectiveRoom.current_round;

    // Озвучка правил
    audioRef.current?.playBgm(JOKESTER_AUDIO.rulesMusic, 0.25);
    await updateJokesterRoom(effectiveRoom.id, { status: 'round_rules', state_version: effectiveRoom.state_version + 1 });
    await audioRef.current?.playRoundRules(round);
    audioRef.current?.stopBgm();

    if (round === 1) {
      // Голосование за категории только перед первым раундом
      await updateJokesterRoom(effectiveRoom.id, { status: 'category_vote', state_version: effectiveRoom.state_version + 2 });

      audioRef.current?.playBgm(`${YANDEX_AUDIO_BASE}/sound/Jokester/soundTrack/category.mp3`, 0.4);
      void audioRef.current?.playVoiceRandom(JOKESTER_AUDIO.choosingCategoryFolder);

      startTimer(CATEGORY_VOTE_TIME_SEC, () => {
        if (!autoStartingDuelsRef.current) {
          autoStartingDuelsRef.current = true;
          void handleStartDuels(effectiveRoom);
        }
      });
      return;
    }

    // Раунды 2 и 3: используем категории, выбранные в 1 раунде
    await handleStartDuels(effectiveRoom);
  };

  const handleStartDuels = async (roomSnapshot?: JokesterRoom) => {
    const effectiveRoom = roomSnapshot || room;
    if (!effectiveRoom) return;
    if (autoStartingDuelsRef.current && effectiveRoom.voting_phase === 'answering') return;
    autoStartingDuelsRef.current = true;
    stopTimer();
    audioRef.current?.stopBgm();

    const round = effectiveRoom.current_round;
    const playerIds = gamePlayers.map(p => p.id);

    // Определяем топ-N категорий
    let topCats: string[] = selectedTopCategoriesRef.current;
    if (round === 1 || topCats.length === 0) {
      const round1Votes = round === 1 ? categoryVotes : await fetchCategoryVotes(effectiveRoom.id, 1);
      const ranked = categories
        .map(cat => ({ ...cat, votes: round1Votes.filter(v => v.category === cat.id).length }))
        .sort((a, b) => b.votes - a.votes);
      const votedCats = ranked.filter(c => c.votes > 0).map(c => c.id);
      topCats = votedCats.length > 0 ? votedCats : ranked.map(c => c.id);
      selectedTopCategoriesRef.current = topCats;
    }

    // Подбираем вопросы — 1 вопрос на дуэль (каждый игрок в 2 дуэлях => 2 вопроса на игрока)
    const schedule = generateDuelSchedule(playerIds);
    const usedTexts = await getUsedQuestions(effectiveRoom.id);
    const questions = selectQuestions(categories, topCats, schedule.length, usedTexts);
    await markQuestionsUsed(effectiveRoom.id, round, questions);

    // Создаём все дуэли раунда
    await createDuels(effectiveRoom.id, round, schedule, questions);

    // Рефетч дуэлей
    const freshDuels = await fetchJokesterDuels(effectiveRoom.id, round);
    setDuels(freshDuels);

    // Фаза 1: все игроки отвечают одновременно (120 сек)
    audioRef.current?.playBgm(`${YANDEX_AUDIO_BASE}/sound/Jokester/soundTrack/120sec.mp3`, 0.35, false);
    audioRef.current?.playVoiceRandom(JOKESTER_AUDIO.roundFolder);

    await updateJokesterRoom(effectiveRoom.id, {
      status: 'round_playing',
      current_duel_index: 0,
      current_question: 0,
      voting_phase: 'answering',
      timer_duration_sec: ANSWER_TIME_SEC,
      timer_started_at: new Date().toISOString(),
      state_version: effectiveRoom.state_version + 3,
    });

    // По истечении 120 сек начинаем поочерёдные дуэли с голосованием
    startTimer(ANSWER_TIME_SEC, () => handleAnswerPhaseEnd(), {
      preEndSfxAtSec: 10,
      preEndSfxFolder: `${YANDEX_AUDIO_BASE}/sound/Jokester/stop_timer`,
      preEndSfxCount: 10,
      preEndSfxVolume: 0.75,
    });
  };

  // Вызывается когда 120 сек на ответы истекли → начинаем первую дуэль
  const handleAnswerPhaseEnd = async () => {
    if (!room) return;
    audioRef.current?.stopBgm();
    const freshRoom = await fetchJokesterRoom(room.code);
    // Запускаем голосование первой дуэли
    await startDuelVoting(0, freshRoom || room);
  };

  // Начать фазу голосования для дуэли с указанным индексом
  const startDuelVoting = async (duelIndex: number, roomSnapshot?: JokesterRoom) => {
    const effectiveRoom = roomSnapshot || room;
    if (!effectiveRoom) return;
    audioRef.current?.stopBgm();
    setVoteReveal(null);

    // Рефетч ответов текущей дуэли для отображения на экране
    const duelList = await fetchJokesterDuels(effectiveRoom.id, effectiveRoom.current_round);
    setDuels(duelList);
    const duel = duelList[duelIndex];
    if (!duel) {
      await updateJokesterRoom(effectiveRoom.id, { status: 'round_results', voting_phase: 'results', state_version: effectiveRoom.state_version + 100 });
      audioRef.current?.stopBgm();
      return;
    }
    const answers = await fetchDuelAnswers(duel.id);
    setCurrentAnswers(answers);
    setCurrentVotes([]);

    await updateJokesterRoom(effectiveRoom.id, {
      current_duel_index: duelIndex,
      current_question: 0,
      voting_phase: 'voting',
      timer_started_at: new Date().toISOString(),
      timer_duration_sec: VOTE_TIME_SEC,
      state_version: effectiveRoom.state_version + 10 + duelIndex,
    });

    audioRef.current?.playBgm(`${YANDEX_AUDIO_BASE}/sound/Jokester/soundTrack/vote30sec.mp3`, 0.4, false);
    audioRef.current?.playVoiceRandom(JOKESTER_AUDIO.voteFolder);
    setShowDeAnon(false);

    startTimer(VOTE_TIME_SEC, () => {
      void handleVoteEnd();
    }, {
      preEndSfxAtSec: 10,
      preEndSfxFolder: `${YANDEX_AUDIO_BASE}/sound/Jokester/stop_vote_timer`,
      preEndSfxCount: 8,
      preEndSfxVolume: 0.75,
    });
  };

  // Оставляем для совместимости — теперь не используется напрямую
  const handleDuelAnswerTimeout = handleAnswerPhaseEnd;

  const handleVoteEnd = async () => {
    audioRef.current?.stopBgm();
    if (!room || voteEndLockRef.current) return;
    voteEndLockRef.current = true;
    setShowDeAnon(true);

    try {
      const freshRoom = await fetchJokesterRoom(room.code);
      const roomSnapshot = freshRoom || room;
      const roundDuels = await fetchJokesterDuels(roomSnapshot.id, roomSnapshot.current_round);
      const duel = roundDuels.find(d => d.duel_index === roomSnapshot.current_duel_index);

      if (!duel) {
        await updateJokesterRoom(roomSnapshot.id, { status: 'round_results', voting_phase: 'results', state_version: roomSnapshot.state_version + 500 });
        return;
      }

      // Подсчёт голосов
      const votes = (await fetchDuelVotes(duel.id)).filter(v => v.question_index === 0);
      setCurrentVotes(votes);

      const p1votes = votes.filter(v => v.voted_for_id === duel.player1_id);
      const p2votes = votes.filter(v => v.voted_for_id === duel.player2_id);

    const p1playerVotes = p1votes.filter(v => v.voter_role === 'player').length;
    const p1spectatorVotes = p1votes.filter(v => v.voter_role === 'spectator').length;
    const p2playerVotes = p2votes.filter(v => v.voter_role === 'player').length;
    const p2spectatorVotes = p2votes.filter(v => v.voter_role === 'spectator').length;

      const mult = roundMultiplier(roomSnapshot.current_round);
      const totalVotes = votes.length;
      const winnerPercent = totalVotes > 0
        ? Math.round((Math.max(p1votes.length, p2votes.length) / totalVotes) * 100)
        : 50;

      const p1Before = players.find(p => p.id === duel.player1_id)?.total_points || 0;
      const p2Before = players.find(p => p.id === duel.player2_id)?.total_points || 0;

    // Начислить очки
      let winnerId: string | null = null;
      let p1WinPoints = 0;
      let p2WinPoints = 0;
      if (p1votes.length > p2votes.length) {
        winnerId = duel.player1_id;
        p1WinPoints = POINTS.DUEL_WIN * mult;
      } else if (p2votes.length > p1votes.length) {
        winnerId = duel.player2_id;
        p2WinPoints = POINTS.DUEL_WIN * mult;
      }

      const p1PointsFromVotes = (p1playerVotes * POINTS.PLAYER_VOTE * mult) + (p1spectatorVotes * POINTS.SPECTATOR_VOTE * mult);
      const p2PointsFromVotes = (p2playerVotes * POINTS.PLAYER_VOTE * mult) + (p2spectatorVotes * POINTS.SPECTATOR_VOTE * mult);

      await updatePlayerPoints(
        duel.player1_id,
        p1WinPoints + p1PointsFromVotes,
        p1playerVotes,
        p1spectatorVotes
      );
      await updatePlayerPoints(
        duel.player2_id,
        p2WinPoints + p2PointsFromVotes,
        p2playerVotes,
        p2spectatorVotes
      );

      const p1Delta = (winnerId === duel.player1_id ? POINTS.DUEL_WIN * mult : 0)
        + (p1playerVotes * POINTS.PLAYER_VOTE * mult)
        + (p1spectatorVotes * POINTS.SPECTATOR_VOTE * mult);
      const p2Delta = (winnerId === duel.player2_id ? POINTS.DUEL_WIN * mult : 0)
        + (p2playerVotes * POINTS.PLAYER_VOTE * mult)
        + (p2spectatorVotes * POINTS.SPECTATOR_VOTE * mult);

    // Обновить дуэль
      const { supabase } = await import('@/lib/supabase');
      await supabase.from('jokester_duels').update({ winner_id: winnerId, status: 'done' }).eq('id', duel.id);

      await updateJokesterRoom(roomSnapshot.id, { voting_phase: 'results', state_version: roomSnapshot.state_version + 5 });

      const duelAnswers = currentAnswers.length > 0
        ? currentAnswers.filter(a => a.duel_id === duel.id)
        : await fetchDuelAnswers(duel.id);
      setCurrentAnswers(duelAnswers);

      if (winnerId) {
        const winnerPlayer = players.find(p => p.id === winnerId);
        const winnerAnswer = duelAnswers.find(a => a.player_id === winnerId && !!a.answer_text?.trim())?.answer_text
          || duelAnswers.find(a => a.player_id === winnerId)?.answer_text
          || 'Ответ не найден';
          
        // Calculate new ranks
        const updatedPlayers = players.map(p => {
          if (p.id === duel.player1_id) return { ...p, total_points: p1Before + p1Delta };
          if (p.id === duel.player2_id) return { ...p, total_points: p2Before + p2Delta };
          return p;
        });
        const gamePlayers = updatedPlayers.filter(p => p.role === 'player' && !p.is_host);
        const sortedByPoints = [...gamePlayers].sort((a, b) => b.total_points - a.total_points);
        const winnerRank = sortedByPoints.findIndex(p => p.id === winnerId) + 1;

        setVoteReveal({
          answer: winnerAnswer,
          playerName: winnerPlayer?.name || 'Победитель',
          playerAvatar: winnerPlayer?.avatar || null,
          question: duel.question1_text || '',
          winnerLabel: winnerPlayer?.name ? `Побеждает ${winnerPlayer.name}` : 'Победитель дуэли',
          pointsFrom: winnerId === duel.player1_id ? p1Before : p2Before,
          pointsTo: winnerId === duel.player1_id ? p1Before + p1Delta : p2Before + p2Delta,
          rank: winnerRank,
          winnerId: winnerId,
          loserId: winnerId === duel.player1_id ? duel.player2_id : duel.player1_id,
        });
        setShowRank(false);
      } else {
        setVoteReveal(null);
        setShowRank(false);
      }

      audioRef.current?.playBgm(JOKESTER_AUDIO.betweenMusic, 0.28, false);
      // Озвучка комментария
      await audioRef.current?.playVoteComment(winnerPercent);
      audioRef.current?.stopBgm();

      // Автопереход к следующей дуэли или результатам раунда
      await handleNextDuelOrResults(roomSnapshot);
    } finally {
      voteEndLockRef.current = false;
    }
  };

  const handleNextDuelOrResults = async (roomSnapshot?: JokesterRoom) => {
    const effectiveRoom = roomSnapshot || room;
    if (!effectiveRoom) return;
    const roundDuels = await fetchJokesterDuels(effectiveRoom.id, effectiveRoom.current_round);
    setDuels(roundDuels);
    const nextIndex = effectiveRoom.current_duel_index + 1;

    if (nextIndex < roundDuels.length) {
      // Следующая дуэль — сразу голосование (ответы уже были даны)
      await startDuelVoting(nextIndex, effectiveRoom);
    } else {
      const isFinal = effectiveRoom.current_round >= 4 || effectiveRoom.status === 'final_playing';
      audioRef.current?.stopBgm();
      await updateJokesterRoom(effectiveRoom.id, {
        status: isFinal ? 'final_results' : 'round_results',
        state_version: effectiveRoom.state_version + 7,
      });

      // Рефетч игроков для рейтинга
      const freshPlayers = await fetchJokesterPlayers(effectiveRoom.id);
      setPlayers(freshPlayers);

      if (isFinal) {
        await handleShowCredits(effectiveRoom);
        return;
      }

      // Голос после раунда
      const afterFolder = JOKESTER_AUDIO.afterRound(1);
      audioRef.current?.playBgm(JOKESTER_AUDIO.afterRoundMusic, 0.28);
      await audioRef.current?.playVoiceRandom(afterFolder);
      autoStartingDuelsRef.current = false;
    }
  };

  const handleNextRound = async () => {
    if (!room) return;
    unlockAudio();
    const nextRound = room.current_round + 1;

    if (nextRound <= 3) {
      await updateJokesterRoom(room.id, {
        current_round: nextRound,
        current_duel_index: 0,
        current_question: 0,
        status: 'round_rules',
        voting_phase: 'idle',
        state_version: room.state_version + 8,
      });
      const nextRoomSnapshot: JokesterRoom = {
        ...room,
        current_round: nextRound,
        current_duel_index: 0,
        current_question: 0,
        status: 'round_rules',
        voting_phase: 'idle',
        state_version: room.state_version + 8,
      };
      setRoom(nextRoomSnapshot);
      await handleStartRound(nextRoomSnapshot);
    } else {
      // ФИНАЛ
      handleStartFinal();
    }
  };

  const handleStartFinal = async () => {
    if (!room) return;
    unlockAudio();
    const freshPlayers = await fetchJokesterPlayers(room.id);
    const sorted = freshPlayers.filter(p => p.role === 'player' && !p.is_host).sort((a, b) => b.total_points - a.total_points);
    const finalists = sorted.slice(0, 2);

    if (finalists.length < 2) return;

    await updateJokesterRoom(room.id, {
      status: 'final_rules',
      current_round: 4,
      state_version: room.state_version + 9,
    });

    audioRef.current?.playBgm(JOKESTER_AUDIO.rulesMusic, 0.25);
    await audioRef.current?.playRoundRules(4);
    audioRef.current?.stopBgm();

    // Создать финальную дуэль
    const usedTexts = await getUsedQuestions(room.id);
    const topCats = selectedTopCategoriesRef.current.length > 0
      ? selectedTopCategoriesRef.current
      : categories.map(c => c.id);
    const questions = selectQuestions(categories, topCats, 1, usedTexts);
    await markQuestionsUsed(room.id, 4, questions);
    await createDuels(room.id, 4, [{ player1_id: finalists[0].id, player2_id: finalists[1].id }], questions);

    const freshDuels = await fetchJokesterDuels(room.id, 4);
    setDuels(prev => [...prev, ...freshDuels]);

    audioRef.current?.playBgm(`${YANDEX_AUDIO_BASE}/sound/Jokester/soundTrack/120sec.mp3`, 0.35, false);
    await updateJokesterRoom(room.id, {
      status: 'final_playing',
      current_duel_index: 0,
      current_question: 0,
      voting_phase: 'answering',
      timer_started_at: new Date().toISOString(),
      timer_duration_sec: ANSWER_TIME_SEC,
      state_version: room.state_version + 10,
    });
    startTimer(ANSWER_TIME_SEC, () => handleAnswerPhaseEnd(), {
      preEndSfxAtSec: 10,
      preEndSfxFolder: `${YANDEX_AUDIO_BASE}/sound/Jokester/stop_timer`,
      preEndSfxCount: 10,
      preEndSfxVolume: 0.75,
    });
  };

  const handleShowCredits = async (roomSnapshot?: JokesterRoom) => {
    const effectiveRoom = roomSnapshot || room;
    if (!effectiveRoom) return;
    const freshPlayers = await fetchJokesterPlayers(effectiveRoom.id);
    const ranked = freshPlayers.filter(p => !p.is_host).sort((a, b) => b.total_points - a.total_points);
    const duelsAll = await fetchJokesterDuels(effectiveRoom.id);
    const answersByDuel = await Promise.all(duelsAll.map(d => fetchDuelAnswers(d.id)));
    const votesByDuel = await Promise.all(duelsAll.map(d => fetchDuelVotes(d.id)));

    const answersFlat = answersByDuel.flat();
    const votesFlat = votesByDuel.flat();
    const duelById = new Map(duelsAll.map(d => [d.id, d]));

    const voteCount = new Map<string, number>();
    for (const v of votesFlat) {
      const key = `${v.duel_id}|${v.voted_for_id}`;
      voteCount.set(key, (voteCount.get(key) || 0) + 1);
    }

    const winner = ranked[0];
    const winnerAnswers: CreditsAnswer[] = winner
      ? answersFlat
          .filter(a => a.player_id === winner.id)
          .map(a => {
            const duel = duelById.get(a.duel_id);
            return {
              question: duel?.question1_text || '',
              answer: a.answer_text,
              round: duel?.round || 0,
            };
          })
          .sort((a, b) => a.round - b.round)
      : [];

    const playerRanks: CreditsPlayerBest[] = ranked.map(player => {
      const playerAnswers = answersFlat.filter(a => a.player_id === player.id);
      let best: CreditsPlayerBest['bestAnswer'] = null;
      for (const ans of playerAnswers) {
        const duel = duelById.get(ans.duel_id);
        const key = `${ans.duel_id}|${player.id}`;
        const votes = voteCount.get(key) || 0;
        if (!best || votes > best.votes) {
          best = {
            question: duel?.question1_text || '',
            answer: ans.answer_text,
            votes,
          };
        }
      }
      return { player, bestAnswer: best };
    });

    setCreditsData({ winnerAnswers, playerRanks });
    await updateJokesterRoom(effectiveRoom.id, { status: 'credits', state_version: effectiveRoom.state_version + 11 });
  };

  useEffect(() => {
    if (room?.status !== 'credits') return;
    audioRef.current?.playBgm(JOKESTER_AUDIO.finalMusic, 0.35);
    void audioRef.current?.playVoiceRandom(JOKESTER_AUDIO.afterFinal);
  }, [room?.status]);

  useEffect(() => {
    if (room?.voting_phase !== 'results' || !voteReveal) return;
    emitAtElement(winnerPanelRef.current, { count: 50, spread: 220, speed: 8 });
    playRandomSound(START_DUCK_SOUNDS, 0.6);
  }, [room?.voting_phase, voteReveal, emitAtElement, playRandomSound]);

  const handleCloseRoom = async () => {
    if (!room) return;
    audioRef.current?.destroy();
    await updateJokesterRoom(room.id, { status: 'finished', state_version: room.state_version + 12 });
    setTimeout(() => {
      // Redirect hosts to the Jokester landing page after closing the room
      window.location.href = 'https://vecherinkach.vercel.app/jokester';
    }, 200);
  };

  const handleRestartGame = async () => {
    await handleCloseRoom();
    window.location.href = '/jokester';
  };

  const handleForceAdvance = async () => {
    if (!room) return;
    unlockAudio();

    if (room.status === 'round_playing' || room.status === 'final_playing') {
      if (room.voting_phase === 'voting') {
        await handleVoteEnd();
        return;
      }
      if (room.voting_phase === 'results') {
        await handleNextDuelOrResults(room);
        return;
      }
      if (room.voting_phase === 'answering') {
        await handleAnswerPhaseEnd();
        return;
      }
    }

    if (room.status === 'round_results') {
      if (room.current_round < 3) {
        await handleNextRound();
        return;
      }
      if (room.current_round === 3) {
        await handleStartFinal();
        return;
      }
    }

    if (room.status === 'final_results') {
      await handleShowCredits();
    }
  };

  /* ══════════════════════════════════════════════
     Render
     ══════════════════════════════════════════════ */

  if (!room) {
    return (
      <div className="min-h-screen bg-[#1f6ac6] flex items-center justify-center">
        <div className="text-white text-xl font-bold animate-pulse">Загрузка...</div>
      </div>
    );
  }

  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/jokester?code=${roomCode}` : '';
  const creditsRanks = creditsData?.playerRanks
    || sortedByPoints.filter(p => !p.is_host).map(player => ({ player, bestAnswer: null }));
  const creditsWinner = creditsRanks[0]?.player || null;
  const creditsWinnerAnswers = creditsData?.winnerAnswers || [];

  return (
    <div className={`min-h-screen bg-[#1f6ac6] text-white overflow-hidden relative font-sans ${isAnimationsDisabled ? 'disable-animations' : ''}`}>
      {!isAnimationsDisabled && <FeatherBurstCanvas registerEmitter={registerFeatherEmitter} />}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {!isAnimationsDisabled && <div className="jokester-sunrays" />}
      </div>
      
      {/* Deadline Overlay */}
      {!isAnimationsDisabled && (room.voting_phase === 'answering' || room.voting_phase === 'voting') && (
        <DeadlineOverlay seconds={timer} />
      )}

      {/* ─── Header ─── */}
      <header className="relative z-10 bg-white border-b-4 border-black px-6 py-3 flex items-center justify-between shadow-[0px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl sm:text-3xl font-black flex gap-1 text-black drop-shadow-[1px_1px_0_#fff]">
            {'Пошути-кач'.split('').map((ch, i) => (
              <span
                key={`${ch}-${i}`}
                className="jokester-letter text-black"
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                {ch}
              </span>
            ))}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 rounded-xl text-sm font-black bg-gray-200 text-black border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            {roomCode}
          </span>
          <button
            onClick={() => setIsJoinQrModalOpen(true)}
            className="px-3 py-1 rounded-xl text-xs font-black border-2 border-black bg-cyan-300 text-black hover:bg-cyan-200 transition-transform transition hover:scale-105 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
          >
            QR
          </button>
          <a
            href="https://donatty.com/aleksandri"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1 rounded-xl text-xs font-black border-2 border-black bg-yellow-400 text-black hover:bg-yellow-300 transition-transform transition hover:scale-105 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
          >
            💛 Поддержать проект
          </a>
          <button
            onClick={() => setIsBgmMuted(audioRef.current?.toggleBgmMute() ?? false)}
            className={`px-3 py-1 rounded-xl text-xs border-2 transition-transform transition hover:scale-110 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${
              isBgmMuted
                ? 'bg-yellow-400 text-black border-black'
                : 'bg-white border-black hover:bg-gray-100 text-black'
            }`}
          >
            🎵
          </button>
          <button
            onClick={() => setIsVoiceMuted(audioRef.current?.toggleVoiceMute() ?? false)}
            className={`px-3 py-1 rounded-xl text-xs border-2 transition-transform transition hover:scale-110 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${
              isVoiceMuted
                ? 'bg-yellow-400 text-black border-black'
                : 'bg-white border-black hover:bg-gray-100 text-black'
            }`}
            title="Голос ведущего"
          >
            🎤
          </button>
          <button
            onClick={() => {
              setIsAnimationsDisabled(prev => {
                const next = !prev;
                localStorage.setItem('jokester_animations_disabled', String(next));
                return next;
              });
            }}
            className={`px-3 py-1 rounded-xl text-xs border-2 transition-transform transition hover:scale-110 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${
              isAnimationsDisabled
                ? 'bg-yellow-400 text-black border-black'
                : 'bg-white border-black hover:bg-gray-100 text-black'
            }`}
            title="Анимации"
          >
            ✨
          </button>
          <button
            onClick={() => { void handleForceAdvance(); }}
            className="px-3 py-1 rounded-xl text-xs bg-amber-500 hover:bg-amber-400 text-black font-black border-2 border-black transition-transform transition hover:scale-105 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
            title="Ручной переход к следующему шагу"
          >
            → Дальше
          </button>
          <button
            onClick={handleCloseRoom}
            className="px-3 py-1 rounded-xl text-xs bg-red-600 hover:bg-red-500 text-white border-2 border-black transition-transform transition hover:scale-105 font-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
          >
            ✕ Закрыть
          </button>
        </div>
      </header>

      {isJoinQrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="w-full max-w-xl cartoon-panel p-6 space-y-4 text-center">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-black text-black">QR для подключения</h3>
              <button
                onClick={() => setIsJoinQrModalOpen(false)}
                className="px-3 py-2 rounded-xl text-xs border-2 bg-white text-black border-black"
              >
                ✕
              </button>
            </div>
            <div className="bg-white rounded-2xl p-4 inline-block border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <QRCodeCanvas value={joinUrl} size={240} fgColor="#000000" bgColor="#ffffff" />
            </div>
            <p className="font-mono text-5xl font-black tracking-[0.4em] text-black">{roomCode}</p>
            <p className="text-sm text-gray-700 font-bold break-all">{joinUrl}</p>
            <p className="text-xs text-gray-700">Подключаться могут новые игроки и зрители.</p>
          </div>
        </div>
      )}

      <div className="relative z-10 max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* ══════════════════ LOBBY ══════════════════ */}
        {room.status === 'lobby' && (
          <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            {/* QR + Info */}
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="cartoon-panel p-8 space-y-6 text-center">
                <h2 className="text-3xl font-black text-black drop-shadow-[1px_1px_0_#fff]">Подключение к игре</h2>
                <div className="bg-white rounded-2xl p-4 inline-block border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                  <QRCodeCanvas value={joinUrl} size={240} fgColor="#000000" bgColor="#ffffff" />
                </div>
                <p className="font-mono text-5xl font-black tracking-[0.5em] text-black drop-shadow-[2px_2px_0_#fff]">{roomCode}</p>
                <p className="text-sm text-gray-800 font-bold break-all">{joinUrl}</p>
              </div>

              <div className="space-y-6">
                {/* Игроки */}
                <div className="cartoon-panel p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-2xl font-black text-[#1f6ac6] drop-shadow-[1px_1px_0_#fff]">🎮 Игроки ({gamePlayers.length}/{MAX_PLAYERS})</h3>
                    <span className="px-3 py-1 rounded-full text-sm font-black bg-green-500 text-white border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] animate-pulse">LIVE</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {gamePlayers.map(p => (
                      <div key={p.id} className="bg-white border-4 border-black rounded-2xl p-3 text-center animate-[fadeIn_0.3s_ease] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                        <FeatherAvatar
                          src={avatarSrc(p.avatar)}
                          alt={p.name}
                          className="w-24 h-24 rounded-full object-cover mx-auto mb-2 border-4 border-black jokester-avatar-pop"
                          emitFeathers={emitFeathers}
                          burstCount={20}
                        />
                        <p className="text-sm font-black text-black truncate">{p.name}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Зрители */}
                <div className="cartoon-panel p-6">
                  <h3 className="text-2xl font-black text-purple-600 drop-shadow-[1px_1px_0_#fff] mb-4">👀 Зрители ({spectators.length})</h3>
                  <SpectatorHall count={spectators.length} total={hallSize} />
                </div>
              </div>
            </div>

            {gamePlayers.length >= 4 && (
              <button
                onClick={(e) => {
                  unlockAudio();
                  triggerStartButtonEffects(e.currentTarget);
                  void handleStartGame();
                }}
                className="w-full py-6 rounded-3xl font-black text-4xl bg-[#ffd700] text-black border-4 border-black hover:bg-[#ffe44d] active:scale-[0.98] transition-all shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] animate-[pulse_2s_infinite]"
              >
                🎬 НАЧАТЬ ИГРУ
              </button>
            )}
            {gamePlayers.length < 4 && (
              <div className="text-center text-white font-bold text-lg py-4 drop-shadow-[1px_1px_0_#000]">
                Минимум 4 игрока для начала (сейчас: {gamePlayers.length})
              </div>
            )}
          </div>
        )}

        {/* ══════════════════ STARTING ══════════════════ */}
        {room.status === 'starting' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-[fadeIn_0.5s_ease]">
            <div className="text-8xl animate-[bounce_1s_infinite] drop-shadow-[4px_4px_0_#000]">🎭</div>
            <h2
              className="text-6xl font-black text-center text-white drop-shadow-[4px_4px_0_#000]"
            >
              Пошути-кач!
            </h2>
            <p className="text-3xl text-white font-black animate-pulse drop-shadow-[2px_2px_0_#000]">Игра начинается...</p>
            <div className="flex gap-4">
              {gamePlayers.map((p, i) => (
                <div
                  key={p.id}
                  className="animate-[bounce_0.6s_infinite]"
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  <FeatherAvatar
                    src={avatarSrc(p.avatar)}
                    alt={p.name}
                    className="w-28 h-28 rounded-full object-cover border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] jokester-avatar-pop"
                    emitFeathers={emitFeathers}
                    burstCount={22}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════ CATEGORY VOTE ══════════════════ */}
        {room.status === 'category_vote' && (
          <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div className="text-center">
              <h2 className="text-4xl font-black text-white drop-shadow-[2px_2px_0_#000] mb-2">Голосование за категории</h2>
              <p className="text-white font-bold drop-shadow-[1px_1px_0_#000]">Игроки и зрители выбирают категории вопросов</p>
              {timer > 0 && <TimerCircle seconds={timer} total={CATEGORY_VOTE_TIME_SEC} tickKey={timerTickKey} />}
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {categoryRanking.map((cat, i) => (
                <div
                  key={cat.id}
                  className={`bg-white border-4 border-black rounded-2xl p-4 flex items-center gap-4 transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${
                    i < gamePlayers.length ? 'scale-[1.02]' : 'opacity-80'
                  }`}
                >
                  <span className="text-4xl drop-shadow-[2px_2px_0_#000]">{cat.emoji}</span>
                  <div className="flex-1">
                    <p className="font-black text-2xl text-black">{cat.name}</p>
                    <div className="h-4 bg-gray-200 border-2 border-black rounded-full mt-2 overflow-hidden">
                      <div
                        className="h-full bg-purple-500 rounded-r-full transition-all duration-500"
                        style={{ width: `${categoryVotes.length > 0 ? (cat.votes / categoryVotes.length * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-3xl font-black text-black">{cat.votes}</span>
                </div>
              ))}
            </div>
            <button
                onClick={(e) => {
                  unlockAudio();
                triggerStartButtonEffects(e.currentTarget);
                void handleStartDuels();
              }}
              className="w-full py-6 rounded-3xl font-black text-3xl bg-purple-600 text-white border-4 border-black hover:bg-purple-500 transition-all shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
            >
              ▶ Начать дуэли
            </button>
          </div>
        )}

        {/* ══════════════════ ROUND PLAYING ══════════════════ */}
        {(room.status === 'round_playing' || room.status === 'final_playing') && (
          <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div className="text-center">
              <h2 className="text-4xl font-black text-white drop-shadow-[2px_2px_0_#000]">
                {room.status === 'final_playing' ? '🏆 ФИНАЛ' : <DancingWord text={`Раунд ${room.current_round}`} />}
                {room.voting_phase === 'voting' && currentDuel ? ` · Дуэль ${room.current_duel_index + 1}` : ''}
              </h2>
              <p className="text-lg text-white font-bold drop-shadow-[1px_1px_0_#000]">
                {room.voting_phase === 'answering' ? 'Игроки отвечают...' : room.voting_phase === 'voting' ? 'Голосование!' : 'Результаты'}
              </p>
            </div>

            {room.voting_phase === 'answering' && (
              <TimerCircle seconds={timer} total={ANSWER_TIME_SEC} tickKey={timerTickKey} />
            )}

            {room.voting_phase === 'answering' && (
              <div
                className="cartoon-panel p-8 space-y-6 panel-pulse"
                style={panelDelayStyle('0.12s')}
              >
                <p className="text-center text-2xl font-black text-black">Все игроки отвечают одновременно</p>
                <p className="text-center text-lg text-gray-800 font-bold">120 секунд. Одна дуэль = один вопрос</p>
                <div className="grid md:grid-cols-2 gap-4">
                  {answerProgress.map(progress => (
                    <div key={progress.player.id} className="bg-white border-4 border-black rounded-2xl p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                      <div className="flex items-center gap-4">
                        <FeatherAvatar
                          src={avatarSrc(progress.player.avatar)}
                          alt={progress.player.name}
                          className="w-16 h-16 rounded-full object-cover border-2 border-black jokester-avatar-pop"
                          emitFeathers={emitFeathers}
                          burstCount={16}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-xl text-black truncate">{progress.player.name}</p>
                          <p className="text-sm text-gray-600 font-bold">{progress.player.total_points} очков</p>
                        </div>
                        <div
                          id={`answer-check-${progress.player.id}`}
                          className={`w-10 h-10 rounded-full flex items-center justify-center text-2xl font-black border-4 transition-all ${
                            progress.done
                              ? 'bg-green-400 text-white border-black'
                              : 'bg-gray-200 text-gray-500 border-gray-400'
                          }`}
                        >
                          {progress.expected === 0 ? '—' : progress.done ? '✓' : '…'}
                        </div>
                      </div>
                      <div className="mt-4 h-4 bg-gray-200 border-2 border-black rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-r-full bg-purple-500 transition-all duration-300"
                          style={{ width: `${progress.expected > 0 ? Math.min(100, (progress.answered / progress.expected) * 100) : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {room.voting_phase === 'voting' && currentDuel && vsScreenActive && (
              <VsScreen
                player1={players.find(p => p.id === currentDuel.player1_id) || null}
                player2={players.find(p => p.id === currentDuel.player2_id) || null}
                showNames={showDeAnon}
              />
            )}

            {room.voting_phase === 'voting' && currentDuel && !vsScreenActive && (
              <div
                className="relative cartoon-panel p-8 text-center overflow-hidden panel-pulse"
                style={panelDelayStyle('0.2s')}
              >
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-80">
                  <div className="scale-125 drop-shadow-[0_0_12px_rgba(0,0,0,0.25)]">
                    <TimerCircle seconds={timer} total={VOTE_TIME_SEC} tickKey={timerTickKey} />
                  </div>
                </div>
                <div className="relative z-10 space-y-4">
                  <p className="text-2xl font-black text-purple-600 tracking-wide drop-shadow-[1px_1px_0_#fff]">
                    {categoryLabel(currentDuel.question1_cat)}
                  </p>
                  <AnimatedQuestionText text={currentDuel.question1_text || ''} />
                </div>
              </div>
            )}

            {/* Answers during voting */}
            {room.voting_phase === 'voting' && currentDuel && !vsScreenActive && (
              <div className="relative">
                <div className="sunrays-panel sunrays-panel-left" aria-hidden="true">
                  <div className="sunrays-panel-rotor sunrays-panel-rotor-main" />
                  <div className="sunrays-panel-rotor sunrays-panel-rotor-soft" />
                </div>
                <div className="sunrays-panel sunrays-panel-right" aria-hidden="true">
                  <div className="sunrays-panel-rotor sunrays-panel-rotor-main" />
                  <div className="sunrays-panel-rotor sunrays-panel-rotor-soft" />
                </div>
                <div className="grid sm:grid-cols-2 gap-8 relative z-10">
                  {[
                    {
                      id: currentDuel.player1_id,
                      label: showDeAnon ? (players.find(p => p.id === currentDuel.player1_id)?.name || 'Дуэлянт 1') : 'Дуэлянт 1',
                      color: '#1f6ac6',
                    },
                    {
                      id: currentDuel.player2_id,
                      label: showDeAnon ? (players.find(p => p.id === currentDuel.player2_id)?.name || 'Дуэлянт 2') : 'Дуэлянт 2',
                      color: '#ef4444',
                    },
                  ].map((cfg, idx) => {
                    const isLoser = room.voting_phase === 'results' && voteReveal ? voteReveal.playerName !== cfg.label && voteReveal.playerName !== 'Ничья' : false;
                    const isWinner = room.voting_phase === 'results' && voteReveal ? voteReveal.playerName === cfg.label : false;
                    return (
                      <DuelAnswerCard
                        key={cfg.id}
                        label={cfg.label}
                        answers={currentAnswers.filter(a => a.player_id === cfg.id)}
                        votes={currentVotes.filter(v => v.voted_for_id === cfg.id)}
                        players={players}
                        color={cfg.color}
                        showNames={showDeAnon}
                        emitFeathers={emitFeathers}
                        animDelay={idx * 0.6}
                        isLoser={isLoser}
                        isWinner={isWinner}
                        idx={idx}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {room.voting_phase === 'results' && (
              <div
                ref={winnerPanelRef}
                className="w-full max-w-6xl mx-auto animate-[fadeIn_0.4s_ease] h-[calc(100vh-180px)] flex flex-col"
              >
                {voteReveal ? (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 flex-1 min-h-0">
                    {/* Top Panel: Winner Avatar & Name */}
                    <div className="md:col-span-12 comic-panel comic-bg-dots-yellow p-2 md:p-4 flex flex-col items-center justify-center relative overflow-hidden min-h-[120px] md:min-h-[160px]">
                      <div className="absolute top-2 left-2 bg-white border-2 border-black px-2 py-1 text-xs font-black text-black transform -rotate-2 z-20">ПОБЕДИТЕЛЬ</div>
                      <div className="animate-comic-slap flex flex-row items-center gap-4 md:gap-8 z-10">
                        <FeatherAvatar
                          src={avatarSrc(voteReveal.playerAvatar)}
                          alt={voteReveal.playerName}
                          className="w-20 h-20 md:w-32 md:h-32 rounded-full object-cover border-4 md:border-8 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] md:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
                          emitFeathers={emitFeathers}
                          burstCount={40}
                        />
                        <h3 className="text-4xl md:text-7xl font-black text-white drop-shadow-[3px_3px_0_#000] md:drop-shadow-[4px_4px_0_#000] uppercase tracking-wider transform -rotate-3">
                          {voteReveal.playerName}
                        </h3>
                      </div>
                    </div>

                    {/* Middle Left: The Answer */}
                    <div className="md:col-span-8 comic-panel bg-white p-4 flex flex-col justify-center relative min-h-[120px] overflow-y-auto">
                      <div className="absolute top-2 left-2 bg-yellow-300 border-2 border-black px-2 py-1 text-xs font-black text-black transform rotate-1 z-20">ОТВЕТ</div>
                      {voteReveal.question && (
                        <p className="text-xs md:text-sm text-gray-600 font-bold mb-1 mt-4">{voteReveal.question}</p>
                      )}
                      <div className="comic-speech-bubble p-3 md:p-4 mt-1">
                        <p className="text-2xl md:text-4xl font-black text-black jokester-answer-font leading-tight">
                          « {voteReveal.answer} »
                        </p>
                      </div>
                    </div>

                    {/* Middle Right: Points & Rank */}
                    <div className="md:col-span-4 comic-panel comic-bg-dots-blue p-4 flex flex-col items-center justify-center relative min-h-[120px]">
                      <div className="absolute top-2 right-2 bg-white border-2 border-black px-2 py-1 text-xs font-black text-black transform rotate-3 z-20">ОЧКИ</div>
                      <div className="animate-comic-pop flex flex-col items-center" style={{ animationDelay: '0.3s' }}>
                        <AnimatedCountUp
                          from={voteReveal.pointsFrom}
                          to={voteReveal.pointsTo}
                          className="text-5xl md:text-7xl font-black text-white drop-shadow-[3px_3px_0_#000] md:drop-shadow-[4px_4px_0_#000]"
                          onComplete={() => {
                            setTimeout(() => {
                              setShowRank(true);
                              emitAtElement(winnerPanelRef.current, { count: 46, spread: 200, speed: 7.2 });
                              playRandomSound(START_DUCK_SOUNDS, 0.55);
                            }, 500);
                          }}
                        />
                        <p className="text-lg md:text-xl font-black text-black text-center mt-1 bg-yellow-400 border-2 md:border-4 border-black px-3 py-0.5 transform -rotate-2 inline-block shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] md:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                          ОЧКОВ
                        </p>
                      </div>
                      {showRank && voteReveal.rank && (
                        <div className="absolute bottom-2 right-2 md:static md:mt-4 animate-rank-appear bg-white border-2 md:border-4 border-black p-1 md:p-2 transform rotate-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] md:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                          <p className="text-xs text-gray-800 font-bold text-center">Место</p>
                          <p className="text-2xl md:text-4xl font-black text-purple-600 text-center">
                            #{voteReveal.rank}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Bottom Left: Voters for Winner */}
                    <div className="md:col-span-4 comic-panel bg-green-100 p-3 md:p-4 relative flex flex-col min-h-[80px]">
                      <div className="absolute top-2 left-2 bg-white border-2 border-black px-2 py-1 text-xs font-black text-black transform -rotate-1 z-20">ЗА НЕГО</div>
                      <div className="mt-6 flex-1 flex flex-wrap gap-2 justify-center items-center overflow-y-auto">
                        {currentVotes.filter(v => v.voted_for_id === voteReveal.winnerId && v.voter_role === 'player').map(v => {
                          const voter = players.find(p => p.id === v.voter_id);
                          return voter ? (
                            <div key={v.id} className="relative animate-comic-pop" style={{ animationDelay: `${Math.random() * 0.3}s` }}>
                              <img
                                src={avatarSrc(voter.avatar)}
                                alt={voter.name}
                                className="w-10 h-10 md:w-12 md:h-12 rounded-full object-cover border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                                title={voter.name}
                              />
                            </div>
                          ) : null;
                        })}
                        {currentVotes.filter(v => v.voted_for_id === voteReveal.winnerId && v.voter_role === 'player').length === 0 && (
                          <p className="text-gray-500 font-bold italic text-sm">Никто</p>
                        )}
                      </div>
                    </div>

                    {/* Bottom Middle: Voters for Loser (Crossed out) */}
                    <div className="md:col-span-4 comic-panel bg-red-100 p-3 md:p-4 relative flex flex-col min-h-[80px]">
                      <div className="absolute top-2 left-2 bg-white border-2 border-black px-2 py-1 text-xs font-black text-black transform rotate-2 z-20">ПРОТИВ</div>
                      <div className="mt-6 flex-1 flex flex-wrap gap-2 justify-center items-center overflow-y-auto">
                        {currentVotes.filter(v => v.voted_for_id === voteReveal.loserId && v.voter_role === 'player').map(v => {
                          const voter = players.find(p => p.id === v.voter_id);
                          return voter ? (
                            <div key={v.id} className="relative animate-comic-pop" style={{ animationDelay: `${Math.random() * 0.3}s` }}>
                              <img
                                src={avatarSrc(voter.avatar)}
                                alt={voter.name}
                                className="w-10 h-10 md:w-12 md:h-12 rounded-full object-cover border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] grayscale opacity-80"
                                title={voter.name}
                              />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-full h-1.5 bg-red-600 transform -rotate-45 border border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]"></div>
                              </div>
                            </div>
                          ) : null;
                        })}
                        {currentVotes.filter(v => v.voted_for_id === voteReveal.loserId && v.voter_role === 'player').length === 0 && (
                          <p className="text-gray-500 font-bold italic text-sm">Единогласно!</p>
                        )}
                      </div>
                    </div>

                    {/* Bottom Right: Spectators */}
                    <div className="md:col-span-4 comic-panel bg-purple-100 p-3 md:p-4 flex flex-col items-center justify-center relative min-h-[80px]">
                      <div className="absolute top-2 left-2 bg-white border-2 border-black px-2 py-1 text-xs font-black text-black transform -rotate-3 z-20">ЗРИТЕЛИ</div>
                      {spectatorCount > 0 ? (
                        <div className="flex items-center justify-center mt-4">
                          <span className="text-4xl md:text-5xl text-purple-600 bg-white border-2 md:border-4 border-black px-3 py-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] md:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transform rotate-2 font-black">
                            {spectatorCount}
                          </span>
                        </div>
                      ) : (
                        <p className="text-sm md:text-base font-black text-gray-600 uppercase tracking-wide italic text-center mt-4">
                          {Math.random() > 0.5 ? "Без зрителей" : "Приватно"}
                        </p>
                      )}
                    </div>

                  </div>
                ) : (
                  <div className="comic-panel comic-bg-dots-yellow p-12 flex flex-col items-center justify-center flex-1">
                    <h3 className="text-6xl md:text-8xl font-black text-white drop-shadow-[4px_4px_0_#000] uppercase tracking-wider transform -rotate-2 animate-comic-slap">
                      НИЧЬЯ!
                    </h3>
                    <p className="text-2xl font-black text-black mt-4 bg-white border-4 border-black px-6 py-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transform rotate-1">
                      ГОЛОСОВ ПОРОВНУ
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Spectator votes central */}
            {room.voting_phase === 'voting' && !vsScreenActive && (
              <div className="text-center">
                <SpectatorHall count={spectatorCount - currentVotes.filter(v => v.voter_role === 'spectator').length} total={hallSize} />
                <p className="text-lg text-white font-bold mt-3 drop-shadow-[1px_1px_0_#000]">
                  Голосов: {currentVotes.length} (игроки: {currentVotes.filter(v => v.voter_role === 'player').length}, зрители: {currentVotes.filter(v => v.voter_role === 'spectator').length})
                </p>
                <div className="flex flex-wrap justify-center gap-2 mt-4">
                  {currentVotes.map(v => {
                    const voter = players.find(p => p.id === v.voter_id);
                    const isSpectator = v.voter_role === 'spectator';
                    return (
                      <div
                        key={v.id}
                        className="w-16 h-16 rounded-full bg-white border-4 border-black flex items-center justify-center text-sm animate-[fadeIn_0.3s_ease] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                        title={voter?.name}
                      >
                        {isSpectator ? (
                          <div
                            className="w-6 h-8 rounded-t-full bg-purple-500 border-2 border-black"
                            title="Зритель"
                          />
                        ) : voter ? (
                          <img
                            src={avatarSrc(voter.avatar)}
                            alt={voter.name}
                            className="w-16 h-16 rounded-full object-cover jokester-avatar-pop"
                          />
                        ) : '👤'}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════ ROUND RESULTS ══════════════════ */}
        {(room.status === 'round_results' || room.status === 'final_results') && (
          <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <h2 className="text-4xl font-black text-center text-white drop-shadow-[2px_2px_0_#000]">
              {room.status === 'final_results' ? '🏆 Итоги финала' : `Итоги раунда ${room.current_round}`}
            </h2>

            {/* Рейтинг */}
            <div className="space-y-4">
              {sortedByPoints.filter(p => !p.is_host).map((p, i) => (
                <div
                  key={p.id}
                  className={`cartoon-panel p-4 flex items-center gap-4 transition-all panel-pulse ${
                    i === 0 ? 'scale-[1.02]' : ''
                  }`}
                  style={{ animationDelay: `${i * 0.1}s`, ...panelDelayStyle(`${0.05 + i * 0.06}s`) }}
                >
                  <span className="text-4xl font-black text-black w-12 text-center drop-shadow-[2px_2px_0_#fff]">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                  </span>
                  <FeatherAvatar
                    src={avatarSrc(p.avatar)}
                    alt={p.name}
                    className="w-24 h-24 rounded-full object-cover border-4 border-black jokester-avatar-pop"
                    emitFeathers={emitFeathers}
                    burstCount={18}
                  />
                  <div className="flex-1">
                    <p className="font-black text-2xl text-black">{p.name}</p>
                    <p className="text-sm text-gray-800 font-bold">
                      👥 {p.player_votes} голосов игроков · 👀 {p.spectator_votes} голосов зрителей
                    </p>
                  </div>
                  <AnimatedScore value={p.total_points} className="text-4xl font-black text-purple-600 drop-shadow-[2px_2px_0_#000]" />
                </div>
              ))}
            </div>

            {/* Best answer */}
            {bestAnswer && (
              <div className="bg-white border-4 border-black rounded-3xl p-8 text-center shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                <p className="text-sm text-purple-600 font-black tracking-wider mb-2 drop-shadow-[1px_1px_0_#fff]">⭐ ЛУЧШИЙ ОТВЕТ РАУНДА</p>
                <p className="text-lg text-gray-800 font-bold mb-4">{bestAnswer.question}</p>
                <p className="text-4xl font-black text-black mb-4 jokester-answer-font">« {bestAnswer.text} »</p>
                <p className="text-xl text-purple-600 font-black drop-shadow-[1px_1px_0_#fff]">{bestAnswer.playerName}</p>
              </div>
            )}

            {/* Actions */}
            {room.status === 'round_results' && room.current_round < 3 && (
              <button
                onClick={(e) => {
                  unlockAudio();
                  triggerStartButtonEffects(e.currentTarget);
                  void handleNextRound();
                }}
                className="w-full py-6 rounded-3xl font-black text-3xl bg-[#ffd700] text-black border-4 border-black hover:bg-[#ffe44d] transition-all shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
              >
                ▶ {room.current_round + 1} раунд
              </button>
            )}
            {room.status === 'round_results' && room.current_round === 3 && (
              <button
                onClick={(e) => {
                  unlockAudio();
                  triggerStartButtonEffects(e.currentTarget);
                  void handleStartFinal();
                }}
                className="w-full py-6 rounded-3xl font-black text-4xl bg-red-600 text-white border-4 border-black hover:bg-red-500 transition-all animate-pulse shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
              >
                🏆 ФИНАЛ
              </button>
            )}
            {room.status === 'final_results' && (
              <button
                onClick={() => { void handleShowCredits(); }}
                className="w-full py-6 rounded-3xl font-black text-3xl bg-[#ffd700] text-black border-4 border-black hover:bg-[#ffe44d] transition-all shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
              >
                🎬 Титры
              </button>
            )}
          </div>
        )}

        {/* ══════════════════ CREDITS ══════════════════ */}
        {room.status === 'credits' && (
          <div className="min-h-[80vh] flex flex-col items-center justify-end overflow-hidden relative">
            <div className="animate-[creditsScroll_70s_linear_forwards] space-y-12 text-center pb-[120vh]">
              <h2
                className="text-6xl font-black mb-10 text-white drop-shadow-[4px_4px_0_#000]"
              >
                🏆 Победитель
              </h2>
              {creditsWinner && (
                <div className="space-y-6">
                  <FeatherAvatar
                    src={avatarSrc(creditsWinner.avatar)}
                    alt={creditsWinner.name}
                    className="w-48 h-48 rounded-full object-cover mx-auto border-8 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] jokester-avatar-pop"
                    emitFeathers={emitFeathers}
                    burstCount={36}
                  />
                  <p className="text-5xl font-black text-white drop-shadow-[2px_2px_0_#000]">{creditsWinner.name}</p>
                  <p className="text-3xl text-white font-black drop-shadow-[2px_2px_0_#000]">{creditsWinner.total_points} очков</p>
                </div>
              )}

              <div className="h-12" />

              <h3 className="text-4xl font-black text-white drop-shadow-[2px_2px_0_#000]">История победителя</h3>
              {creditsWinnerAnswers.length === 0 && (
                <p className="text-white font-bold drop-shadow-[1px_1px_0_#000]">Ответы не найдены</p>
              )}
              {creditsWinnerAnswers.map((entry, i) => (
                <div key={`${entry.question}-${i}`} className="cartoon-panel p-6 text-left max-w-3xl mx-auto">
                  <p className="text-sm text-gray-800 font-bold mb-2">Раунд {entry.round}</p>
                  <p className="text-lg text-black font-bold mb-4">{entry.question}</p>
                  <p className="text-3xl font-black text-black">« {entry.answer} »</p>
                </div>
              ))}

              <div className="h-12" />

              <h3 className="text-4xl font-black text-white drop-shadow-[2px_2px_0_#000]">Все участники</h3>
              {creditsRanks.map((row, i) => (
                <div key={row.player.id} className="cartoon-panel p-6 text-left max-w-3xl mx-auto">
                  <div className="flex items-center gap-4">
                    <span className="text-3xl font-black text-black w-10 text-center">{i + 1}</span>
                    <FeatherAvatar
                      src={avatarSrc(row.player.avatar)}
                      alt={row.player.name}
                      className="w-24 h-24 rounded-full object-cover border-4 border-black jokester-avatar-pop"
                      emitFeathers={emitFeathers}
                      burstCount={14}
                    />
                    <div className="flex-1">
                      <p className="font-black text-2xl text-black">{row.player.name}</p>
                      <p className="text-sm text-gray-800 font-bold">{row.player.total_points} очков</p>
                    </div>
                  </div>
                  {row.bestAnswer && (
                    <div className="mt-4 bg-gray-100 border-2 border-black rounded-2xl p-4">
                      <p className="text-sm text-gray-800 font-bold mb-2">Лучший ответ ({row.bestAnswer.votes} голосов)</p>
                      <p className="text-lg text-black font-bold mb-2">{row.bestAnswer.question}</p>
                      <p className="text-2xl font-black text-black">« {row.bestAnswer.answer} »</p>
                    </div>
                  )}
                </div>
              ))}

              <div className="h-12" />
              <p className="text-2xl text-white font-black drop-shadow-[2px_2px_0_#000]">Спасибо за игру! 🎭</p>
              <p className="text-lg text-white font-bold drop-shadow-[1px_1px_0_#000]">Пошути-кач · Вечеринкач</p>
            </div>

            <div className="fixed inset-0 flex items-end justify-center pb-16 pointer-events-none">
              <button
                onClick={() => { void handleRestartGame(); }}
                className="pointer-events-auto px-10 py-6 rounded-3xl font-black text-2xl bg-[#ffd700] text-black border-4 border-black hover:bg-[#ffe44d] transition-all shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
              >
                Играть заново
              </button>
            </div>

            <button
              onClick={handleCloseRoom}
              className="fixed bottom-8 right-8 px-8 py-4 rounded-2xl font-black text-xl bg-red-600 text-white border-4 border-black hover:bg-red-500 transition z-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
            >
              Закрыть комнату
            </button>
          </div>
        )}

        {/* ══════════════════ ROUND RULES ══════════════════ */}
        {(room.status === 'round_rules' || room.status === 'final_rules') && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-[fadeIn_0.5s_ease]">
            <div className="text-8xl animate-round-emoji-flip drop-shadow-[4px_4px_0_#000]">
              {room.current_round === 1 ? '1️⃣' : room.current_round === 2 ? '2️⃣' : room.current_round === 3 ? '3️⃣' : '🏆'}
            </div>
            <h2 className="text-6xl font-black text-white text-center drop-shadow-[4px_4px_0_#000]">
              {room.status === 'final_rules' ? 'ФИНАЛ' : <DancingWord text={`Раунд ${room.current_round}`} />}
            </h2>
            <div className="cartoon-panel p-8 max-w-xl text-center space-y-4">
              <p className="text-xl text-black font-black">Каждый игрок проведёт 2 дуэли</p>
              <p className="text-xl text-black font-black">120 секунд на 1 ответ</p>
              <p className="text-xl text-black font-black">Зрители и игроки голосуют за лучший ответ</p>
              {room.current_round > 1 && (
                <p className="text-purple-600 font-black text-3xl mt-4 drop-shadow-[1px_1px_0_#fff]">
                  Множитель очков: ×{roundMultiplier(room.current_round)}
                </p>
              )}
            </div>
            <button
              onClick={(e) => {
                unlockAudio();
                triggerStartButtonEffects(e.currentTarget);
                void handleStartRound();
              }}
              className="px-12 py-6 rounded-3xl font-black text-3xl bg-[#ffd700] text-black border-4 border-black hover:bg-[#ffe44d] active:scale-95 transition-all shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
            >
              ▶ Начать
            </button>
          </div>
        )}

      </div>

      {/* ─── Стили и анимации ─── */}
      <style jsx>{`
        .jokester-host-bg {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
        }
        .jokester-host-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(70px);
          opacity: 0.6;
          mix-blend-mode: screen;
          animation: jokester-blob-move 26s ease-in-out infinite alternate;
        }
        .host-blob-1 {
          width: 520px;
          height: 520px;
          background: radial-gradient(circle at 30% 30%, rgba(255,215,0,0.28), rgba(255,215,0,0));
          top: -160px;
          left: -120px;
          animation-delay: 0s;
        }
        .host-blob-2 {
          width: 620px;
          height: 620px;
          background: radial-gradient(circle at 70% 70%, rgba(31,106,198,0.3), rgba(31,106,198,0));
          bottom: -200px;
          right: -140px;
          animation-delay: 5s;
        }
        .jokester-host-grid {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at center, rgba(255,255,255,0.03), transparent 50%);
          mask-image: radial-gradient(circle at center, rgba(0,0,0,0.7), transparent 75%);
        }
        .jokester-letter {
          color: #fff;
          text-shadow: 1px 1px 0 #c8a835, 2px 2px 0 #b89730, 3px 3px 6px rgba(0,0,0,0.3);
          animation: jokester-letter-bounce 1.4s ease-in-out infinite;
          transform-origin: center bottom;
        }
        @keyframes jokester-letter-bounce {
          0% { transform: translateY(0) scale(1); }
          30% { transform: translateY(-10px) scale(1.05, 0.95) rotate(-1deg); }
          55% { transform: translateY(4px) scale(0.96, 1.06) rotate(1deg); }
          70% { transform: translateY(0) scale(1.02, 0.98); }
          100% { transform: translateY(0) scale(1); }
        }
        @keyframes jokester-blob-move {
          0% { transform: translate3d(0,0,0) scale(1); }
          50% { transform: translate3d(50px, -30px, 0) scale(1.05); }
          100% { transform: translate3d(-40px, 40px, 0) scale(0.95); }
        }
        @keyframes creditsScroll {
          0% { transform: translateY(100vh); }
          100% { transform: translateY(-100%); }
        }
      `}</style>
    </div>
  );
}

export default function JokesterHostPage() {
  return <JokesterHostContent />;
}

/* ══════════════════════════════════════════════
   Sub-components
   ══════════════════════════════════════════════ */

function TimerCircle({ seconds, total, tickKey, className }: { seconds: number; total: number; tickKey: number; className?: string }) {
  const pct = total > 0 ? (seconds / total) * 100 : 0;
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);
  const color = pct > 50 ? '#ffd700' : pct > 25 ? '#f97316' : '#ef4444';

  return (
    <div className={`flex justify-center ${className || ''}`}>
      <div className="relative w-32 h-32">
        <div className="sunrays-timer-backdrop" aria-hidden="true">
          <div className="sunrays-timer-rays sunrays-timer-rays-main" />
          <div className="sunrays-timer-rays sunrays-timer-rays-soft" />
          <div className="sunrays-timer-core" />
        </div>
        <svg className="relative z-10 w-full h-full -rotate-90 drop-shadow-[2px_2px_0_#000]" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#fff" strokeWidth="8" />
          <circle
            cx="60" cy="60" r={radius} fill="none"
            stroke={color} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-1000 ease-linear"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="flex items-end gap-0.5">
            {String(seconds).split('').map((ch, idx) => (
              <span
                key={`${tickKey}-${idx}-${ch}`}
                className="text-4xl font-black jokester-timer-number animate-digit-pop drop-shadow-[2px_2px_0_#000]"
                style={{ color, animationDelay: `${idx * 40}ms` }}
              >
                {ch}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DuelAnswerCard({
  label,
  answers,
  votes,
  players,
  color,
  showNames,
  emitFeathers,
  animDelay = 0,
  isLoser = false,
  isWinner = false,
  idx = 0,
}: {
  label: string;
  answers: JokesterAnswer[];
  votes: JokesterVote[];
  players: JokesterPlayer[];
  color: string;
  showNames: boolean;
  emitFeathers: (spawn: FeatherSpawn) => void;
  animDelay?: number;
  isLoser?: boolean;
  isWinner?: boolean;
  idx?: number;
}) {
  const avatarSrc = (avatar?: string | null) => {
    if (!avatar) return `${YANDEX_AUDIO_BASE}/sound/Jokester/ava/1.png`;
    const normalized = avatar.replace(/^ava(\d+)\.png$/i, '$1.png');
    return `${YANDEX_AUDIO_BASE}/sound/Jokester/ava/${normalized}`;
  };
  const duelist = answers.length > 0 ? players.find(p => p.id === answers[0].player_id) : null;

  const strikeClass = isWinner ? (idx === 0 ? 'animate-strike-right' : 'animate-strike-left') : '';
  const knockoutClass = isLoser ? (idx === 0 ? 'animate-knockout-left' : 'animate-knockout-right') : '';
  const appearClass = !isWinner && !isLoser ? 'animate-card-appear' : '';

  return (
    <div
      className={`relative cartoon-panel p-6 space-y-4 overflow-hidden answer-card-anim panel-pulse ${appearClass} ${strikeClass} ${knockoutClass}`}
      style={{
        borderColor: color,
        animationDelay: isWinner || isLoser ? '0s' : `${animDelay}s`,
        ...panelDelayStyle(isWinner || isLoser ? '0s' : `${animDelay}s`),
      }}
    >
      {duelist && (
        <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none scale-125" aria-hidden="true">
          <img src={avatarSrc(duelist.avatar)} alt="" className="w-48 h-48 rounded-full object-cover blur-[1px]" />
        </div>
      )}
      <div className="relative z-10 space-y-4">
        <h3 className="text-2xl font-black drop-shadow-[1px_1px_0_#fff]" style={{ color }}>{label}</h3>
        {answers.map((a, aIdx) => (
          <div 
            key={a.id} 
            className="bg-white border-4 border-black rounded-2xl p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] animate-answer-appear"
            style={{ animationDelay: `${animDelay + 0.4 + aIdx * 0.2}s` }}
          >
            <p className="text-5xl sm:text-6xl font-black text-black jokester-answer-font">« {a.answer_text} »</p>
          </div>
        ))}
        {isWinner || isLoser ? (
          <p className="text-2xl font-black drop-shadow-[1px_1px_0_#fff]" style={{ color }}>
            {votes.length} голосов
          </p>
        ) : null}
      </div>
    </div>
  );
}

function AnimatedQuestionText({ text }: { text: string }) {
  return (
    <p className="text-4xl sm:text-5xl font-black jokester-question-font leading-snug">
      {text.split('').map((ch, idx) => (
        <span
          key={`${ch}-${idx}`}
          className="inline-block animate-question-char"
          style={{ animationDelay: `${idx * 20}ms` }}
        >
          {ch === ' ' ? '\u00A0' : ch}
        </span>
      ))}
    </p>
  );
}

function VsScreen({
  player1,
  player2,
  showNames,
}: {
  player1: JokesterPlayer | null;
  player2: JokesterPlayer | null;
  showNames: boolean;
}) {
  const avatarSrc = (avatar?: string | null) => {
    if (!avatar) return `${YANDEX_AUDIO_BASE}/sound/Jokester/ava/1.png`;
    const normalized = avatar.replace(/^ava(\d+)\.png$/i, '$1.png');
    return `${YANDEX_AUDIO_BASE}/sound/Jokester/ava/${normalized}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex overflow-hidden animate-[fadeIn_0.3s_ease]">
      {/* Left Side (Blue) */}
      <div className="w-1/2 h-full bg-[#1f6ac6] relative flex items-center justify-center overflow-hidden border-r-8 border-black transform -skew-x-12 scale-110 origin-bottom-left">
        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle,transparent_20%,#000_120%)]" />
        <div className="sunrays-panel-rotor sunrays-panel-rotor-main opacity-50" />
        <div className="relative z-10 transform skew-x-12 flex flex-col items-center animate-knockout-right" style={{ animationDuration: '3s', animationIterationCount: 'infinite', animationDirection: 'alternate' }}>
          <img src={avatarSrc(player1?.avatar)} alt="" className="w-64 h-64 rounded-full border-8 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] object-cover bg-white" />
          {showNames && <p className="mt-6 text-5xl font-black text-white drop-shadow-[4px_4px_0_#000]">{player1?.name || 'Дуэлянт 1'}</p>}
        </div>
      </div>
      {/* Right Side (Red) */}
      <div className="w-1/2 h-full bg-[#ef4444] relative flex items-center justify-center overflow-hidden transform -skew-x-12 scale-110 origin-top-right">
        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle,transparent_20%,#000_120%)]" />
        <div className="sunrays-panel-rotor sunrays-panel-rotor-main opacity-50" />
        <div className="relative z-10 transform skew-x-12 flex flex-col items-center animate-knockout-left" style={{ animationDuration: '3s', animationIterationCount: 'infinite', animationDirection: 'alternate', animationDelay: '0.5s' }}>
          <img src={avatarSrc(player2?.avatar)} alt="" className="w-64 h-64 rounded-full border-8 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] object-cover bg-white" />
          {showNames && <p className="mt-6 text-5xl font-black text-white drop-shadow-[4px_4px_0_#000]">{player2?.name || 'Дуэлянт 2'}</p>}
        </div>
      </div>
      {/* VS Badge */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 animate-[bounce_1s_infinite]">
        <div className="w-48 h-48 bg-yellow-400 rounded-full border-8 border-black flex items-center justify-center shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <span className="text-8xl font-black text-black italic tracking-tighter">VS</span>
        </div>
      </div>
    </div>
  );
}

function AnimatedScore({ value, className }: { value: number; className?: string }) {
  return (
    <span className={className}>
      {String(value).split('').map((ch, idx) => (
        <span
          key={`${value}-${idx}-${ch}`}
          className="inline-block animate-score-digit jokester-score-font"
          style={{ animationDelay: `${(idx * 70) % 300}ms` }}
        >
          {ch}
        </span>
      ))}
    </span>
  );
}

function DancingWord({ text }: { text: string }) {
  return (
    <span className="jokester-answer-font">
      {text.split('').map((ch, idx) => (
        <span
          key={`${text}-${idx}-${ch}`}
          className="inline-block animate-dancing-letter"
          style={{ animationDelay: `${idx * 60}ms` }}
        >
          {ch === ' ' ? '\u00A0' : ch}
        </span>
      ))}
    </span>
  );
}

function SpectatorHall({ count, total }: { count: number; total: number }) {
  const seats = Array.from({ length: Math.min(total, 50) }, (_, i) => i < count);
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {seats.map((filled, i) => (
        <div
          key={i}
          className={`w-6 h-8 rounded-t-full border-2 border-black transition-all duration-300 ${
            filled
              ? 'bg-purple-500 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
              : 'bg-gray-200 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]'
          }`}
          style={{
            transform: filled ? 'scale(1.1)' : 'scale(1)',
          }}
        />
      ))}
      {total > 50 && (
        <span className="text-sm font-black text-black ml-2">+{Math.max(0, total - 50)} мест</span>
      )}
    </div>
  );
}

function AnimatedCountUp({
  from,
  to,
  className,
  onComplete,
}: {
  from: number;
  to: number;
  className?: string;
  onComplete?: () => void;
}) {
  const [value, setValue] = useState(from);
  const completedRef = useRef(false);

  useEffect(() => {
    const start = performance.now();
    const duration = 900;
    completedRef.current = false;

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (to - from) * eased);
      setValue(next);
      if (t < 1) {
        requestAnimationFrame(step);
      } else if (!completedRef.current) {
        completedRef.current = true;
        onComplete?.();
      }
    };

    const raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [from, to, onComplete]);

  return <AnimatedScore value={value} className={className} />;
}

function FeatherAvatar({
  src,
  alt,
  className,
  emitFeathers,
  burstCount = 18,
}: {
  src: string;
  alt: string;
  className?: string;
  emitFeathers: (spawn: FeatherSpawn) => void;
  burstCount?: number;
}) {
  const ref = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      emitFeathers({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        count: burstCount,
        spread: 92,
        speed: 5.6,
      });
    });
    return () => cancelAnimationFrame(id);
  }, [emitFeathers, burstCount]);

  return <img ref={ref} src={src} alt={alt} className={className} />;
}

function FeatherBurstCanvas({ registerEmitter }: { registerEmitter: (emit: (spawn: FeatherSpawn) => void) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    length: number;
    rot: number;
    rotSpeed: number;
    alpha: number;
    fade: number;
    gravity: number;
    color: string;
    bend: number;
  }>>([]);

  useEffect(() => {
    const palette = [
      'rgba(255,255,255,0.92)',
      'rgba(245,245,255,0.8)',
      'rgba(255,236,244,0.72)',
      'rgba(236,250,255,0.72)',
      'rgba(252,244,226,0.68)',
    ];

    const emit = ({ x, y, count = 26, spread = 120, speed = 5.5 }: FeatherSpawn) => {
      const c = Math.max(0, Math.min(50, count));
      for (let i = 0; i < c; i++) {
        const angle = (Math.random() * Math.PI * 2);
        const s = speed * (0.35 + Math.random() * 0.95);
        particlesRef.current.push({
          x: x + (Math.random() - 0.5) * 18,
          y: y + (Math.random() - 0.5) * 10,
          vx: Math.cos(angle) * s + (Math.random() - 0.5) * (spread / 100),
          vy: Math.sin(angle) * s - (Math.random() * 1.5),
          size: 3 + Math.random() * 4.5,
          length: 9 + Math.random() * 15,
          rot: Math.random() * Math.PI,
          rotSpeed: (Math.random() - 0.5) * 0.24,
          alpha: 0.66 + Math.random() * 0.34,
          fade: 0.007 + Math.random() * 0.014,
          gravity: 0.06 + Math.random() * 0.085,
          color: palette[Math.floor(Math.random() * palette.length)],
          bend: (Math.random() - 0.5) * 0.35,
        });
      }
    };

    registerEmitter(emit);
    return () => registerEmitter(() => {});
  }, [registerEmitter]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const drawFeather = (p: {
      x: number;
      y: number;
      size: number;
      length: number;
      rot: number;
      color: string;
      alpha: number;
      bend: number;
    }) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
      ctx.fillStyle = p.color;

      ctx.beginPath();
      ctx.moveTo(0, -p.length * 0.5);
      ctx.bezierCurveTo(p.size * 0.9, -p.length * 0.2, p.size * 1.1, p.length * 0.25, 0, p.length * 0.5);
      ctx.bezierCurveTo(-p.size * 0.9, p.length * 0.25, -p.size * 0.95, -p.length * 0.2, 0, -p.length * 0.5);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(0, -p.length * 0.45);
      ctx.quadraticCurveTo(p.bend * p.length, 0, 0, p.length * 0.45);
      ctx.stroke();
      ctx.restore();
    };

    const frame = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const next: typeof particlesRef.current = [];
      for (const p of particlesRef.current) {
        p.vy += p.gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.rotSpeed;
        p.alpha -= p.fade;

        if (p.alpha <= 0) continue;
        if (p.y > window.innerHeight + 80 || p.x < -120 || p.x > window.innerWidth + 120) continue;

        drawFeather(p);
        next.push(p);
      }
      particlesRef.current = next;

      rafId = requestAnimationFrame(frame);
    };

    resize();
    frame();
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 z-30 pointer-events-none" aria-hidden="true" />;
}
