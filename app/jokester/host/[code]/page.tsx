// app/jokester/host/[code]/page.tsx
// Экран ведущего «Пошути-кач»
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
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

const CONNECT_QUACK_SOUNDS = [
  '/audio/sound/The_duck_quacked_fun_#1.mp3',
  '/audio/sound/The_duck_quacked_fun_#2.mp3',
  '/audio/sound/The_duck_quacked_fun_#3.mp3',
  '/audio/sound/The_duck_quacked_fun_#4.mp3',
  '/audio/sound/The_duk_quacked_funn_#1.mp3',
  '/audio/sound/The_duk_quacked_funn_#2.mp3',
  '/audio/sound/The_duk_quacked_funn_#3.mp3',
  '/audio/sound/The_duk_quacked_funn_#4.mp3',
];

const START_DUCK_SOUNDS = [
  '/audio/duck/1.mp3',
  '/audio/duck/2.mp3',
  '/audio/duck/3.mp3',
  '/audio/duck/4.mp3',
  '/audio/duck/5.mp3',
  '/audio/duck/6.mp3',
  '/audio/duck/7.mp3',
];

/* ══════════════════════════════════════════════ */
export default function JokesterHostPage() {
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
  const [creditsData, setCreditsData] = useState<{ winnerAnswers: CreditsAnswer[]; playerRanks: CreditsPlayerBest[] } | null>(null);
  const [isBgmMuted, setIsBgmMuted] = useState(false);
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const [timerTickKey, setTimerTickKey] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<JokesterAudioPlayer | null>(null);
  const prevPlayerCountRef = useRef(0);
  const audioUnlockedRef = useRef(false);
  const pendingConnectSoundsRef = useRef(0);
  const autoStartingDuelsRef = useRef(false);
  const prevVoteCountRef = useRef(0);
  const prevAnswerCountRef = useRef(0);
  const voteEndLockRef = useRef(false);
  const selectedTopCategoriesRef = useRef<string[]>([]);
  const featherEmitterRef = useRef<((spawn: FeatherSpawn) => void) | null>(null);
  const answeredDoneRef = useRef<Set<string>>(new Set());
  const winnerPanelRef = useRef<HTMLDivElement | null>(null);
  const currentDuel = duels.find(d => d.duel_index === room?.current_duel_index && d.round === room?.current_round);

  const avatarSrc = useCallback((avatar?: string | null) => {
    if (!avatar) return '/audio/sound/Jokester/ava/1.png';
    const normalized = avatar.replace(/^ava(\d+)\.png$/i, '$1.png');
    return `/audio/sound/Jokester/ava/${normalized}`;
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
      audioRef.current.playRandomDuck(0.9);
    } else {
      playRandomSound(CONNECT_QUACK_SOUNDS, 0.9);
    }
  }, [playRandomSound]);

  const unlockAudio = useCallback(() => {
    if (audioUnlockedRef.current) return;
    audioUnlockedRef.current = true;
    const pending = pendingConnectSoundsRef.current;
    pendingConnectSoundsRef.current = 0;
    if (pending <= 0) return;
    for (let i = 0; i < Math.min(3, pending); i++) {
      setTimeout(() => playConnectQuack(), i * 180);
    }
  }, [playConnectQuack]);

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
      audioRef.current?.playVoiceRandom(JOKESTER_AUDIO.meetFolder, 4);
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
        if (options?.preEndSfxAtSec && options?.preEndSfxFolder && prev === options.preEndSfxAtSec) {
          const count = Math.max(1, options.preEndSfxCount || 1);
          const idx = Math.floor(Math.random() * count) + 1;
          audioRef.current?.playSfx(`${options.preEndSfxFolder}/${idx}.mp3`, options.preEndSfxVolume ?? 0.65);
        }
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          onEnd?.();
          return 0;
        }
        return prev - 1;
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
    await audioRef.current?.playVoiceRandom(folder, 3);

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

      audioRef.current?.playBgm('/audio/sound/Jokester/soundTrack/category.mp3', 0.4);
      void audioRef.current?.playVoiceRandom(JOKESTER_AUDIO.choosingCategoryFolder, 3);

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
    audioRef.current?.playBgm('/audio/sound/Jokester/soundTrack/120sec.mp3', 0.35);
    audioRef.current?.playVoiceRandom(JOKESTER_AUDIO.roundFolder, 4);

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
      preEndSfxAtSec: 3,
      preEndSfxFolder: '/audio/sound/Jokester/stop_timer',
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

    audioRef.current?.playBgm('/audio/sound/Jokester/soundTrack/vote30sec.mp3', 0.4);
    audioRef.current?.playVoiceRandom(JOKESTER_AUDIO.voteFolder, 3);
    setShowDeAnon(false);

    startTimer(VOTE_TIME_SEC, () => {
      void handleVoteEnd();
    }, {
      preEndSfxAtSec: 3,
      preEndSfxFolder: '/audio/sound/Jokester/stop_vote_timer',
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
      if (p1votes.length > p2votes.length) {
        winnerId = duel.player1_id;
        await updatePlayerPoints(duel.player1_id, POINTS.DUEL_WIN * mult, 0, 0);
      } else if (p2votes.length > p1votes.length) {
        winnerId = duel.player2_id;
        await updatePlayerPoints(duel.player2_id, POINTS.DUEL_WIN * mult, 0, 0);
      }
      // Голоса (для обоих)
      await updatePlayerPoints(duel.player1_id, 0, p1playerVotes * POINTS.PLAYER_VOTE * mult, p1spectatorVotes * POINTS.SPECTATOR_VOTE * mult);
      await updatePlayerPoints(duel.player2_id, 0, p2playerVotes * POINTS.PLAYER_VOTE * mult, p2spectatorVotes * POINTS.SPECTATOR_VOTE * mult);

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
        setVoteReveal({
          answer: winnerAnswer,
          playerName: winnerPlayer?.name || 'Победитель',
          playerAvatar: winnerPlayer?.avatar || null,
          question: duel.question1_text || '',
          winnerLabel: winnerPlayer?.name ? `Побеждает ${winnerPlayer.name}` : 'Победитель дуэли',
          pointsFrom: winnerId === duel.player1_id ? p1Before : p2Before,
          pointsTo: winnerId === duel.player1_id ? p1Before + p1Delta : p2Before + p2Delta,
        });
      } else {
        setVoteReveal(null);
      }

      audioRef.current?.playBgm(JOKESTER_AUDIO.betweenMusic, 0.28);
      // Озвучка комментария
      await audioRef.current?.playVoteComment(winnerPercent, 3);
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
      await audioRef.current?.playVoiceRandom(afterFolder, 3);
      audioRef.current?.stopBgm();
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

    audioRef.current?.playBgm('/audio/sound/Jokester/soundTrack/120sec.mp3', 0.35);
    await updateJokesterRoom(room.id, {
      status: 'final_playing',
      current_duel_index: 0,
      current_question: 0,
      voting_phase: 'answering',
      timer_started_at: new Date().toISOString(),
      timer_duration_sec: ANSWER_TIME_SEC,
      state_version: room.state_version + 10,
    });
    startTimer(ANSWER_TIME_SEC, () => handleAnswerPhaseEnd());
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
    void audioRef.current?.playVoiceRandom(JOKESTER_AUDIO.afterFinal, 3);
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
      window.location.href = '/host';
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
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center">
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
    <div className="min-h-screen bg-[#0a1628] text-white overflow-hidden">
      <FeatherBurstCanvas registerEmitter={registerFeatherEmitter} />
      <div className="sunrays-host-layer" aria-hidden="true">
        <div className="sunrays-host-rotor sunrays-host-rotor-main" />
        <div className="sunrays-host-rotor sunrays-host-rotor-soft" />
      </div>
      {/* ─── Header ─── */}
      <header className="bg-[#0d1a30] border-b border-[#ffd700]/20 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1
            className="text-2xl sm:text-3xl font-black"
            style={{
              color: '#fff',
              textShadow: '1px 1px 0 #c8a835, 2px 2px 0 #b89730, 3px 3px 6px rgba(0,0,0,0.3)',
            }}
          >
            Пошути-кач
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 rounded-full text-sm font-bold bg-[#ffd700] text-[#0a1628]">
            {roomCode}
          </span>
          <button
            onClick={() => setIsBgmMuted(audioRef.current?.toggleBgmMute() ?? false)}
            className={`px-3 py-1 rounded-lg text-xs border transition ${
              isBgmMuted
                ? 'bg-[#ffd700] text-[#0a1628] border-[#ffd700]'
                : 'border-gray-600 hover:border-[#ffd700]'
            }`}
          >
            🎵
          </button>
          <button
            onClick={() => setIsVoiceMuted(audioRef.current?.toggleVoiceMute() ?? false)}
            className={`px-3 py-1 rounded-lg text-xs border transition ${
              isVoiceMuted
                ? 'bg-[#ffd700] text-[#0a1628] border-[#ffd700]'
                : 'border-gray-600 hover:border-[#ffd700]'
            }`}
          >
            🎤
          </button>
          <button
            onClick={() => { void handleForceAdvance(); }}
            className="px-3 py-1 rounded-lg text-xs bg-amber-500 hover:bg-amber-400 text-[#0a1628] font-bold transition"
            title="Ручной переход к следующему шагу"
          >
            → Дальше
          </button>
          <button
            onClick={handleCloseRoom}
            className="px-3 py-1 rounded-lg text-xs bg-red-600 hover:bg-red-500 transition font-bold"
          >
            ✕ Закрыть
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* ══════════════════ LOBBY ══════════════════ */}
        {room.status === 'lobby' && (
          <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            {/* QR + Info */}
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="bg-[#111d33] border-2 border-[#ffd700]/30 rounded-3xl p-6 space-y-4 text-center">
                <h2 className="text-xl font-black text-[#ffd700]">Подключение к игре</h2>
                <div className="bg-white rounded-2xl p-4 inline-block">
                  <QRCodeCanvas value={joinUrl} size={200} fgColor="#0a1628" bgColor="#ffffff" />
                </div>
                <p className="font-mono text-3xl font-black tracking-[0.5em] text-[#ffd700]">{roomCode}</p>
                <p className="text-xs text-gray-400 break-all">{joinUrl}</p>
              </div>

              <div className="space-y-4">
                {/* Игроки */}
                <div className="bg-[#111d33] border-2 border-[#1f6ac6]/30 rounded-3xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-black text-[#1f6ac6]">🎮 Игроки ({gamePlayers.length}/{MAX_PLAYERS})</h3>
                    <span className="px-2 py-1 rounded-full text-xs bg-green-600 animate-pulse">LIVE</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {gamePlayers.map(p => (
                      <div key={p.id} className="bg-[#0d1a30] rounded-xl p-2 text-center animate-[fadeIn_0.3s_ease]">
                        <FeatherAvatar
                          src={avatarSrc(p.avatar)}
                          alt={p.name}
                          className="w-20 h-20 rounded-full object-cover mx-auto mb-1 jokester-avatar-pop"
                          emitFeathers={emitFeathers}
                          burstCount={20}
                        />
                        <p className="text-xs font-bold truncate">{p.name}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Зрители */}
                <div className="bg-[#111d33] border-2 border-purple-600/30 rounded-3xl p-5">
                  <h3 className="font-black text-purple-400 mb-2">👀 Зрители ({spectators.length})</h3>
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
                className="w-full py-5 rounded-2xl font-black text-2xl bg-[#ffd700] text-[#0a1628] hover:bg-[#ffe44d] active:scale-[0.98] transition-all shadow-lg shadow-[#ffd700]/30 animate-[pulse_2s_infinite]"
              >
                🎬 НАЧАТЬ ИГРУ
              </button>
            )}
            {gamePlayers.length < 4 && (
              <div className="text-center text-gray-400 text-sm py-4">
                Минимум 4 игрока для начала (сейчас: {gamePlayers.length})
              </div>
            )}
          </div>
        )}

        {/* ══════════════════ STARTING ══════════════════ */}
        {room.status === 'starting' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-[fadeIn_0.5s_ease]">
            <div className="text-8xl animate-[bounce_1s_infinite]">🎭</div>
            <h2
              className="text-5xl font-black text-center"
              style={{
                color: '#fff',
                textShadow: '2px 2px 0 #c8a835, 4px 4px 0 #b89730, 6px 6px 12px rgba(0,0,0,0.4)',
              }}
            >
              Пошути-кач!
            </h2>
            <p className="text-xl text-[#ffd700] font-bold animate-pulse">Игра начинается...</p>
            <div className="flex gap-3">
              {gamePlayers.map((p, i) => (
                <div
                  key={p.id}
                  className="animate-[bounce_0.6s_infinite]"
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  <FeatherAvatar
                    src={avatarSrc(p.avatar)}
                    alt={p.name}
                    className="w-24 h-24 rounded-full object-cover border border-white/20 jokester-avatar-pop"
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
              <h2 className="text-3xl font-black text-[#ffd700] mb-2">Голосование за категории</h2>
              <p className="text-gray-400">Игроки и зрители выбирают категории вопросов</p>
              {timer > 0 && <TimerCircle seconds={timer} total={CATEGORY_VOTE_TIME_SEC} tickKey={timerTickKey} />}
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {categoryRanking.map((cat, i) => (
                <div
                  key={cat.id}
                  className={`bg-[#111d33] border-2 rounded-2xl p-4 flex items-center gap-4 transition-all ${
                    i < gamePlayers.length ? 'border-[#ffd700]/60 shadow-[#ffd700]/10 shadow-lg' : 'border-gray-700'
                  }`}
                >
                  <span className="text-3xl">{cat.emoji}</span>
                  <div className="flex-1">
                    <p className="font-black text-2xl">{cat.name}</p>
                    <div className="h-2 bg-gray-700 rounded-full mt-1 overflow-hidden">
                      <div
                        className="h-full bg-[#ffd700] rounded-full transition-all duration-500"
                        style={{ width: `${categoryVotes.length > 0 ? (cat.votes / categoryVotes.length * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-2xl font-black text-[#ffd700]">{cat.votes}</span>
                </div>
              ))}
            </div>
            <button
                onClick={(e) => {
                  unlockAudio();
                triggerStartButtonEffects(e.currentTarget);
                void handleStartDuels();
              }}
              className="w-full py-4 rounded-2xl font-black text-xl bg-[#1f6ac6] text-white hover:bg-[#2a7ad6] transition-all"
            >
              ▶ Начать дуэли
            </button>
          </div>
        )}

        {/* ══════════════════ ROUND PLAYING ══════════════════ */}
        {(room.status === 'round_playing' || room.status === 'final_playing') && (
          <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div className="text-center">
              <h2 className="text-2xl font-black text-[#ffd700]">
                {room.status === 'final_playing' ? '🏆 ФИНАЛ' : <DancingWord text={`Раунд ${room.current_round}`} />}
                {room.voting_phase === 'voting' && currentDuel ? ` · Дуэль ${room.current_duel_index + 1}` : ''}
              </h2>
              <p className="text-sm text-gray-400">
                {room.voting_phase === 'answering' ? 'Игроки отвечают...' : room.voting_phase === 'voting' ? 'Голосование!' : 'Результаты'}
              </p>
            </div>

            {room.voting_phase === 'answering' && (
              <TimerCircle seconds={timer} total={ANSWER_TIME_SEC} tickKey={timerTickKey} />
            )}

            {room.voting_phase === 'answering' && (
              <div className="bg-[#111d33] border-2 border-[#ffd700]/30 rounded-3xl p-6 space-y-4">
                <p className="text-center text-lg font-black text-[#ffd700]">Все игроки отвечают одновременно</p>
                <p className="text-center text-sm text-gray-400">120 секунд. Одна дуэль = один вопрос</p>
                <div className="grid md:grid-cols-2 gap-3">
                  {answerProgress.map(progress => (
                    <div key={progress.player.id} className="bg-[#0d1a30] rounded-2xl p-3 border border-gray-700">
                      <div className="flex items-center gap-3">
                        <FeatherAvatar
                          src={avatarSrc(progress.player.avatar)}
                          alt={progress.player.name}
                          className="w-14 h-14 rounded-full object-cover jokester-avatar-pop"
                          emitFeathers={emitFeathers}
                          burstCount={16}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-bold truncate">{progress.player.name}</p>
                          <p className="text-xs text-gray-400">{progress.player.total_points} очков</p>
                        </div>
                        <div
                          id={`answer-check-${progress.player.id}`}
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-lg font-black transition-all ${
                            progress.done
                              ? 'bg-green-500/30 text-green-300 border border-green-300/40'
                              : 'bg-gray-700/40 text-gray-400 border border-gray-600/40'
                          }`}
                        >
                          {progress.expected === 0 ? '—' : progress.done ? '✓' : '…'}
                        </div>
                      </div>
                      <div className="mt-3 h-2 bg-[#1a2940] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#ffd700] transition-all duration-300"
                          style={{ width: `${progress.expected > 0 ? Math.min(100, (progress.answered / progress.expected) * 100) : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {room.voting_phase === 'voting' && currentDuel && (
              <div className="space-y-6">
                <div className="duel-question-banner">
                  <div className="duel-question-timer">
                    <TimerCircle
                      seconds={timer}
                      total={VOTE_TIME_SEC}
                      tickKey={timerTickKey}
                      size={110}
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-gray-300 uppercase tracking-[0.2em]">{categoryLabel(currentDuel.question1_cat)}</p>
                    <AnimatedQuestionText text={currentDuel.question1_text || ''} />
                  </div>
                </div>

                <div className="duel-answer-grid">
                  <div className="sunrays-panel sunrays-panel-left" aria-hidden="true">
                    <div className="sunrays-panel-rotor sunrays-panel-rotor-main" />
                    <div className="sunrays-panel-rotor sunrays-panel-rotor-soft" />
                  </div>
                  <div className="sunrays-panel sunrays-panel-right" aria-hidden="true">
                    <div className="sunrays-panel-rotor sunrays-panel-rotor-main" />
                    <div className="sunrays-panel-rotor sunrays-panel-rotor-soft" />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-6 relative z-10">
                    <DuelAnswerCard
                      side="left"
                      label={showDeAnon ? (players.find(p => p.id === currentDuel.player1_id)?.name || 'Дуэлянт 1') : 'Дуэлянт 1'}
                      answers={currentAnswers.filter(a => a.player_id === currentDuel.player1_id)}
                      votes={currentVotes.filter(v => v.voted_for_id === currentDuel.player1_id)}
                      players={players}
                      color="#1f6ac6"
                      showNames={showDeAnon}
                      emitFeathers={emitFeathers}
                    />
                    <DuelAnswerCard
                      side="right"
                      label={showDeAnon ? (players.find(p => p.id === currentDuel.player2_id)?.name || 'Дуэлянт 2') : 'Дуэлянт 2'}
                      answers={currentAnswers.filter(a => a.player_id === currentDuel.player2_id)}
                      votes={currentVotes.filter(v => v.voted_for_id === currentDuel.player2_id)}
                      players={players}
                      color="#f1532f"
                      showNames={showDeAnon}
                      emitFeathers={emitFeathers}
                    />
                  </div>
                </div>

                <div className="text-center">
                  <SpectatorHall count={spectatorCount - currentVotes.filter(v => v.voter_role === 'spectator').length} total={hallSize} />
                  <p className="text-sm text-gray-400 mt-2">
                    Голосов: {currentVotes.length} (игроки: {currentVotes.filter(v => v.voter_role === 'player').length}, зрители: {currentVotes.filter(v => v.voter_role === 'spectator').length})
                  </p>
                </div>
              </div>
            )}

            {room.voting_phase === 'results' && (
              <div ref={winnerPanelRef} className="bg-[#111d33] border-2 border-[#ffd700]/40 rounded-3xl p-6 text-center animate-[fadeIn_0.4s_ease]">
                {voteReveal ? (
                  <>
                    <p className="text-xs text-gray-400 mb-2">Правильный ответ</p>
                    <p className="text-xl font-black text-[#ffd700] mb-3">{voteReveal.winnerLabel}</p>
                    {voteReveal.question && (
                      <p className="text-sm text-gray-400 mb-3">{voteReveal.question}</p>
                    )}
                    <div className="bg-[#0d1a30] rounded-2xl p-4 border border-[#ffd700]/30">
                      <p className="text-2xl font-black jokester-answer-font">« {voteReveal.answer} »</p>
                    </div>
                    <div className="mt-4">
                      <p className="text-xs text-gray-400 mb-1">Очки победителя</p>
                      <AnimatedCountUp
                        from={voteReveal.pointsFrom}
                        to={voteReveal.pointsTo}
                        className="text-3xl font-black text-[#ffd700]"
                        onComplete={() => {
                          emitAtElement(winnerPanelRef.current, { count: 46, spread: 200, speed: 7.2 });
                          playRandomSound(START_DUCK_SOUNDS, 0.55);
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-center gap-3 mt-4">
                      <FeatherAvatar
                        src={avatarSrc(voteReveal.playerAvatar)}
                        alt={voteReveal.playerName}
                        className="w-20 h-20 rounded-full object-cover jokester-avatar-pop"
                        emitFeathers={emitFeathers}
                        burstCount={30}
                      />
                      <span className="text-sm text-[#ffd700] font-bold">{voteReveal.playerName}</span>
                    </div>
                  </>
                ) : (
                  <p className="text-xl font-black text-gray-300">Ничья — голосов поровну</p>
                )}
              </div>
            )}

          </div>
        )}

        {/* ══════════════════ ROUND RESULTS ══════════════════ */}
        {(room.status === 'round_results' || room.status === 'final_results') && (
          <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <h2 className="text-3xl font-black text-center text-[#ffd700]">
              {room.status === 'final_results' ? '🏆 Итоги финала' : `Итоги раунда ${room.current_round}`}
            </h2>

            {/* Рейтинг */}
            <div className="space-y-3">
              {sortedByPoints.filter(p => !p.is_host).map((p, i) => (
                <div
                  key={p.id}
                  className={`bg-[#111d33] border-2 rounded-2xl p-4 flex items-center gap-4 transition-all ${
                    i === 0 ? 'border-[#ffd700] shadow-lg shadow-[#ffd700]/20' :
                    i === 1 ? 'border-gray-400' :
                    i === 2 ? 'border-amber-700' : 'border-gray-700'
                  }`}
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  <span className="text-2xl font-black text-[#ffd700] w-8 text-center">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                  </span>
                  <FeatherAvatar
                    src={avatarSrc(p.avatar)}
                    alt={p.name}
                    className="w-20 h-20 rounded-full object-cover jokester-avatar-pop"
                    emitFeathers={emitFeathers}
                    burstCount={18}
                  />
                  <div className="flex-1">
                    <p className="font-bold">{p.name}</p>
                    <p className="text-xs text-gray-400">
                      👥 {p.player_votes} голосов игроков · 👀 {p.spectator_votes} голосов зрителей
                    </p>
                  </div>
                  <AnimatedScore value={p.total_points} className="text-2xl font-black text-[#ffd700]" />
                </div>
              ))}
            </div>

            {/* Best answer */}
            {bestAnswer && (
              <div className="bg-[#1a1a3e] border-2 border-[#ffd700] rounded-3xl p-6 text-center">
                <p className="text-xs text-[#ffd700] tracking-wider mb-2">⭐ ЛУЧШИЙ ОТВЕТ РАУНДА</p>
                <p className="text-sm text-gray-400 mb-2">{bestAnswer.question}</p>
                <p className="text-2xl font-black text-white mb-3">« {bestAnswer.text} »</p>
                <p className="text-sm text-[#ffd700]">{bestAnswer.playerName}</p>
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
                className="w-full py-4 rounded-2xl font-black text-xl bg-[#ffd700] text-[#0a1628] hover:bg-[#ffe44d] transition-all"
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
                className="w-full py-4 rounded-2xl font-black text-xl bg-red-600 text-white hover:bg-red-500 transition-all animate-pulse"
              >
                🏆 ФИНАЛ
              </button>
            )}
            {room.status === 'final_results' && (
              <button
                onClick={() => { void handleShowCredits(); }}
                className="w-full py-4 rounded-2xl font-black text-xl bg-[#ffd700] text-[#0a1628] hover:bg-[#ffe44d] transition-all"
              >
                🎬 Титры
              </button>
            )}
          </div>
        )}

        {/* ══════════════════ CREDITS ══════════════════ */}
        {room.status === 'credits' && (
          <div className="space-y-6 animate-[fadeIn_0.6s_ease]">
            <div className="text-center space-y-2">
              <p className="text-sm text-gray-400">Лучший игрок</p>
              {creditsWinner ? (
                <div className="flex items-center justify-center gap-3">
                  <FeatherAvatar
                    src={avatarSrc(creditsWinner.avatar)}
                    alt={creditsWinner.name}
                    className="w-20 h-20 rounded-full object-cover jokester-avatar-pop"
                    emitFeathers={emitFeathers}
                    burstCount={22}
                  />
                  <div className="text-left">
                    <p className="text-xl font-black text-[#ffd700]">{creditsWinner.name}</p>
                    <p className="text-xs text-gray-400">{creditsWinner.total_points} очков</p>
                  </div>
                </div>
              ) : (
                <p className="text-gray-400">Игра завершена</p>
              )}
            </div>

            {creditsWinnerAnswers.length > 0 && (
              <div className="grid md:grid-cols-2 gap-4">
                {creditsWinnerAnswers.map((ans, idx) => (
                  <div key={`${ans.question}-${idx}`} className="bg-[#0d1a30] rounded-2xl p-4 border border-[#ffd700]/20">
                    <p className="text-xs text-gray-400 mb-1">Вопрос</p>
                    <p className="text-sm text-gray-300 mb-2">{ans.question}</p>
                    <p className="text-xl font-black text-white mb-1">« {ans.answer} »</p>
                    <p className="text-xs text-gray-500">Раунд {ans.round}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3">
              {creditsRanks.map((row, i) => (
                <div
                  key={row.player.id}
                  className="bg-[#111d33] border-2 border-gray-700 rounded-2xl p-4"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-xl font-black text-[#ffd700] w-8 text-center">{i + 1}</span>
                    <FeatherAvatar
                      src={avatarSrc(row.player.avatar)}
                      alt={row.player.name}
                      className="w-20 h-20 rounded-full object-cover jokester-avatar-pop"
                      emitFeathers={emitFeathers}
                      burstCount={14}
                    />
                    <div className="flex-1">
                      <p className="font-bold">{row.player.name}</p>
                      <p className="text-xs text-gray-400">{row.player.total_points} очков</p>
                    </div>
                  </div>
                  {row.bestAnswer && (
                    <div className="mt-3 bg-[#0d1a30] rounded-xl p-3">
                      <p className="text-xs text-gray-400 mb-1">Лучший ответ ({row.bestAnswer.votes} голосов)</p>
                      <p className="text-sm text-gray-300 mb-1">{row.bestAnswer.question}</p>
                      <p className="text-lg font-bold">« {row.bestAnswer.answer} »</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="h-10" />
            <p className="text-lg text-gray-400">Спасибо за игру! 🎭</p>
            <p className="text-sm text-gray-500">Пошути-кач · Вечеринкач</p>

            <div className="fixed inset-0 flex items-end justify-center pb-16 pointer-events-none">
              <button
                onClick={() => { void handleRestartGame(); }}
                className="pointer-events-auto px-8 py-4 rounded-2xl font-black text-lg bg-[#ffd700] text-[#0a1628] hover:bg-[#ffe44d] transition-all shadow-lg shadow-[#ffd700]/30"
              >
                Играть заново
              </button>
            </div>

            <button
              onClick={handleCloseRoom}
              className="fixed bottom-8 right-8 px-6 py-3 rounded-2xl font-bold bg-red-600 text-white hover:bg-red-500 transition z-50"
            >
              Закрыть комнату
            </button>
          </div>
        )}

        {/* ══════════════════ ROUND RULES ══════════════════ */}
        {(room.status === 'round_rules' || room.status === 'final_rules') && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-[fadeIn_0.5s_ease]">
            <div className="text-6xl animate-round-emoji-flip">
              {room.current_round === 1 ? '1️⃣' : room.current_round === 2 ? '2️⃣' : room.current_round === 3 ? '3️⃣' : '🏆'}
            </div>
            <h2 className="text-4xl font-black text-[#ffd700] text-center">
              {room.status === 'final_rules' ? 'ФИНАЛ' : <DancingWord text={`Раунд ${room.current_round}`} />}
            </h2>
            <div className="bg-[#111d33] border-2 border-[#ffd700]/30 rounded-3xl p-6 max-w-lg text-center space-y-3">
              <p className="text-gray-300">Каждый игрок проведёт 2 дуэли</p>
              <p className="text-gray-300">120 секунд на 1 ответ</p>
              <p className="text-gray-300">Зрители и игроки голосуют за лучший ответ</p>
              {room.current_round > 1 && (
                <p className="text-[#ffd700] font-bold text-xl">
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
              className="px-8 py-4 rounded-2xl font-black text-xl bg-[#ffd700] text-[#0a1628] hover:bg-[#ffe44d] active:scale-95 transition-all"
            >
              ▶ Начать
            </button>
          </div>
        )}

      </div>

      {/* ─── CSS для credits scroll ─── */}
      <style jsx>{`
        @keyframes creditsScroll {
          0% { transform: translateY(100vh); }
          100% { transform: translateY(-100%); }
        }
      `}</style>
    </div>
  );
}

/* ══════════════════════════════════════════════
   Sub-components
   ══════════════════════════════════════════════ */

function TimerCircle({ seconds, total, tickKey, size }: { seconds: number; total: number; tickKey: number; size?: number }) {
  const pct = total > 0 ? (seconds / total) * 100 : 0;
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);
  const color = pct > 50 ? '#ffd700' : pct > 25 ? '#f97316' : '#ef4444';
  const sizePx = size ?? 128;

  return (
    <div className="flex justify-center">
      <div className="relative" style={{ width: sizePx, height: sizePx }}>
        <div className="sunrays-timer-backdrop" aria-hidden="true">
          <div className="sunrays-timer-rays sunrays-timer-rays-main" />
          <div className="sunrays-timer-rays sunrays-timer-rays-soft" />
          <div className="sunrays-timer-core" />
        </div>
        <svg className="relative z-10 w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#1a2940" strokeWidth="8" />
          <circle
            cx="60" cy="60" r={radius} fill="none"
            stroke={color} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="flex items-end gap-0.5">
            {String(seconds).split('').map((ch, idx) => (
              <span
                key={`${tickKey}-${idx}-${ch}`}
                className="text-3xl font-black jokester-timer-number animate-digit-pop"
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
  side = 'left',
  label,
  answers,
  votes,
  players,
  color,
  showNames,
  emitFeathers,
}: {
  side?: 'left' | 'right';
  label: string;
  answers: JokesterAnswer[];
  votes: JokesterVote[];
  players: JokesterPlayer[];
  color: string;
  showNames: boolean;
  emitFeathers: (spawn: FeatherSpawn) => void;
}) {
  const avatarSrc = (avatar?: string | null) => {
    if (!avatar) return '/audio/sound/Jokester/ava/1.png';
    const normalized = avatar.replace(/^ava(\d+)\.png$/i, '$1.png');
    return `/audio/sound/Jokester/ava/${normalized}`;
  };
  const duelist = answers.length > 0 ? players.find(p => p.id === answers[0].player_id) : null;
  const sideClass = side === 'right' ? 'duel-blob-right' : 'duel-blob-left';
  const badgeColor = `${color}33`;
  const displayLabel = showNames ? label : 'Дуэлянт';

  return (
    <div className={`duel-blob-card ${sideClass}`} style={{ borderColor: color }}>
      <div className="duel-blob-accent" />
      <div className="relative space-y-3">
        <div className="duel-avatar-badge">
          {duelist && (
            <FeatherAvatar
              src={avatarSrc(duelist.avatar)}
              alt={duelist.name}
              className="w-16 h-16 rounded-full object-cover avatar-soft-pulse"
              emitFeathers={emitFeathers}
              burstCount={18}
            />
          )}
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-[0.22em] text-gray-400">Дуэлянт</span>
            <span className="text-xl font-black" style={{ color }}>{displayLabel}</span>
          </div>
          <span
            className="ml-auto px-3 py-1 rounded-full text-xs font-black text-white/90 shadow-inner"
            style={{ backgroundColor: badgeColor, border: `1px solid ${color}66` }}
          >
            {votes.length} голосов
          </span>
        </div>

        {answers.map(a => (
          <div key={a.id} className="relative bg-[#0d1a30]/85 rounded-2xl p-4 border border-white/5 overflow-hidden">
            <div className="absolute inset-0 opacity-40 pointer-events-none" style={{
              background: `radial-gradient(circle at 10% 10%, ${color}22, transparent 40%), radial-gradient(circle at 90% 20%, ${color}18, transparent 38%)`,
            }} />
            <p className="relative text-5xl sm:text-6xl font-bold text-white jokester-answer-font leading-none">
              « {a.answer_text} »
            </p>
          </div>
        ))}

        <div className="flex flex-wrap gap-2">
          {votes.map(v => {
            const voter = players.find(p => p.id === v.voter_id);
            const isSpectator = v.voter_role === 'spectator';
            return (
              <div
                key={v.id}
                className="w-12 h-12 rounded-full bg-[#1a2940] flex items-center justify-center text-sm animate-[fadeIn_0.3s_ease]"
                title={voter?.name}
              >
                {isSpectator ? (
                  <div
                    className="w-4 h-5 rounded-t-full bg-purple-500/80 shadow-sm shadow-purple-500/50"
                    title="Зритель"
                  />
                ) : voter ? (
                  <FeatherAvatar
                    src={avatarSrc(voter.avatar)}
                    alt={voter.name}
                    className="w-12 h-12 rounded-full object-cover"
                    emitFeathers={emitFeathers}
                    burstCount={8}
                  />
                ) : '👤'}
              </div>
            );
          })}
        </div>
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
    <div className="flex flex-wrap gap-1 justify-center">
      {seats.map((filled, i) => (
        <div
          key={i}
          className={`w-4 h-5 rounded-t-full transition-all duration-300 ${
            filled
              ? 'bg-purple-500 shadow-sm shadow-purple-500/50'
              : 'bg-gray-700/40'
          }`}
          style={{
            transform: filled ? 'scale(1.1)' : 'scale(1)',
          }}
        />
      ))}
      {total > 50 && (
        <span className="text-xs text-gray-400 ml-2">+{Math.max(0, total - 50)} мест</span>
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
