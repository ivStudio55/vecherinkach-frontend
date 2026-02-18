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

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<JokesterAudioPlayer | null>(null);
  const prevPlayerCountRef = useRef(0);
  const autoStartingDuelsRef = useRef(false);
  const prevVoteCountRef = useRef(0);
  const voteEndLockRef = useRef(false);
  const selectedTopCategoriesRef = useRef<string[]>([]);
  const currentDuel = duels.find(d => d.duel_index === room?.current_duel_index && d.round === room?.current_round);

  const avatarSrc = useCallback((avatar?: string | null) => {
    if (!avatar) return '/audio/sound/Jokester/ava/1.png';
    const normalized = avatar.replace(/^ava(\d+)\.png$/i, '$1.png');
    return `/audio/sound/Jokester/ava/${normalized}`;
  }, []);

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
        prevPlayerCountRef.current = p.length;
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
        // Звук утки при подключении нового игрока
        if (p.length > prevPlayerCountRef.current) {
          audioRef.current?.playRandomDuck();
        }
        prevPlayerCountRef.current = p.length;
        setPlayers(p);
      }),
      subscribeJokesterDuels(room.id, d => setDuels(d)),
    ];
    return () => unsubs.forEach(fn => fn());
  }, [room?.id]);

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
    if (!room || room.voting_phase !== 'answering') return;
    let cancelled = false;
    const tick = async () => {
      const roundDuels = duels.filter(d => d.round === room.current_round);
      const all = await Promise.all(roundDuels.map(d => fetchDuelAnswers(d.id)));
      if (!cancelled) setCurrentAnswers(all.flat());
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

  useEffect(() => {
    if (!room || room.status !== 'category_vote') return;
    if (autoStartingDuelsRef.current) return;
    const voterIds = new Set(categoryVotes.map(v => v.voter_id));
    const expectedVoters = players.filter(p => !p.is_host).length;
    if (expectedVoters > 0 && voterIds.size >= expectedVoters) {
      autoStartingDuelsRef.current = true;
      void handleStartDuels();
    }
  }, [room?.status, categoryVotes, players]);

  /* ══════════════════════════════════════════════
     Actions
     ══════════════════════════════════════════════ */

  const handleStartGame = async () => {
    if (!room) return;
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
      audioRef.current?.playBgm('/audio/sound/Jokester/soundTrack/category.mp3', 0.4);
      await audioRef.current?.playVoiceRandom(JOKESTER_AUDIO.choosingCategoryFolder, 3);
      await updateJokesterRoom(effectiveRoom.id, { status: 'category_vote', state_version: effectiveRoom.state_version + 2 });

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
    // Запускаем голосование первой дуэли
    await startDuelVoting(0);
  };

  // Начать фазу голосования для дуэли с указанным индексом
  const startDuelVoting = async (duelIndex: number) => {
    if (!room) return;
    audioRef.current?.stopBgm();

    // Рефетч ответов текущей дуэли для отображения на экране
    const duelList = await fetchJokesterDuels(room.id, room.current_round);
    setDuels(duelList);
    const duel = duelList[duelIndex];
    if (!duel) {
      await updateJokesterRoom(room.id, { status: 'round_results', voting_phase: 'results', state_version: room.state_version + 100 });
      audioRef.current?.stopBgm();
      return;
    }
    const answers = await fetchDuelAnswers(duel.id);
    setCurrentAnswers(answers);
    setCurrentVotes([]);

    await updateJokesterRoom(room.id, {
      current_duel_index: duelIndex,
      current_question: 0,
      voting_phase: 'voting',
      timer_started_at: new Date().toISOString(),
      timer_duration_sec: VOTE_TIME_SEC,
      state_version: room.state_version + 10 + duelIndex,
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

    // Обновить дуэль
      const { supabase } = await import('@/lib/supabase');
      await supabase.from('jokester_duels').update({ winner_id: winnerId, status: 'done' }).eq('id', duel.id);

      await updateJokesterRoom(roomSnapshot.id, { voting_phase: 'results', state_version: roomSnapshot.state_version + 5 });

    // Озвучка комментария
      await audioRef.current?.playVoteComment(winnerPercent, 3);

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
      await startDuelVoting(nextIndex);
    } else {
      // Результаты раунда
      audioRef.current?.stopBgm();
      await updateJokesterRoom(effectiveRoom.id, { status: 'round_results', state_version: effectiveRoom.state_version + 7 });

      // Рефетч игроков для рейтинга
      const freshPlayers = await fetchJokesterPlayers(effectiveRoom.id);
      setPlayers(freshPlayers);

      // Голос после раунда
      const afterFolder = effectiveRoom.current_round <= 3
        ? JOKESTER_AUDIO.afterRound(effectiveRoom.current_round)
        : JOKESTER_AUDIO.afterFinal;
      audioRef.current?.playBgm(JOKESTER_AUDIO.betweenMusic, 0.28);
      await audioRef.current?.playVoiceRandom(afterFolder, 3);
      audioRef.current?.stopBgm();
      autoStartingDuelsRef.current = false;
    }
  };

  const handleNextRound = async () => {
    if (!room) return;
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

  const handleShowCredits = async () => {
    if (!room) return;
    audioRef.current?.playBgm(JOKESTER_AUDIO.finalMusic, 0.35);
    await audioRef.current?.playVoiceRandom(JOKESTER_AUDIO.afterFinal, 3);
    await updateJokesterRoom(room.id, { status: 'credits', state_version: room.state_version + 11 });
  };

  const handleCloseRoom = async () => {
    if (!room) return;
    audioRef.current?.destroy();
    await updateJokesterRoom(room.id, { status: 'finished', state_version: room.state_version + 12 });
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

  return (
    <div className="min-h-screen bg-[#0a1628] text-white overflow-hidden">
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
          <span className="text-xs text-gray-400">
            R{room.current_round} · {room.status}
          </span>
          <button
            onClick={() => audioRef.current?.toggleBgmMute()}
            className="px-3 py-1 rounded-lg text-xs border border-gray-600 hover:border-[#ffd700] transition"
          >
            🎵
          </button>
          <button
            onClick={() => audioRef.current?.toggleVoiceMute()}
            className="px-3 py-1 rounded-lg text-xs border border-gray-600 hover:border-[#ffd700] transition"
          >
            🎤
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
                        <img src={avatarSrc(p.avatar)} alt={p.name} className="w-10 h-10 rounded-full object-cover mx-auto mb-1" />
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
                onClick={handleStartGame}
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
                  <img src={avatarSrc(p.avatar)} alt={p.name} className="w-12 h-12 rounded-full object-cover border border-white/20" />
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
              {timer > 0 && <TimerCircle seconds={timer} total={CATEGORY_VOTE_TIME_SEC} />}
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
                    <p className="font-bold">{cat.name}</p>
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
              onClick={() => { void handleStartDuels(); }}
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
                {room.status === 'final_playing' ? '🏆 ФИНАЛ' : `Раунд ${room.current_round}`}
                {room.voting_phase === 'voting' && currentDuel ? ` · Дуэль ${room.current_duel_index + 1}` : ''}
              </h2>
              <p className="text-sm text-gray-400">
                {room.voting_phase === 'answering' ? 'Игроки отвечают...' : room.voting_phase === 'voting' ? 'Голосование!' : 'Результаты'}
              </p>
            </div>

            <TimerCircle seconds={timer} total={room.voting_phase === 'voting' ? VOTE_TIME_SEC : ANSWER_TIME_SEC} />

            {room.voting_phase === 'answering' && (
              <div className="bg-[#111d33] border-2 border-[#ffd700]/30 rounded-3xl p-6 space-y-4">
                <p className="text-center text-lg font-black text-[#ffd700]">Все игроки отвечают одновременно</p>
                <p className="text-center text-sm text-gray-400">120 секунд. Одна дуэль = один вопрос</p>
                <div className="grid md:grid-cols-2 gap-3">
                  {duels
                    .filter(d => d.round === room.current_round)
                    .sort((a, b) => a.duel_index - b.duel_index)
                    .map(d => {
                      const p1 = players.find(p => p.id === d.player1_id);
                      const p2 = players.find(p => p.id === d.player2_id);
                      const p1a1 = currentAnswers.some(a => a.duel_id === d.id && a.player_id === d.player1_id && a.question_index === 0);
                      const p2a1 = currentAnswers.some(a => a.duel_id === d.id && a.player_id === d.player2_id && a.question_index === 0);
                      return (
                        <div key={d.id} className="bg-[#0d1a30] rounded-2xl p-3 border border-gray-700">
                          <p className="text-xs text-gray-400 mb-2">Дуэль {d.duel_index + 1}</p>
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-bold">{p1?.name || 'Игрок 1'}</span>
                            <span className="text-[#ffd700]">{p1a1 ? '✅' : '⬜'}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm mt-1">
                            <span className="font-bold">{p2?.name || 'Игрок 2'}</span>
                            <span className="text-[#ffd700]">{p2a1 ? '✅' : '⬜'}</span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {room.voting_phase === 'voting' && currentDuel && (
              <div className="bg-[#111d33] border-2 border-[#ffd700]/40 rounded-3xl p-6 text-center">
                <p className="text-xs text-gray-400 mb-2 tracking-wider">
                  {currentDuel.question1_cat?.toUpperCase()}
                </p>
                <p className="text-2xl sm:text-3xl font-black">{currentDuel.question1_text}</p>
              </div>
            )}

            {/* Answers during voting */}
            {room.voting_phase === 'voting' && currentDuel && (
              <div className="grid sm:grid-cols-2 gap-6">
                <DuelAnswerCard
                  label={showDeAnon ? (players.find(p => p.id === currentDuel.player1_id)?.name || 'Дуэлянт 1') : 'Дуэлянт 1'}
                  answers={currentAnswers.filter(a => a.player_id === currentDuel.player1_id)}
                  votes={currentVotes.filter(v => v.voted_for_id === currentDuel.player1_id)}
                  players={players}
                  color="#1f6ac6"
                  showNames={showDeAnon}
                />
                <DuelAnswerCard
                  label={showDeAnon ? (players.find(p => p.id === currentDuel.player2_id)?.name || 'Дуэлянт 2') : 'Дуэлянт 2'}
                  answers={currentAnswers.filter(a => a.player_id === currentDuel.player2_id)}
                  votes={currentVotes.filter(v => v.voted_for_id === currentDuel.player2_id)}
                  players={players}
                  color="#f1532f"
                  showNames={showDeAnon}
                />
              </div>
            )}

            {/* Spectator votes central */}
            {room.voting_phase === 'voting' && (
              <div className="text-center">
                <SpectatorHall count={spectatorCount - currentVotes.filter(v => v.voter_role === 'spectator').length} total={hallSize} />
                <p className="text-sm text-gray-400 mt-2">
                  Голосов: {currentVotes.length} (игроки: {currentVotes.filter(v => v.voter_role === 'player').length}, зрители: {currentVotes.filter(v => v.voter_role === 'spectator').length})
                </p>
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
                  <img src={avatarSrc(p.avatar)} alt={p.name} className="w-10 h-10 rounded-full object-cover" />
                  <div className="flex-1">
                    <p className="font-bold">{p.name}</p>
                    <p className="text-xs text-gray-400">
                      👥 {p.player_votes} голосов игроков · 👀 {p.spectator_votes} голосов зрителей
                    </p>
                  </div>
                  <span className="text-2xl font-black text-[#ffd700]">{p.total_points}</span>
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
                onClick={handleNextRound}
                className="w-full py-4 rounded-2xl font-black text-xl bg-[#ffd700] text-[#0a1628] hover:bg-[#ffe44d] transition-all"
              >
                ▶ {room.current_round + 1} раунд
              </button>
            )}
            {room.status === 'round_results' && room.current_round === 3 && (
              <button
                onClick={handleStartFinal}
                className="w-full py-4 rounded-2xl font-black text-xl bg-red-600 text-white hover:bg-red-500 transition-all animate-pulse"
              >
                🏆 ФИНАЛ
              </button>
            )}
            {room.status === 'final_results' && (
              <button
                onClick={handleShowCredits}
                className="w-full py-4 rounded-2xl font-black text-xl bg-[#ffd700] text-[#0a1628] hover:bg-[#ffe44d] transition-all"
              >
                🎬 Титры
              </button>
            )}
          </div>
        )}

        {/* ══════════════════ CREDITS ══════════════════ */}
        {room.status === 'credits' && (
          <div className="min-h-[80vh] flex flex-col items-center justify-end overflow-hidden relative">
            <div className="animate-[creditsScroll_30s_linear_forwards] space-y-8 text-center pb-[100vh]">
              <h2
                className="text-5xl font-black mb-8"
                style={{
                  color: '#fff',
                  textShadow: '2px 2px 0 #c8a835, 4px 4px 8px rgba(0,0,0,0.4)',
                }}
              >
                🏆 Победитель
              </h2>
              {sortedByPoints[0] && (
                <div className="space-y-4">
                  <img src={avatarSrc(sortedByPoints[0].avatar)} alt={sortedByPoints[0].name} className="w-28 h-28 rounded-full object-cover mx-auto border-4 border-[#ffd700]/70" />
                  <p className="text-4xl font-black text-[#ffd700]">{sortedByPoints[0].name}</p>
                  <p className="text-2xl text-white">{sortedByPoints[0].total_points} очков</p>
                </div>
              )}

              <div className="h-16" />

              <h3 className="text-2xl font-black text-[#ffd700]">Все участники</h3>
              {sortedByPoints.filter(p => !p.is_host).map((p, i) => (
                <div key={p.id} className="space-y-1">
                  <p className="text-xl font-bold text-white">
                    {i + 1}. {p.name} — {p.total_points} очков
                  </p>
                </div>
              ))}

              <div className="h-16" />
              <p className="text-lg text-gray-400">Спасибо за игру! 🎭</p>
              <p className="text-sm text-gray-500">Пошути-кач · Вечеринкач</p>
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
            <div className="text-6xl animate-[bounce_2s_infinite]">
              {room.current_round === 1 ? '1️⃣' : room.current_round === 2 ? '2️⃣' : room.current_round === 3 ? '3️⃣' : '🏆'}
            </div>
            <h2 className="text-4xl font-black text-[#ffd700] text-center">
              {room.status === 'final_rules' ? 'ФИНАЛ' : `Раунд ${room.current_round}`}
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
              onClick={() => { void handleStartRound(); }}
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

function TimerCircle({ seconds, total }: { seconds: number; total: number }) {
  const pct = total > 0 ? (seconds / total) * 100 : 0;
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);
  const color = pct > 50 ? '#ffd700' : pct > 25 ? '#f97316' : '#ef4444';

  return (
    <div className="flex justify-center">
      <div className="relative w-32 h-32">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#1a2940" strokeWidth="8" />
          <circle
            cx="60" cy="60" r={radius} fill="none"
            stroke={color} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-3xl font-black" style={{ color }}>{seconds}</span>
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
}: {
  label: string;
  answers: JokesterAnswer[];
  votes: JokesterVote[];
  players: JokesterPlayer[];
  color: string;
  showNames: boolean;
}) {
  const avatarSrc = (avatar?: string | null) => {
    if (!avatar) return '/audio/sound/Jokester/ava/1.png';
    const normalized = avatar.replace(/^ava(\d+)\.png$/i, '$1.png');
    return `/audio/sound/Jokester/ava/${normalized}`;
  };

  return (
    <div
      className="bg-[#111d33] border-2 rounded-3xl p-6 space-y-3"
      style={{ borderColor: color }}
    >
      <h3 className="text-xl font-black" style={{ color }}>{label}</h3>
      {answers.map(a => (
        <div key={a.id} className="bg-[#0d1a30] rounded-2xl p-4">
          <p className="text-xl font-bold text-white">« {a.answer_text} »</p>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {votes.map(v => {
          const voter = players.find(p => p.id === v.voter_id);
          return (
            <div
              key={v.id}
              className="w-8 h-8 rounded-full bg-[#1a2940] flex items-center justify-center text-sm animate-[fadeIn_0.3s_ease]"
              title={voter?.name}
            >
              {voter ? (
                <img src={avatarSrc(voter.avatar)} alt={voter.name} className="w-8 h-8 rounded-full object-cover" />
              ) : '👤'}
            </div>
          );
        })}
      </div>
      <p className="text-lg font-black" style={{ color }}>
        {votes.length} голосов
      </p>
    </div>
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
