// app/survivach/room/[code]/page.tsx
// Экран игрока «Выживач»
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type {
  SurvivachRoom,
  SurvivachPlayer,
  SurvivachAnswer,
  SurvivachBet,
  SurvivachDuel,
  RoundMode,
  MathProblem,
} from '@/lib/survivach/types';
import {
  fetchRoomByCode,
  fetchPlayers,
  fetchActiveDuel,
  joinSurvivachRoom,
  submitAnswer,
  submitBet,
  updateDuel,
  updatePlayer,
  survivachStorage,
  subscribeRoom,
  subscribeRoomPlayers,
  subscribeRoomDuel,
  subscribeRoomAnswers,
  passPotatoBomb,
} from '@/lib/survivach/api';
import {
  DUCK_AVATARS,
  getAvatarUrl,
  MODE_LABELS,
  MODE_COLORS,
  MEMORY_COLORS,
  BLITZ_START,
  TOTAL_CELLS,
  rankPlayers,
} from '@/lib/survivach/board';

/* ── Types ── */
type JoinPhase = 'choose_avatar' | 'enter_name' | 'waiting';

/* ── Color sequence input ── */
function ColorSequenceInput({
  sequence,
  onSubmit,
}: {
  sequence: string[];
  onSubmit: (input: string[]) => void;
}) {
  const [input, setInput] = useState<string[]>([]);
  const colors = Object.keys(MEMORY_COLORS);

  const tap = (c: string) => {
    if (input.length >= sequence.length) return;
    const next = [...input, c];
    setInput(next);
    if (next.length === sequence.length) {
      onSubmit(next);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-gray-400 text-sm">Нажмите цвета в нужном порядке ({input.length}/{sequence.length})</p>
      <div className="flex gap-2 min-h-8">
        {input.map((c, i) => (
          <div key={i} className="w-8 h-8 rounded-full border-2 border-white/30"
            style={{ backgroundColor: MEMORY_COLORS[c] }} />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-3">
        {colors.map(c => (
          <button
            key={c}
            onClick={() => tap(c)}
            className="w-16 h-16 rounded-full border-4 border-white/20 active:scale-90 transition-transform"
            style={{ backgroundColor: MEMORY_COLORS[c] }}
          />
        ))}
      </div>
      {input.length > 0 && (
        <button onClick={() => setInput([])} className="text-gray-500 text-sm underline">Сбросить</button>
      )}
    </div>
  );
}

/* ── Tag puzzle (3×3 or 4×4 sliding) ── */
function TagPuzzle({
  size,
  initialState,
  onSolve,
}: {
  size: number;
  initialState: number[];
  onSolve: () => void;
}) {
  const [tiles, setTiles] = useState<number[]>(initialState);
  const [solved, setSolved] = useState(false);

  const isSolved = (t: number[]) => t.every((v, i) => v === (i === t.length - 1 ? 0 : i + 1));

  const move = (idx: number) => {
    if (solved) return;
    const emptyIdx = tiles.indexOf(0);
    const r1 = Math.floor(idx / size), c1 = idx % size;
    const r2 = Math.floor(emptyIdx / size), c2 = emptyIdx % size;
    const adjacent = (Math.abs(r1 - r2) === 1 && c1 === c2) || (Math.abs(c1 - c2) === 1 && r1 === r2);
    if (!adjacent) return;
    const next = [...tiles];
    [next[idx], next[emptyIdx]] = [next[emptyIdx], next[idx]];
    setTiles(next);
    if (isSolved(next)) {
      setSolved(true);
      onSolve();
    }
  };

  return (
    <div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
        {tiles.map((v, i) => (
          <button
            key={i}
            onClick={() => move(i)}
            className={`w-full aspect-square rounded-lg font-black text-xl transition-all ${
              v === 0
                ? 'bg-transparent border border-dashed border-gray-600'
                : 'bg-gray-700 border border-gray-500 hover:bg-gray-600 active:scale-90'
            }`}
          >
            {v !== 0 && v}
          </button>
        ))}
      </div>
      {solved && <p className="text-center text-green-400 font-bold mt-2">✅ Решено!</p>}
    </div>
  );
}

/* ── Math input ── */
function MathProblemInput({
  problems,
  timerSec,
  onDone,
}: {
  problems: MathProblem[];
  timerSec: number;
  onDone: (correctCount: number, answers: number[]) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [inputVal, setInputVal] = useState('');
  const [correctCount, setCorrectCount] = useState(0);
  const [myAnswers, setMyAnswers] = useState<number[]>([]);
  const [done, setDone] = useState(false);
  const [timeLeft, setTimeLeft] = useState(timerSec);

  useEffect(() => {
    const iv = setInterval(() => setTimeLeft(t => {
      if (t <= 1) { clearInterval(iv); handleDone(); return 0; }
      return t - 1;
    }), 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDone = useCallback(() => {
    if (!done) {
      setDone(true);
      onDone(correctCount, myAnswers);
    }
  }, [done, correctCount, myAnswers, onDone]);

  const submit = () => {
    const num = parseInt(inputVal, 10);
    const isOk = !isNaN(num) && num === problems[idx].answer;
    const newCC = correctCount + (isOk ? 1 : 0);
    const newAnswers = [...myAnswers, num];
    setCorrectCount(newCC);
    setMyAnswers(newAnswers);
    setInputVal('');
    if (idx + 1 >= problems.length) {
      setDone(true);
      onDone(newCC, newAnswers);
    } else {
      setIdx(idx + 1);
    }
  };

  if (done) {
    return (
      <div className="text-center text-green-400 font-bold">
        ✅ Готово! Правильных: {correctCount}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className={`text-3xl font-mono font-black px-4 py-1 rounded-lg ${timeLeft <= 10 ? 'text-red-400 bg-red-900/30 animate-pulse' : 'text-white'}`}>
        ⏱ {timeLeft}s
      </div>
      <div className="text-gray-400 text-sm">{idx + 1} / {problems.length} · Правильных: {correctCount}</div>
      <div className="text-4xl font-black font-mono bg-gray-900 border border-gray-600 rounded-2xl px-8 py-6">
        {problems[idx].expression}
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          className="w-32 text-center text-2xl font-mono bg-gray-800 border border-gray-600 rounded-xl px-3 py-2 text-white outline-none focus:border-blue-500"
          autoFocus
        />
        <button onClick={submit} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-lg">
          OK
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   Main player page component
   ══════════════════════════════════════════ */

export default function SurvivachRoomPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();

  const [room, setRoom] = useState<SurvivachRoom | null>(null);
  const [players, setPlayers] = useState<SurvivachPlayer[]>([]);
  const [me, setMe] = useState<SurvivachPlayer | null>(null);
  const [duel, setDuel] = useState<SurvivachDuel | null>(null);
  const [myAnswer, setMyAnswer] = useState<SurvivachAnswer | null>(null);
  const [myBet, setMyBet] = useState<SurvivachBet | null>(null);
  const [loading, setLoading] = useState(true);

  /* ── Join flow ── */
  const [joinPhase, setJoinPhase] = useState<JoinPhase>('choose_avatar');
  const [chosenAvatar, setChosenAvatar] = useState<string>('');
  const [chosenName, setChosenName] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joiningRoom, setJoiningRoom] = useState(false);

  /* ── Answer state ── */
  const [textAnswer, setTextAnswer] = useState('');
  const [choiceAnswer, setChoiceAnswer] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [showSequence, setShowSequence] = useState(false);
  const [seqTimer, setSeqTimer] = useState(5);
  const [puzzleSolved, setPuzzleSolved] = useState(false);
  const passTimeout = useRef<NodeJS.Timeout | null>(null);

  /* ── Hot Potato pass action ── */
  const handlePotatoPass = useCallback(async () => {
    if (!room || !me) return;
    const rd = room.round_results_data as any;
    if (room.status !== 'potato_playing' || rd?.potato_bomb_holder !== me.id) return;
    
    // Prevent double passing rapidly
    if (passTimeout.current) return;
    passTimeout.current = setTimeout(() => {
      passTimeout.current = null;
    }, 1000);

    const aliveGamePlayers = players.filter(p => !p.is_host && !p.is_zombie && p.id !== me.id);
    if (aliveGamePlayers.length > 0) {
      const nextId = aliveGamePlayers[Math.floor(Math.random() * aliveGamePlayers.length)].id;
      // Call API
      await passPotatoBomb(room.id, me.id, nextId);
    }
  }, [room, me, players]);

  /* ── Shake detection ── */
  useEffect(() => {
    if (room?.status !== 'potato_playing' || !me) return;
    
    let lastX = 0, lastY = 0, lastZ = 0;
    let lastUpdate = 0;
    const SHAKE_THRESHOLD = 15;

    const onMotion = (e: DeviceMotionEvent) => {
      const rd = room.round_results_data as any;
      // Only care if I hold the bomb
      if (rd?.potato_bomb_holder !== me.id) return;

      const { accelerationIncludingGravity } = e;
      if (!accelerationIncludingGravity) return;

      const { x, y, z } = accelerationIncludingGravity;
      if (x === null || y === null || z === null) return;

      const now = Date.now();
      if ((now - lastUpdate) > 100) {
        const diffTime = (now - lastUpdate);
        lastUpdate = now;

        const speed = Math.abs(x + y + z - lastX - lastY - lastZ) / diffTime * 10000;
        
        if (speed > SHAKE_THRESHOLD) {
          handlePotatoPass();
        }

        lastX = x;
        lastY = y;
        lastZ = z;
      }
    };

    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [room, me, handlePotatoPass]);

  /* ── Fetch & subscribe ── */
  const prevRoundRef = useRef<number | null>(null);
  const prevStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!room?.id) return;
    const unsubs = [
      subscribeRoom(room.id, r => {
        setRoom(r);
        // Reset answer state ONLY when the round number or game status changes
        const roundChanged = prevRoundRef.current !== null && prevRoundRef.current !== r.current_round;
        const statusChanged = prevStatusRef.current !== null && prevStatusRef.current !== r.status;
        if (roundChanged || statusChanged) {
          setSubmitted(false);
          setTextAnswer('');
          setChoiceAnswer(null);
          setMyAnswer(null);
          setMyBet(null);
          setPuzzleSolved(false);
          setShowSequence(false);
        }
        prevRoundRef.current = r.current_round;
        prevStatusRef.current = r.status;
      }),
      subscribeRoomPlayers(room.id, pl => {
        setPlayers(pl);
        const session = survivachStorage.get();
        if (session) setMe(pl.find(p => p.id === session.playerId) ?? null);
      }),
      subscribeRoomDuel(room.id, room.current_round, setDuel),
    ];
    return () => unsubs.forEach(fn => fn());
  }, [room?.id, room?.current_round]);

  /* ── Memory diary: show sequence timer ── */
  useEffect(() => {
    if (room?.status === 'round_playing' && room.current_mode === 'memory_diary') {
      setShowSequence(true);
      setSeqTimer(5);
      const iv = setInterval(() => setSeqTimer(t => {
        if (t <= 1) { clearInterval(iv); setShowSequence(false); return 0; }
        return t - 1;
      }), 1000);
      return () => clearInterval(iv);
    }
  }, [room?.status, room?.current_mode]);

  /* ── Initial load ── */
  useEffect(() => {
    if (!code) return;
    const init = async () => {
      const r = await fetchRoomByCode(code);
      if (!r) { setLoading(false); return; }
      setRoom(r);
      prevRoundRef.current = r.current_round;
      prevStatusRef.current = r.status;
      const pl = await fetchPlayers(r.id);
      setPlayers(pl);

      const session = survivachStorage.get();
      if (session && session.roomCode === code) {
        const existing = pl.find(p => p.id === session.playerId);
        if (existing) {
          setMe(existing);
          setJoinPhase('waiting');
        }
      }
      setLoading(false);
    };
    init();
  }, [code]);

  /* ── Join handlers ── */
  const handleChooseAvatar = (duck: string) => {
    setChosenAvatar(duck);
    setJoinPhase('enter_name');
  };

  const handleJoin = async () => {
    if (!room || !chosenAvatar || !chosenName.trim()) return;
    setJoiningRoom(true);
    setJoinError('');
    try {
      const { player } = await joinSurvivachRoom(code, chosenName.trim(), chosenAvatar);
      setMe(player);
      setJoinPhase('waiting');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('avatar')) setJoinError('Этот персонаж уже занят. Выберите другого.');
      else if (msg.includes('name')) setJoinError('Это имя уже занято. Придумайте другое.');
      else setJoinError('Ошибка подключения. Попробуйте ещё раз.');
    } finally {
      setJoiningRoom(false);
    }
  };

  /* ── Answer submission helpers ── */
  const submitChoiceAnswer = async (optionIdx: number, isCorrectFn: (idx: number) => boolean) => {
    if (!room || !me || submitted) return;
    const correct = isCorrectFn(optionIdx);
    setChoiceAnswer(optionIdx);
    setSubmitted(true);
    await submitAnswer(room.id, me.id, room.current_round, { answer_index: optionIdx, is_correct: correct });
  };

  const submitTextAnswerFn = async (acceptList: string[]) => {
    if (!room || !me || submitted || !textAnswer.trim()) return;
    const correct = acceptList.some(a => a.toLowerCase().trim() === textAnswer.toLowerCase().trim());
    setSubmitted(true);
    await submitAnswer(room.id, me.id, room.current_round, { answer_text: textAnswer, is_correct: correct });
  };

  const handleBet = async (betType: 'life' | 'karma') => {
    if (!room || !me || myBet) return;
    await submitBet(room.id, me.id, room.current_round, betType);
    setMyBet({ id: '', room_id: room.id, player_id: me.id, round: room.current_round, bet_type: betType, resolved: false, won: null, created_at: '' });
  };

  /* ── Duel handlers ── */
  const handleMinePlacement = async (tileIdx: number) => {
    if (!room || !me || !duel || room.status !== 'duel_setup') return;
    const dd = duel.duel_data as { mined_tiles?: Record<string, number[]> } | null;
    const myMines = dd?.mined_tiles?.[me.id] ?? [];
    if (myMines.includes(tileIdx)) return;
    const newMines = [...myMines, tileIdx];
    const updatedData = { ...dd, mined_tiles: { ...(dd?.mined_tiles ?? {}), [me.id]: newMines } };
    await updateDuel(duel.id, { duel_data: updatedData as unknown as import('@/lib/survivach/types').DuelData });
  };

  const handleCrowdVote = async (optionIdx: number) => {
    if (!room || !me || !duel || room.status !== 'duel_setup') return;
    const dd = duel.duel_data as { player_votes?: Record<string, number> } | null;
    if (dd?.player_votes?.[me.id] != null) return;
    const updatedData = { ...dd, player_votes: { ...(dd?.player_votes ?? {}), [me.id]: optionIdx } };
    await updateDuel(duel.id, { duel_data: updatedData as unknown as import('@/lib/survivach/types').DuelData });
  };

  const handleCrowdGuess = async (guessNum: number) => {
    if (!room || !me || !duel || room.status !== 'duel_setup') return;
    const dd = duel.duel_data as { player_guesses?: Record<string, number> } | null;
    if (dd?.player_guesses?.[me.id] != null) return;
    const updatedData = { ...dd, player_guesses: { ...(dd?.player_guesses ?? {}), [me.id]: guessNum } };
    await updateDuel(duel.id, { duel_data: updatedData as unknown as import('@/lib/survivach/types').DuelData });
  };

  const handleDuelPickTile = async (tileIdx: number) => {
    if (!room || !me || !duel || room.status !== 'duel_playing') return;
    const isChallenger = duel.challenger_id === me.id;
    const dd = duel.duel_data as { mined_tiles?: Record<string, number[]>; challenger_picks?: number[]; challenged_picks?: number[] } | null;
    const myPicks = isChallenger ? (dd?.challenger_picks ?? []) : (dd?.challenged_picks ?? []);
    if (myPicks.includes(tileIdx)) return;
    const newPicks = [...myPicks, tileIdx];
    const allMines: number[] = Object.values(dd?.mined_tiles ?? {}).flat();
    const hitMine = allMines.includes(tileIdx);
    const updatedData = isChallenger
      ? { ...dd, challenger_picks: newPicks }
      : { ...dd, challenged_picks: newPicks };
    await updateDuel(duel.id, { duel_data: updatedData as unknown as import('@/lib/survivach/types').DuelData });
    if (hitMine) {
      await submitAnswer(room.id, me.id, room.current_round, { answer_data: { hit_mine: true, picks: newPicks }, is_correct: false });
    }
  };

  const handleDuelArithmeticAnswer = async (value: number) => {
    if (!room || !me || !duel) return;
    const isChallenger = duel.challenger_id === me.id;
    const dd = duel.duel_data as { challenger_answer?: number | null; challenged_answer?: number | null; average?: number | null } | null;
    const avg = dd?.average;
    const isCorrect = avg != null ? Math.abs(value - avg) < Math.abs((isChallenger ? (dd?.challenged_answer ?? Infinity) : (dd?.challenger_answer ?? Infinity)) - avg) : false;
    const updatedData = isChallenger
      ? { ...dd, challenger_answer: value }
      : { ...dd, challenged_answer: value };
    await updateDuel(duel.id, { duel_data: updatedData as unknown as import('@/lib/survivach/types').DuelData });
    await submitAnswer(room.id, me.id, room.current_round, { answer_data: { arithmetic_guess: value }, is_correct: isCorrect });
  };

  const handleDuelCrowdPrediction = async (optionIdx: number) => {
    if (!room || !me || !duel) return;
    const isChallenger = duel.challenger_id === me.id;
    const updatedData = isChallenger
      ? { ...(duel.duel_data as object), challenger_prediction: optionIdx }
      : { ...(duel.duel_data as object), challenged_prediction: optionIdx };
    await updateDuel(duel.id, { duel_data: updatedData as unknown as import('@/lib/survivach/types').DuelData });
    await submitAnswer(room.id, me.id, room.current_round, { answer_data: { crowd_prediction: optionIdx }, is_correct: false });
  };

  /* ─── Loading ─── */
  if (loading) {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white text-2xl animate-pulse">🧟 Загрузка...</div>;
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4 text-white p-8 text-center">
        <h2 className="text-3xl font-black">Комната не найдена</h2>
        <p className="text-gray-400">Проверьте код и попробуйте снова</p>
        <button onClick={() => router.push('/')} className="px-6 py-3 bg-gray-800 rounded-xl">← На главную</button>
      </div>
    );
  }

  /* ── Join flow ── */
  if (!me || joinPhase !== 'waiting') {
    const takenAvatars = players.map(p => p.avatar);

    if (joinPhase === 'choose_avatar') {
      return (
        <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6 gap-6">
          <h1 className="text-4xl font-black">🧟 Выживач</h1>
          <h2 className="text-xl text-gray-300">Выберите персонажа</h2>
          <div className="grid grid-cols-4 gap-4">
            {DUCK_AVATARS.map(duck => {
              const taken = takenAvatars.includes(duck);
              return (
                <button
                  key={duck}
                  onClick={() => !taken && handleChooseAvatar(duck)}
                  disabled={taken}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${
                    taken
                      ? 'border-gray-700 opacity-40 cursor-not-allowed'
                      : 'border-gray-700 hover:border-yellow-500 hover:bg-yellow-900/20 active:scale-95'
                  }`}
                >
                  <img src={getAvatarUrl(duck, 3)} alt={duck} className="w-16 h-16 object-contain" />
                  {taken && <span className="text-xs text-gray-500">Занято</span>}
                </button>
              );
            })}
          </div>
          {room.status !== 'lobby' && (
            <p className="text-red-400 text-sm font-bold">⚠️ Игра уже началась! Вы можете войти как зритель.</p>
          )}
        </div>
      );
    }

    if (joinPhase === 'enter_name') {
      return (
        <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6 gap-6">
          <img src={getAvatarUrl(chosenAvatar, 3)} alt="" className="w-28 h-28 object-contain" />
          <h2 className="text-xl font-bold">Введите ваше имя</h2>
          <input
            type="text"
            maxLength={16}
            placeholder="Имя игрока..."
            value={chosenName}
            onChange={e => setChosenName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            className="w-64 text-center text-xl bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white outline-none focus:border-yellow-500"
            autoFocus
          />
          {joinError && <p className="text-red-400 text-sm">{joinError}</p>}
          <div className="flex gap-3">
            <button onClick={() => setJoinPhase('choose_avatar')} className="px-5 py-3 bg-gray-700 rounded-xl">← Назад</button>
            <button
              onClick={handleJoin}
              disabled={!chosenName.trim() || joiningRoom}
              className="px-8 py-3 bg-yellow-600 hover:bg-yellow-500 rounded-xl font-bold disabled:opacity-40"
            >
              {joiningRoom ? 'Вхожу...' : '🎮 Войти'}
            </button>
          </div>
        </div>
      );
    }
  }

  /* ─── Status: me is set, render game view ─── */
  const isDuelist = me && duel && (duel.challenger_id === me.id || duel.challenged_id === me.id);
  const qData = room.question_data as Record<string, unknown> | null;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* ── Me status bar ── */}
      {me && (
        <div className="fixed top-0 left-0 right-0 bg-gray-900/95 border-b border-gray-700 flex items-center gap-3 px-4 py-2 z-50">
          <img src={getAvatarUrl(me.avatar, me.lives)} alt="" className="w-8 h-8 object-contain" />
          <span className="font-bold text-sm">{me.name}</span>
          {(() => {
            const gamePlayers = players.filter(p => !p.is_host);
            const ranked = rankPlayers(gamePlayers);
            const myRank = ranked.findIndex(p => p.id === me.id) + 1;
            const total = gamePlayers.length;
            return myRank > 0 ? (
              <span className={`text-xs font-black px-1.5 py-0.5 rounded ${myRank === 1 ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-gray-300'}`}>
                #{myRank}/{total}
              </span>
            ) : null;
          })()}
          <span className="text-sm">📍{me.position}</span>
          <span className="text-sm text-red-400">{'❤️'.repeat(me.lives)}{'🖤'.repeat(Math.max(0, 3 - me.lives))}</span>
          {me.karma > 0 && <span className={`text-sm font-bold ${me.karma >= 3 ? 'text-yellow-300' : 'text-gray-400'}`}>✨{me.karma}</span>}
          {me.is_zombie && <span className="text-green-400 font-bold">🧟</span>}
          <div className="ml-auto text-xs text-gray-500">Раунд {room.current_round}</div>
        </div>
      )}

      <div className="pt-16 flex-1 flex flex-col">
        {/* ────────── LOBBY ────────── */}
        {room.status === 'lobby' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
            <h1 className="text-4xl font-black text-center">🧟 Выживач</h1>
            <p className="text-gray-400">Ожидание игроков...</p>
            <div className="grid grid-cols-4 gap-3">
              {players.filter(p => !p.is_host).map(p => (
                <div key={p.id} className={`flex flex-col items-center gap-1 p-3 rounded-xl border ${
                  p.id === me?.id ? 'border-yellow-500 bg-yellow-900/20' : 'border-gray-700 bg-gray-900'
                }`}>
                  <img src={getAvatarUrl(p.avatar, 3)} alt="" className="w-12 h-12 object-contain" />
                  <span className="text-xs font-bold truncate max-w-full">{p.name}</span>
                  {p.id === me?.id && <span className="text-xs text-yellow-400">Это вы</span>}
                </div>
              ))}
            </div>
            <p className="text-gray-500 text-sm animate-pulse">{players.filter(p => !p.is_host).length} игроков подключено</p>
          </div>
        )}

        {/* ────────── RULES ────────── */}
        {room.status === 'rules' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4 text-center">
            <h2 className="text-3xl font-black">📜 Правила</h2>
            <div className="max-w-sm text-sm text-gray-300 leading-relaxed space-y-2">
              <p>✅ Правильный → +1 клетка. Первый → +2.</p>
              <p>❌ Ошибка → стой на месте, −1 жизнь.</p>
              <p>🧟 3 ошибки → зомби. Зомби всегда +1.</p>
              <p>✨ 3 правильных подряд → карма. 3 кармы → дуэль!</p>
              <p>⚡ Клетки 19-26 = БЛИЦ</p>
            </div>
            <p className="text-gray-500 animate-pulse mt-4">Ведущий начнёт игру...</p>
          </div>
        )}

        {/* ────────── MOVING ────────── */}
        {room.status === 'moving' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
            <h2 className="text-3xl font-black">🎲 Ходим!</h2>
            {me && (
              <div className="flex flex-col items-center gap-2">
                <img src={getAvatarUrl(me.avatar, me.lives)} alt="" className="w-20 h-20 object-contain" />
                <span className="text-lg font-bold">{me.name}</span>
                <span className="text-gray-400">Клетка {me.position}</span>
              </div>
            )}
            {/* Zombie bomb activation button */}
            {me?.is_zombie && (
              <button
                onClick={async () => {
                  if (!room || !me) return;
                  // Mark zombie bomb as active for next round
                  await updatePlayer(me.id, { karma: me.karma }); // stub — real implementation via room update
                }}
                className="px-6 py-3 bg-green-700 hover:bg-green-600 rounded-xl font-bold text-lg animate-pulse"
              >
                💣 Зомби-бомба!
              </button>
            )}
            <p className="text-gray-500 animate-pulse">Ждите вопроса...</p>
          </div>
        )}

        {/* ────────── ROUND INTRO ────────── */}
        {room.status === 'round_intro' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
            <div className="text-6xl font-black animate-bounce">
              {MODE_LABELS[room.current_mode as RoundMode]?.split(' ')[0] ?? '🎮'}
            </div>
            <h2 className="text-2xl font-bold text-center" style={{ color: MODE_COLORS[room.current_mode as RoundMode] }}>
              {MODE_LABELS[room.current_mode as RoundMode]}
            </h2>
            {room.zombie_bomb_active && (
              <div className="px-4 py-2 bg-green-900/40 border border-green-500 rounded-xl text-green-300 font-bold animate-pulse">
                💣 ЗОМБИ-БОМБА!
              </div>
            )}
            <p className="text-gray-500 animate-pulse">Готовьтесь!</p>
          </div>
        )}

        {/* ────────── ROUND PLAYING ────────── */}
        {room.status === 'round_playing' && qData && (
          <div className="flex-1 flex flex-col p-4 gap-4">
            {submitted ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4">
                <div className="text-6xl">
                  {choiceAnswer != null && choiceAnswer === (qData.correct as number) ? '✅' :
                   choiceAnswer != null ? '❌' : '✅'}
                </div>
                <h2 className="text-2xl font-bold text-center">Ответ отправлен!</h2>
                <p className="text-gray-500">Ждите результатов...</p>

                {/* Bet button (if not already bet and answer submitted) */}
                {!myBet && !me?.is_zombie && (
                  <div className="mt-4 text-center">
                    <p className="text-gray-400 text-sm mb-2">🎰 Ставка на зеро — никто не ответил правильно?</p>
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => handleBet('life')}
                        className="px-4 py-2 bg-red-700 hover:bg-red-600 rounded-lg text-sm font-bold"
                      >❤️ Ставка жизнью</button>
                      {me && me.karma >= 1 && (
                        <button
                          onClick={() => handleBet('karma')}
                          className="px-4 py-2 bg-yellow-700 hover:bg-yellow-600 rounded-lg text-sm font-bold"
                        >✨ Ставка кармой</button>
                      )}
                    </div>
                  </div>
                )}
                {myBet && <p className="text-yellow-400 font-bold">🎰 Ставка сделана: {myBet.bet_type === 'life' ? '❤️ жизнь' : '✨ карма'}</p>}
              </div>
            ) : (
              <>
                {/* ── УМНИК ── */}
                {room.current_mode === 'umnik' && qData.options && (
                  <div className="flex flex-col gap-4">
                    <h2 className="text-xl font-bold text-center leading-snug">{qData.question as string}</h2>
                    <div className="grid grid-cols-1 gap-2">
                      {(qData.options as string[]).map((opt, i) => (
                        <button
                          key={i}
                          onClick={() => submitChoiceAnswer(i, idx => idx === (qData.correct as number))}
                          className="px-4 py-4 bg-gray-800 border border-gray-600 hover:border-yellow-500 hover:bg-yellow-900/20 rounded-xl font-medium text-left transition-all active:scale-95"
                        >
                          <span className="text-gray-500 mr-2">{String.fromCharCode(65 + i)}.</span>{opt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── ART HISTORIAN ── */}
                {room.current_mode === 'art_historian' && (
                  <div className="flex flex-col gap-4">
                    <h2 className="text-lg font-bold text-center">{qData.question as string}</h2>
                    <img
                      src={qData.image_url as string}
                      alt="artwork"
                      className={`max-h-52 object-contain rounded-xl mx-auto ${room.zombie_bomb_active ? 'blur-md' : ''}`}
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Ваш ответ..."
                        value={textAnswer}
                        onChange={e => setTextAnswer(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && submitTextAnswerFn(qData.accept_answer as string[])}
                        className="flex-1 bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white outline-none focus:border-yellow-500"
                        autoFocus
                      />
                      <button
                        onClick={() => submitTextAnswerFn(qData.accept_answer as string[])}
                        className="px-4 py-3 bg-yellow-600 hover:bg-yellow-500 rounded-xl font-bold"
                      >OK</button>
                    </div>
                  </div>
                )}

                {/* ── INTERPRETER ── */}
                {room.current_mode === 'interpreter' && (
                  <div className="flex flex-col gap-4">
                    <div className="bg-gray-900 border border-purple-500/40 rounded-2xl p-4 text-purple-200 italic">
                      "{qData.translated_text as string}"
                    </div>
                    <p className="text-gray-400 text-sm text-center">
                      {room.zombie_bomb_active ? '💣 Только название песни' : 'Название песни или исполнитель'}
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Ваш ответ..."
                        value={textAnswer}
                        onChange={e => setTextAnswer(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && submitTextAnswerFn(qData.accept_answer as string[])}
                        className="flex-1 bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white outline-none focus:border-yellow-500"
                        autoFocus
                      />
                      <button
                        onClick={() => submitTextAnswerFn(qData.accept_answer as string[])}
                        className="px-4 py-3 bg-yellow-600 hover:bg-yellow-500 rounded-xl font-bold"
                      >OK</button>
                    </div>
                  </div>
                )}

                {/* ── MATHEMATICIAN ── */}
                {room.current_mode === 'mathematician' && qData.problems && (
                  <MathProblemInput
                    problems={qData.problems as MathProblem[]}
                    timerSec={(qData.timer_sec as number) ?? 60}
                    onDone={async (correctCount, myAnswers) => {
                      if (!room || !me) return;
                      setSubmitted(true);
                      await submitAnswer(room.id, me.id, room.current_round, { answer_data: { correct_count: correctCount, answers: myAnswers }, is_correct: correctCount > 0 });
                    }}
                  />
                )}

                {/* ── MEMORY DIARY ── */}
                {room.current_mode === 'memory_diary' && (
                  <div className="flex flex-col items-center gap-4">
                    {showSequence ? (
                      <div className="flex flex-col items-center gap-4">
                        <h2 className="text-xl font-bold">Запомните! ({seqTimer}s)</h2>
                        <div className="flex gap-3">
                          {(qData.sequence as string[]).map((c, i) => (
                            <div key={i} className="w-14 h-14 rounded-full border-4 border-white/30"
                              style={{ backgroundColor: MEMORY_COLORS[c] }} />
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="w-full">
                        <h2 className="text-xl font-bold text-center mb-4">Повторите последовательность!</h2>
                        <ColorSequenceInput
                          sequence={qData.sequence as string[]}
                          onSubmit={async (input) => {
                            if (!room || !me) return;
                            const seq = qData.sequence as string[];
                            const correct = input.every((c, i) => c === seq[i]);
                            setSubmitted(true);
                            await submitAnswer(room.id, me.id, room.current_round, { answer_data: { sequence: input }, is_correct: correct });
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* ── TAG PUZZLE ── */}
                {room.current_mode === 'tag_puzzle' && qData.initial_state && (
                  <div className="flex flex-col items-center gap-4">
                    <h2 className="text-xl font-bold">Решите пятнашки!</h2>
                    <div className="max-w-xs w-full">
                      <TagPuzzle
                        size={(qData.size as number) ?? 3}
                        initialState={qData.initial_state as number[]}
                        onSolve={async () => {
                          if (!room || !me) return;
                          setPuzzleSolved(true);
                          setSubmitted(true);
                          await submitAnswer(room.id, me.id, room.current_round, { answer_data: { solved: true, time: Date.now() }, is_correct: true });
                        }}
                      />
                    </div>
                    {!puzzleSolved && <p className="text-gray-500 text-sm">Двигайте плитки, чтобы расставить числа по порядку</p>}
                  </div>
                )}

                {/* ── BLITZ ── */}
                {room.current_mode === 'blitz' && qData.options && (
                  <div className="flex flex-col gap-4">
                    <h2 className="text-xl font-bold text-center text-red-400">{qData.question as string}</h2>
                    <div className="grid grid-cols-2 gap-2">
                      {(qData.options as string[]).map((opt, i) => (
                        <button
                          key={i}
                          onClick={() => submitChoiceAnswer(i, idx => idx === (qData.correct_index as number))}
                          className="px-3 py-4 bg-gray-800 border border-red-500/30 hover:border-red-400 hover:bg-red-900/20 rounded-xl font-medium text-center transition-all active:scale-95"
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ────────── ROUND RESULTS ────────── */}
        {room.status === 'round_results' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
            <h2 className="text-3xl font-black">📊 Результаты</h2>
            {me && room.round_results_data && (
              (() => {
                const myResult = (room.round_results_data.player_results as Array<{ player_id: string; is_correct: boolean; was_first: boolean; position_change: number; new_position: number; lives_change: number; karma_change: number; is_zombie_now: boolean }>)?.find(r => r.player_id === me.id);
                if (!myResult) return <p className="text-gray-400 animate-pulse">Загрузка...</p>;
                return (
                  <div className="flex flex-col items-center gap-3">
                    <img src={getAvatarUrl(me.avatar, me.lives)} alt="" className="w-20 h-20 object-contain" />
                    {myResult.is_correct ? (
                      <div className="text-green-400 font-black text-2xl">{myResult.was_first ? '⚡ Первый! +2' : '✅ Правильно! +1'}</div>
                    ) : (
                      <div className="text-red-400 font-black text-2xl">❌ Неправильно. −♥</div>
                    )}
                    <div className="text-gray-300">Клетка: {me.position} → {myResult.new_position}</div>
                    {myResult.karma_change > 0 && <div className="text-yellow-400">+{myResult.karma_change} ✨ карма!</div>}
                    {myResult.is_zombie_now && !me.is_zombie && <div className="text-green-400 font-black text-xl">🧟 ТЫ СТАЛ ЗОМБИ!</div>}
                  </div>
                );
              })()
            )}
            {room.round_results_data?.correct_answer && (
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 text-center">
                <span className="text-gray-400 text-sm">Правильный ответ: </span>
                <span className="font-bold text-green-400">{room.round_results_data.correct_answer}</span>
              </div>
            )}
          </div>
        )}

        {/* ────────── BET REVEAL ────────── */}
        {room.status === 'bet_reveal' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
            <h2 className="text-3xl font-black">🎰 Ставки</h2>
            {myBet && me && room.bet_results_data && (
              (() => {
                const myBetResult = (room.bet_results_data.bets as Array<{ player_id: string; won: boolean; bet_type: string }>)?.find(b => b.player_id === me.id);
                if (!myBetResult) return null;
                return (
                  <div className={`flex flex-col items-center gap-3 p-6 rounded-2xl border ${
                    myBetResult.won ? 'border-green-500 bg-green-900/20' : 'border-red-500 bg-red-900/20'
                  }`}>
                    <span className="text-4xl">{myBetResult.won ? '✅' : '❌'}</span>
                    <span className="font-bold text-xl">{myBetResult.won ? 'Ставка сыграла!' : 'Ставка не сыграла'}</span>
                    <span className="text-gray-400">{myBet.bet_type === 'life' ? '❤️ Жизнь' : '✨ Карма'}</span>
                  </div>
                );
              })()
            )}
            {!myBet && <p className="text-gray-500">Вы не делали ставок в этом раунде</p>}
          </div>
        )}

        {/* ────────── DUEL INTRO ────────── */}
        {room.status === 'duel_intro' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
            <h2 className="text-4xl font-black">⚔️ ДУЭЛЬ!</h2>
            {duel && (
              <div className="flex items-center gap-6">
                {[duel.challenger_id, duel.challenged_id].map(pid => {
                  const p = players.find(x => x.id === pid);
                  if (!p) return null;
                  const isMe = pid === me?.id;
                  return (
                    <div key={pid} className={`flex flex-col items-center gap-2 ${isMe ? 'scale-110' : ''}`}>
                      <img src={getAvatarUrl(p.avatar, p.lives)} alt="" className="w-20 h-20 object-contain" />
                      <span className={`font-bold ${isMe ? 'text-yellow-300' : ''}`}>{p.name}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {isDuelist ? (
              <p className="text-yellow-400 font-bold animate-pulse">⚔️ Вы участвуете в дуэли!</p>
            ) : (
              <p className="text-gray-400 animate-pulse">
                {duel?.mode === 'minesweeper' ? 'Вы будете расставлять мины...' :
                 duel?.mode === 'arithmetic_mean' ? 'Вы будете вводить число...' :
                 'Вы будете голосовать...'}
              </p>
            )}
          </div>
        )}

        {/* ────────── DUEL SETUP ────────── */}
        {room.status === 'duel_setup' && duel && !isDuelist && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
            {duel.mode === 'minesweeper' && (() => {
              const dd = duel.duel_data as { tile_count?: number; mined_tiles?: Record<string, number[]> } | null;
              const myMines = dd?.mined_tiles?.[me?.id ?? ''] ?? [];
              const tileCount = dd?.tile_count ?? 6;
              return (
                <div className="flex flex-col items-center gap-4">
                  <h2 className="text-2xl font-bold">💣 Расставьте мину</h2>
                  <p className="text-gray-400 text-sm">Выберите одну плитку для минирования</p>
                  <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: tileCount }).map((_, i) => {
                      const mined = myMines.includes(i);
                      return (
                        <button key={i} onClick={() => handleMinePlacement(i)} disabled={mined || myMines.length >= 1}
                          className={`w-16 h-16 rounded-xl font-bold text-xl transition-all ${
                            mined ? 'bg-red-800 border border-red-500 text-red-300' :
                            myMines.length >= 1 ? 'bg-gray-700 opacity-50 cursor-not-allowed' :
                            'bg-gray-700 hover:bg-gray-600 border border-gray-500 active:scale-95'
                          }`}>
                          {mined ? '💣' : i + 1}
                        </button>
                      );
                    })}
                  </div>
                  {myMines.length >= 1 && <p className="text-green-400 font-bold">✅ Мина расставлена! Ждите начала дуэли.</p>}
                </div>
              );
            })()}

            {duel.mode === 'crowd_forecast' && (() => {
              const dd = duel.duel_data as { question?: string; options?: string[]; player_votes?: Record<string, number> } | null;
              const voted = dd?.player_votes?.[me?.id ?? ''] != null;
              return (
                <div className="flex flex-col items-center gap-4">
                  <h2 className="text-2xl font-bold">🗳️ Ваш голос</h2>
                  <p className="text-gray-300 text-center">{dd?.question}</p>
                  {voted ? (
                    <p className="text-green-400 font-bold">✅ Голос принят!</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
                      {(dd?.options ?? []).map((opt, i) => (
                        <button key={i} onClick={() => handleCrowdVote(i)}
                          className="px-4 py-3 bg-gray-800 border border-gray-600 hover:border-purple-500 rounded-xl active:scale-95">
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {duel.mode === 'arithmetic_mean' && (() => {
              const dd = duel.duel_data as { question?: string; player_guesses?: Record<string, number> } | null;
              const guessed = dd?.player_guesses?.[me?.id ?? ''] != null;
              const [numInput, setNumInput] = useState('');
              return (
                <div className="flex flex-col items-center gap-4">
                  <h2 className="text-2xl font-bold">📊 Введите число</h2>
                  <p className="text-gray-300 text-center">{dd?.question}</p>
                  {guessed ? (
                    <p className="text-green-400 font-bold">✅ Число введено! Дуэлянты угадывают среднее.</p>
                  ) : (
                    <div className="flex gap-2">
                      <input type="number" value={numInput} onChange={e => setNumInput(e.target.value)}
                        className="w-32 text-center text-xl bg-gray-800 border border-gray-600 rounded-xl px-3 py-2 text-white outline-none focus:border-blue-500"
                        autoFocus />
                      <button onClick={() => handleCrowdGuess(parseInt(numInput, 10))}
                        disabled={!numInput}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold disabled:opacity-40">OK</button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ── Duel setup (duelists see waiting screen) ── */}
        {room.status === 'duel_setup' && isDuelist && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
            <h2 className="text-2xl font-bold">⚔️ Вы дуэлянт!</h2>
            <p className="text-gray-400">Остальные подготавливают поле...</p>
            <p className="text-gray-500 animate-pulse">Ожидайте начала дуэли</p>
          </div>
        )}

        {/* ────────── DUEL PLAYING ────────── */}
        {room.status === 'duel_playing' && isDuelist && duel && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
            <h2 className="text-2xl font-bold">⚔️ Ваш ход!</h2>

            {duel.mode === 'minesweeper' && (() => {
              const dd = duel.duel_data as { tile_count?: number; mined_tiles?: Record<string, number[]>; challenger_picks?: number[]; challenged_picks?: number[] } | null;
              const isChallenger = duel.challenger_id === me?.id;
              const myPicks = isChallenger ? (dd?.challenger_picks ?? []) : (dd?.challenged_picks ?? []);
              const tileCount = dd?.tile_count ?? 6;
              const submitted_ = myPicks.length > 0;
              return (
                <div className="flex flex-col items-center gap-4">
                  <p className="text-gray-300 text-sm">Выберите плитку — под одной из них мина!</p>
                  <div className="grid grid-cols-3 gap-3">
                    {Array.from({ length: tileCount }).map((_, i) => {
                      const picked = myPicks.includes(i);
                      return (
                        <button key={i} onClick={() => !submitted_ && handleDuelPickTile(i)}
                          className={`w-20 h-20 rounded-xl font-bold text-2xl transition-all ${
                            picked ? 'bg-yellow-800 border border-yellow-500' :
                            submitted_ ? 'opacity-50 cursor-not-allowed bg-gray-800' :
                            'bg-gray-700 hover:bg-gray-600 border border-gray-500 active:scale-90'
                          }`}>
                          {picked ? '🤞' : '?'}
                        </button>
                      );
                    })}
                  </div>
                  {submitted_ && <p className="text-gray-400 animate-pulse">Ждите результата...</p>}
                </div>
              );
            })()}

            {duel.mode === 'arithmetic_mean' && (() => {
              const dd = duel.duel_data as { question?: string; average?: number | null; challenger_answer?: number | null; challenged_answer?: number | null } | null;
              const isChallenger = duel.challenger_id === me?.id;
              const myAns = isChallenger ? dd?.challenger_answer : dd?.challenged_answer;
              const avg = dd?.average;
              const [numInput, setNumInput] = useState('');
              return (
                <div className="flex flex-col items-center gap-4">
                  <p className="text-gray-300 text-center">{dd?.question}</p>
                  {avg != null && <p className="text-blue-400 font-bold text-2xl">Среднее: {avg.toFixed(2)}</p>}
                  {myAns == null ? (
                    <div className="flex gap-2">
                      <input type="number" value={numInput} onChange={e => setNumInput(e.target.value)}
                        className="w-36 text-center text-xl bg-gray-800 border border-gray-600 rounded-xl px-3 py-2 text-white outline-none"
                        autoFocus />
                      <button onClick={() => handleDuelArithmeticAnswer(parseFloat(numInput))}
                        className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 rounded-xl font-bold">OK</button>
                    </div>
                  ) : (
                    <p className="text-green-400">✅ Ваш ответ: {myAns}</p>
                  )}
                </div>
              );
            })()}

            {duel.mode === 'crowd_forecast' && (() => {
              const dd = duel.duel_data as { question?: string; options?: string[]; challenger_prediction?: number | null; challenged_prediction?: number | null } | null;
              const isChallenger = duel.challenger_id === me?.id;
              const myPred = isChallenger ? dd?.challenger_prediction : dd?.challenged_prediction;
              return (
                <div className="flex flex-col items-center gap-4">
                  <p className="text-gray-300 text-center">{dd?.question}</p>
                  <p className="text-gray-400 text-sm">Какой вариант выберет большинство?</p>
                  {myPred == null ? (
                    <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
                      {(dd?.options ?? []).map((opt, i) => (
                        <button key={i} onClick={() => handleDuelCrowdPrediction(i)}
                          className="px-4 py-3 bg-gray-800 border border-gray-600 hover:border-yellow-500 rounded-xl active:scale-95">
                          {opt}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-green-400">✅ Ваш прогноз отправлен</p>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ── Non-duelists watching duel play ── */}
        {room.status === 'duel_playing' && !isDuelist && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
            <h2 className="text-2xl font-bold">⚔️ Дуэль идёт!</h2>
            {duel && (
              <div className="flex gap-6">
                {[duel.challenger_id, duel.challenged_id].map(pid => {
                  const p = players.find(x => x.id === pid);
                  if (!p) return null;
                  return (
                    <div key={pid} className="flex flex-col items-center gap-2">
                      <img src={getAvatarUrl(p.avatar, p.lives)} alt="" className="w-16 h-16 object-contain" />
                      <span className="font-bold text-sm">{p.name}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-gray-500 animate-pulse">Смотрите на экран ведущего</p>
          </div>
        )}

        {/* ────────── DUEL RESULT ────────── */}
        {room.status === 'duel_result' && duel && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
            <h2 className="text-3xl font-black">⚔️ Итог дуэли</h2>
            {duel.winner_id ? (
              (() => {
                const w = players.find(p => p.id === duel.winner_id);
                const isMe_ = duel.winner_id === me?.id;
                return (
                  <div className="flex flex-col items-center gap-2">
                    {w && <img src={getAvatarUrl(w.avatar, w.lives)} alt="" className="w-20 h-20 object-contain" />}
                    <span className={`text-2xl font-black ${isMe_ ? 'text-yellow-400' : 'text-white'}`}>
                      {isMe_ ? '🏆 Вы победили!' : `🏆 Победил ${w?.name}`}
                    </span>
                  </div>
                );
              })()
            ) : (
              <span className="text-xl text-gray-400">🤝 Ничья</span>
            )}
          </div>
        )}

        {/* ────────── HOT POTATO ────────── */}
        {room.status === 'potato_intro' && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-600 via-red-950 to-black text-center relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-orange-500/20 blur-[100px] rounded-full pointer-events-none"></div>

            <h2 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-yellow-300 via-orange-500 to-red-600 drop-shadow-[0_0_20px_rgba(234,88,12,0.8)] animate-pulse tracking-tighter uppercase leading-none mb-8 relative z-10">
              ГОРЯЧАЯ<br/>КАРТОШКА!
            </h2>
            <div className="text-xl text-gray-200 mb-8 max-w-sm space-y-4 border border-orange-500/20 bg-black/30 backdrop-blur p-6 rounded-3xl shadow-xl relative z-10">
              <p>Все выжившие ответили верно!</p>
              <p>Придётся кому-то взять удар на себя.</p>
            </div>
            
            <div className="bg-gradient-to-r from-red-600/20 to-orange-600/20 border border-orange-500/30 p-6 rounded-[2rem] mb-10 w-full max-w-sm relative z-10 shadow-[0_0_30px_rgba(234,88,12,0.2)]">
              <p className="text-3xl font-black text-white text-center tracking-tight mb-2">ТРЯСИ ТЕЛЕФОН</p>
              <p className="text-orange-300 font-medium opacity-80 text-center">или жми кнопку,<br/>чтобы перекинуть бомбу!</p>
            </div>

            <button 
              onClick={async () => {
                if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
                  try {
                    await (DeviceMotionEvent as any).requestPermission();
                  } catch(e) {
                    console.error(e);
                  }
                }
              }} 
              className="w-full max-w-xs py-5 bg-gradient-to-b from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 rounded-full text-2xl font-black text-white shadow-[0_0_40px_rgba(234,88,12,0.6)] active:scale-95 transition-all outline-none border-b-4 border-red-800 relative z-10 tracking-widest uppercase"
            >
              ПОНЯЛ
            </button>
          </div>
        )}

        {room.status === 'potato_playing' && (() => {
          const rd = room.round_results_data as any;
          const holderId = rd?.potato_bomb_holder;
          const imHolder = holderId === me?.id;
          const imDead = me?.is_zombie ?? false;

          return (
            <div className={`flex-1 flex flex-col items-center justify-center p-8 transition-colors duration-700 relative overflow-hidden ${imHolder ? 'bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-red-800 via-red-950 to-black' : 'bg-gray-950'}`}>
              
              {/* ImDead view */}
              {imDead ? (
                <div className="relative z-10 flex flex-col items-center gap-6">
                  <div className="text-6xl grayscale opacity-30">🧟</div>
                  <h2 className="text-3xl font-black text-gray-500 text-center uppercase tracking-wide px-8">
                    Зомби не боятся бомб
                  </h2>
                </div>
              ) 
              
              /* Bomb Holder View */
              : imHolder ? (
                <>
                  <div className="absolute inset-0 bg-red-600/20 animate-ping pointer-events-none mix-blend-screen" style={{ animationDuration: '0.4s' }} />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.8)_100%)] pointer-events-none relative z-10"></div>
                  
                  <div className="relative z-20 flex flex-col items-center w-full max-w-sm">
                    <h2 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-red-300 drop-shadow-[0_0_30px_rgba(239,68,68,1)] animate-shake tracking-tighter uppercase text-center mb-8">
                      БОМБА У ТЕБЯ!
                    </h2>
                    
                    <div className="relative mb-12">
                      <div className="absolute inset-0 bg-red-600 blur-[50px] opacity-60 rounded-full animate-pulse"></div>
                      <div className="text-9xl animate-bounce drop-shadow-[0_0_40px_rgba(255,255,255,0.6)] filter contrast-125 saturate-150 relative z-10">💣</div>
                    </div>
                    
                    <div className="bg-black/40 border border-red-500/30 rounded-3xl p-6 backdrop-blur w-full mb-8 shadow-2xl">
                      <p className="text-3xl font-black text-white text-center animate-pulse tracking-tight text-red-50">
                        ОТДАЙ ЕЁ!
                      </p>
                      <p className="text-red-400 font-semibold text-center mt-2 uppercase">Тряси или жми кнопку</p>
                    </div>

                    <button
                      onClick={() => handlePotatoPass()}
                      className="w-full py-6 bg-gradient-to-b from-red-500 to-red-800 rounded-full text-3xl font-black text-white shadow-[0_0_60px_rgba(239,68,68,0.8)] active:scale-95 transition-all border-b-[6px] border-red-950 uppercase tracking-widest"
                    >
                      ПЕРЕКИНУТЬ
                    </button>
                  </div>
                </>
              ) 
              
              /* Idle Player View */
              : (
                <div className="relative z-10 flex flex-col items-center gap-10">
                  <div className="relative">
                    <div className="text-8xl grayscale opacity-30 drop-shadow-xl saturate-0">💣</div>
                  </div>
                  <div className="bg-gray-900/50 border border-gray-800 p-8 rounded-[2rem] text-center w-full max-w-sm backdrop-blur-sm">
                    <h2 className="text-3xl font-black text-gray-400 tracking-tight uppercase leading-snug">
                      Бомба не у тебя.
                    </h2>
                    <p className="text-xl text-green-500/70 font-semibold mt-4 animate-pulse">
                      Молись! 🙏
                    </p>
                  </div>
                  {holderId && (
                    <p className="text-lg text-gray-600 font-medium uppercase tracking-widest text-center mt-4">
                      Следи на экране
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {room.status === 'potato_result' && (() => {
          const rd = room.round_results_data as any;
          const loserId = rd?.potato_loser;
          const imLoser = loserId === me?.id;

          return (
            <div className={`flex-1 flex flex-col items-center justify-center p-8 transition-colors duration-1000 relative overflow-hidden ${imLoser ? 'bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-900 via-black to-black' : 'bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-green-900/20 via-black to-black'}`}>
              
              {imLoser && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-red-600/30 blur-[100px] rounded-full pointer-events-none mix-blend-screen"></div>}
              
              <h2 className={`text-6xl font-black text-center mb-10 tracking-tighter uppercase relative z-10 ${imLoser ? 'text-transparent bg-clip-text bg-gradient-to-b from-white to-red-600 drop-shadow-[0_0_30px_rgba(239,68,68,1)] animate-shake' : 'text-gray-600'}`}>
                💥 БАБАХ! 💥
              </h2>
              
              <div className={`relative z-10 p-8 rounded-[2rem] text-center w-full max-w-sm backdrop-blur-md border ${imLoser ? 'bg-red-950/40 border-red-500/30 shadow-[0_0_50px_rgba(239,68,68,0.4)]' : 'bg-gray-900/40 border-gray-800'}`}>
                {imLoser ? (
                  <div className="flex flex-col gap-4">
                    <p className="text-4xl font-black text-white uppercase tracking-tight">
                      Ты взорвался!
                    </p>
                    <div className="mx-auto bg-red-500/20 border border-red-500 text-red-400 py-3 px-6 rounded-full inline-block">
                      <span className="text-2xl font-black tracking-widest">-1 ЖИЗНЬ</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="text-3xl font-black text-gray-300 uppercase tracking-tight">
                      Тебя пронесло
                    </p>
                    <p className="text-green-500/80 font-bold text-xl uppercase mt-2">Фух 😮‍💨</p>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ────────── BLITZ INTRO ────────── */}
        {room.status === 'blitz_intro' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 bg-gradient-to-b from-gray-950 to-red-950">
            <h2 className="text-5xl font-black text-red-400 animate-pulse">⚡ БЛИЦ!</h2>
            <p className="text-gray-300 text-center max-w-xs">Быстрые вопросы! Правильный ответ → +1 клетка. Последний штрафуется!</p>
          </div>
        )}

        {/* ────────── BLITZ PLAYING (same as round_playing/blitz) ────────── */}
        {room.status === 'blitz_playing' && qData && (
          <div className="flex-1 flex flex-col p-4 gap-4 bg-gradient-to-b from-gray-950 to-red-950/20">
            {submitted ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3">
                <div className="text-4xl">{choiceAnswer === qData.correct_index ? '✅' : '❌'}</div>
                <p className="text-gray-400 animate-pulse">Ждите следующего вопроса...</p>
              </div>
            ) : (
              <>
                <p className="text-red-400 font-bold text-center">⚡ Раунд {room.current_round}</p>
                <h2 className="text-xl font-bold text-center">{qData.question as string}</h2>
                <div className="grid grid-cols-2 gap-2">
                  {(qData.options as string[]).map((opt, i) => (
                    <button key={i}
                      onClick={() => submitChoiceAnswer(i, idx => idx === (qData.correct_index as number))}
                      className="px-3 py-4 bg-gray-800 border border-red-500/30 hover:border-red-400 hover:bg-red-900/20 rounded-xl font-medium text-center active:scale-95">
                      {opt}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ────────── FINISHED ────────── */}
        {room.status === 'finished' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
            <h1 className="text-5xl font-black">🏆 Финиш!</h1>
            {me && (
              <div className="flex flex-col items-center gap-2">
                <img src={getAvatarUrl(me.avatar, me.lives)} alt="" className="w-20 h-20 object-contain" />
                <span className="font-bold text-xl">{me.name}</span>
                <span className="text-gray-400">Клетка {me.position} · {me.lives}❤️ · {me.karma}✨</span>
              </div>
            )}
            <div className="w-full max-w-xs space-y-2">
              {players.filter(p => !p.is_host).sort((a, b) => b.position - a.position).map((p, i) => (
                <div key={p.id} className={`flex items-center gap-3 p-2 rounded-xl ${p.id === me?.id ? 'bg-yellow-900/20 border border-yellow-500/50' : 'bg-gray-900'}`}>
                  <span>{['🥇','🥈','🥉'][i] ?? `#${i+1}`}</span>
                  <img src={getAvatarUrl(p.avatar, p.lives)} alt="" className="w-8 h-8 object-contain" />
                  <span className="flex-1 font-medium">{p.name}</span>
                  <span className="text-gray-400 text-sm">кл.{p.position}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
