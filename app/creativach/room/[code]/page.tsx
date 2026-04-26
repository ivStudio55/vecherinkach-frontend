// app/creativach/room/[code]/page.tsx
// Экран игрока «Креативач»
'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  fetchCreativachRoom,
  fetchCreativachPlayers,
  fetchCreativachAnswers,
  fetchCreativachVotes,
  subscribeCreativachRoom,
  subscribeCreativachPlayers,
  subscribeCreativachAnswers,
  subscribeCreativachVotes,
  submitCreativachAnswer,
  submitCreativachVote,
  creativachStorage,
} from '@/lib/creativach/api';
import type {
  CreativachRoom,
  CreativachPlayer,
  CreativachAnswer,
  CreativachVote,
} from '@/lib/creativach/types';
import { ROUNDS, ANSWER_TIME_SEC, VOTE_TIME_SEC, TOTAL_ROUNDS } from '@/lib/creativach/types';
import { supabase } from '@/lib/supabase';
import { ShareButton } from '@/shared/ui/ShareButton';

const YANDEX_AUDIO_BASE = process.env.NEXT_PUBLIC_AUDIO_BASE ?? 'https://storage.yandexcloud.net/vecherinkach/audio';

/* ─── Timer Bar ─── */
function TimerBar({ seconds, total }: { seconds: number; total: number }) {
  const pct = total > 0 ? (seconds / total) * 100 : 0;
  const color = seconds <= 10 ? 'bg-red-500' : seconds <= 20 ? 'bg-yellow-400' : 'bg-green-500';
  return (
    <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden border-2 border-black">
      <div className={`h-full ${color} transition-all duration-1000 ease-linear rounded-full`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function CreativachRoomPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params?.code as string) || '';

  const [room, setRoom] = useState<CreativachRoom | null>(null);
  const [players, setPlayers] = useState<CreativachPlayer[]>([]);
  const [answers, setAnswers] = useState<CreativachAnswer[]>([]);
  const [votes, setVotes] = useState<CreativachVote[]>([]);
  const [myId, setMyId] = useState('');
  const [timerSec, setTimerSec] = useState(0);

  // Input state
  const [answerText, setAnswerText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [voted, setVoted] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeOffsetRef = useRef(0);

  // Load session
  useEffect(() => {
    const session = creativachStorage.get();
    if (session.playerId) setMyId(session.playerId);
  }, []);

  useEffect(() => {
    supabase.rpc('get_server_time').then(({ data }) => {
      if (data) timeOffsetRef.current = Date.now() - new Date(data as string).getTime();
    });
  }, []);

  // Initial fetch
  useEffect(() => {
    if (!code) return;
    (async () => {
      const r = await fetchCreativachRoom(code);
      if (!r) return;
      setRoom(r);
      const p = await fetchCreativachPlayers(r.id);
      setPlayers(p);
      if (r.current_round > 0) {
        const a = await fetchCreativachAnswers(r.id, r.current_round);
        setAnswers(a);
        const v = await fetchCreativachVotes(r.id, r.current_round);
        setVotes(v);
      }
    })();
  }, [code]);

  // Realtime
  useEffect(() => {
    if (!room?.id) return;
    const unsubs = [
      subscribeCreativachRoom(room.id, r => setRoom(r)),
      subscribeCreativachPlayers(room.id, p => setPlayers(p)),
    ];
    return () => unsubs.forEach(u => u());
  }, [room?.id]);

  useEffect(() => {
    if (!room?.id || !room.current_round) return;
    const unsubs = [
      subscribeCreativachAnswers(room.id, room.current_round, a => setAnswers(a)),
      subscribeCreativachVotes(room.id, room.current_round, v => setVotes(v)),
    ];
    return () => unsubs.forEach(u => u());
  }, [room?.id, room?.current_round]);

  // Reset input and clear stale answer/vote data when round changes
  useEffect(() => {
    setAnswerText('');
    setSubmitted(false);
    setVoted(false);
    setAnswers([]);
    setVotes([]);
  }, [room?.current_round]);

  // Check if already submitted/voted
  useEffect(() => {
    if (!myId) return;
    const myAnswer = answers.find(a => a.player_id === myId);
    if (myAnswer) setSubmitted(true);
    const myVote = votes.find(v => v.voter_id === myId);
    if (myVote) setVoted(true);
  }, [answers, votes, myId]);

  // Timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!room?.timer_started_at || !room.timer_duration_sec) return;

    const updateTimer = () => {
      const elapsed = Math.floor((Date.now() - timeOffsetRef.current - new Date(room.timer_started_at!).getTime()) / 1000);
      const remaining = Math.max(0, room.timer_duration_sec - elapsed);
      setTimerSec(remaining);
    };
    updateTimer();
    timerRef.current = setInterval(updateTimer, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [room?.timer_started_at, room?.timer_duration_sec]);

  const me = useMemo(() => players.find(p => p.id === myId), [players, myId]);
  const gamePlayers = useMemo(() => players.filter(p => p.role === 'player' && !p.is_host), [players]);
  const currentRoundInfo = room?.current_round ? ROUNDS[room.current_round - 1] : null;

  const sortedByPoints = useMemo(() =>
    [...gamePlayers].sort((a, b) => b.total_points - a.total_points),
    [gamePlayers],
  );

  // Shuffled answers for voting (exclude own)
  const votingAnswers = useMemo(() => {
    const filtered = answers.filter(a => a.player_id !== myId);
    // Shuffle
    const arr = [...filtered];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers.length, myId, room?.voting_phase]);

  const voteResults = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of votes) {
      map.set(v.voted_for_id, (map.get(v.voted_for_id) || 0) + 1);
    }
    return map;
  }, [votes]);

  const answersWithVotes = useMemo(() => {
    return answers.map(a => ({
      ...a,
      voteCount: voteResults.get(a.player_id) || 0,
      player: gamePlayers.find(p => p.id === a.player_id),
    })).sort((a, b) => b.voteCount - a.voteCount);
  }, [answers, voteResults, gamePlayers]);

  const handleSubmitAnswer = useCallback(async () => {
    if (!room || !myId || !answerText.trim()) return;
    try {
      await submitCreativachAnswer(room.id, room.current_round, myId, answerText.trim());
      setSubmitted(true);
    } catch (err) {
      console.error('handleSubmitAnswer failed:', err);
      alert('Не удалось отправить ответ. Попробуй ещё раз.');
    }
  }, [room, myId, answerText]);

  const handleVote = useCallback(async (votedForId: string) => {
    if (!room || !myId || voted) return;
    const myRole = me?.role || 'player';
    try {
      await submitCreativachVote(room.id, room.current_round, myId, votedForId, myRole);
      setVoted(true);
    } catch (err) {
      console.error('handleVote failed:', err);
      alert('Не удалось зарегистрировать голос. Попробуй ещё раз.');
    }
  }, [room, myId, voted, me]);

  if (!room || !me) {
    return (
      <div className="min-h-screen bg-[#FF6B35] flex items-center justify-center">
        <div className="cartoon-panel p-8 text-center">
          <p className="text-xl font-black text-black">Загрузка...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FF6B35] text-white overflow-hidden relative">
      {/* Фон */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="creativach-sunrays" />
      </div>

      {/* Header */}
      <div className="relative z-20 bg-black/30 backdrop-blur-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-black drop-shadow-[2px_2px_0_#000]">Креативач</h1>
          <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs font-bold">#{code}</span>
        </div>
        <div className="flex items-center gap-2">
          <img src={`${YANDEX_AUDIO_BASE}/sound/Jokester/ava/${me.avatar}`} alt={me.name} className="w-8 h-8 rounded-lg border-2 border-black" />
          <span className="font-bold text-sm">{me.name}</span>
          <span className="bg-[#FFD700] text-black px-2 py-0.5 rounded-full text-xs font-black border border-black">{me.total_points} оч.</span>
        </div>
      </div>

      <div className="relative z-10 max-w-lg mx-auto px-4 py-6 space-y-4">

        {/* ─── LOBBY ─── */}
        {room.status === 'lobby' && (
          <div className="cartoon-panel p-6 text-center space-y-4 animate-[fadeIn_0.3s_ease]">
            <h2 className="text-2xl font-black text-black">⏳ Ожидание начала</h2>
            <p className="text-gray-700 font-medium">Ведущий скоро запустит игру!</p>
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              {gamePlayers.map(p => (
                <div key={p.id} className={`px-3 py-2 rounded-xl border-2 border-black text-xs font-bold ${p.id === myId ? 'bg-[#FF6B35] text-white' : 'bg-white text-black'}`}>
                  {p.name}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── ROUND RULES ─── */}
        {(room.status === 'round_rules' || room.status === 'final_rules') && currentRoundInfo && (
          <div className="cartoon-panel p-6 text-center space-y-4 animate-[fadeIn_0.3s_ease]">
            <div className="bg-[#FF6B35] text-white px-4 py-2 rounded-xl inline-block border-2 border-black shadow-[2px_2px_0_#000]">
              <span className="font-black text-lg">Раунд {currentRoundInfo.number}</span>
            </div>
            <h2 className="text-2xl font-black text-black">{currentRoundInfo.title}</h2>
            <p className="text-gray-700 font-medium text-sm leading-relaxed">{currentRoundInfo.description}</p>
            <p className="text-sm text-gray-500 animate-pulse">Ведущий скоро запустит раунд...</p>
          </div>
        )}

        {/* ─── ANSWERING ─── */}
        {(room.status === 'round_playing' || room.status === 'final_playing') && room.voting_phase === 'answering' && (
          <div className="space-y-4 animate-[fadeIn_0.3s_ease]">
            <div className="cartoon-panel p-4 text-center space-y-3">
              <p className="text-sm font-bold text-gray-700">Раунд {room.current_round}: {currentRoundInfo?.title}</p>

              {/* Task */}
              <div className="bg-yellow-100 border-2 border-yellow-500 rounded-xl p-3">
                {(room.current_round === 1 || room.current_round === 5) && (
                  <p className="text-4xl font-black text-black tracking-[0.3em]">{room.round_task}</p>
                )}
                {room.current_round === 2 && (
                  <p className="text-lg font-bold text-black">«{room.round_task}»</p>
                )}
                {room.current_round === 3 && (
                  <p className="text-2xl font-black text-black">{room.round_task}</p>
                )}
                {room.current_round === 4 && (
                  <p className="text-base font-bold text-black">Сделайте комплимент игроку «{room.round_task}»</p>
                )}
                {room.current_round === 5 && room.round_task_extra && (
                  <p className="text-sm font-medium text-gray-600 mt-1">Тема: {room.round_task_extra}</p>
                )}
              </div>

              <TimerBar seconds={timerSec} total={ANSWER_TIME_SEC} />
              <p className="text-xs text-gray-500">{timerSec} сек.</p>
            </div>

            {!submitted ? (
              <div className="cartoon-panel p-4 space-y-3">
                <textarea
                  value={answerText}
                  onChange={e => setAnswerText(e.target.value)}
                  maxLength={currentRoundInfo?.maxChars || 200}
                  placeholder={currentRoundInfo?.inputLabel || 'Ваш ответ...'}
                  className="w-full px-4 py-3 text-base cartoon-input min-h-[100px] resize-none"
                  autoFocus
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{answerText.length}/{currentRoundInfo?.maxChars || 200}</span>
                </div>
                <button
                  onClick={handleSubmitAnswer}
                  disabled={!answerText.trim()}
                  className={`w-full py-3 text-lg font-black ${answerText.trim() ? 'cartoon-button' : 'cartoon-panel opacity-50 cursor-not-allowed'}`}
                >
                  ✅ Отправить
                </button>
              </div>
            ) : (
              <div className="cartoon-panel p-6 text-center space-y-2">
                <p className="text-2xl">✅</p>
                <p className="font-black text-black">Ответ отправлен!</p>
                <p className="text-sm text-gray-600">Ожидаем остальных игроков...</p>
              </div>
            )}
          </div>
        )}

        {/* ─── VOTING ─── */}
        {room.voting_phase === 'voting' && (
          <div className="space-y-4 animate-[fadeIn_0.3s_ease]">
            <div className="cartoon-panel p-4 text-center space-y-2">
              <h2 className="text-xl font-black text-black">🗳️ Голосование</h2>
              <p className="text-sm text-gray-600">Выберите самый креативный ответ!</p>
              <TimerBar seconds={timerSec} total={VOTE_TIME_SEC} />
              <p className="text-xs text-gray-500">{timerSec} сек.</p>
            </div>

            {!voted ? (
              <div className="space-y-3">
                {votingAnswers.map((a, i) => (
                  <button
                    key={a.id}
                    onClick={() => handleVote(a.player_id)}
                    className="w-full cartoon-panel p-4 text-left hover:!bg-yellow-50 hover:!border-yellow-500 transition-all active:scale-95 animate-[fadeIn_0.3s_ease]"
                    style={{ animationDelay: `${i * 0.1}s` }}
                  >
                    <p className="font-bold text-black text-base">{a.answer_text}</p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="cartoon-panel p-6 text-center space-y-2">
                <p className="text-2xl">🗳️</p>
                <p className="font-black text-black">Голос учтён!</p>
                <p className="text-sm text-gray-600">Ожидаем остальных...</p>
              </div>
            )}
          </div>
        )}

        {/* ─── RESULTS ─── */}
        {(room.status === 'round_results' || room.status === 'final_results') && room.voting_phase === 'results' && (
          <div className="space-y-4 animate-[fadeIn_0.4s_ease]">
            <div className="cartoon-panel p-4 text-center">
              <h2 className="text-xl font-black text-black">
                {room.status === 'final_results' ? '🏆 Финал!' : `📊 Результаты`}
              </h2>
            </div>

            {/* Answers */}
            <div className="space-y-2">
              {answersWithVotes.map((a, i) => (
                <div
                  key={a.id}
                  className={`cartoon-panel p-3 flex items-center gap-3 ${i === 0 ? '!border-yellow-500 !bg-yellow-50' : ''} ${a.player_id === myId ? 'ring-2 ring-[#FF6B35]' : ''}`}
                >
                  <span className="font-black text-lg w-6 text-center">{i === 0 ? '👑' : `${i + 1}`}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-500">{a.player?.name}</p>
                    <p className="text-sm font-bold text-black truncate">{a.answer_text}</p>
                  </div>
                  <span className="font-black text-[#FF6B35]">{a.voteCount}❤️</span>
                </div>
              ))}
            </div>

            {/* Leaderboard */}
            <div className="cartoon-panel p-4 space-y-2">
              <h3 className="text-lg font-black text-black text-center">🏅 Рейтинг</h3>
              {sortedByPoints.map((p, i) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-2 p-2 rounded-lg ${p.id === myId ? 'bg-[#FF6B35]/10 border border-[#FF6B35]' : ''}`}
                >
                  <span className="font-black w-6 text-center text-sm">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                  </span>
                  <img src={`${YANDEX_AUDIO_BASE}/sound/Jokester/ava/${p.avatar}`} alt={p.name} className="w-8 h-8 rounded-lg border-2 border-black" />
                  <span className="font-bold text-black text-sm flex-1 truncate">{p.name}</span>
                  <span className="font-black text-[#FF6B35]">{p.total_points}</span>
                </div>
              ))}
            </div>

            {room.status === 'final_results' && (
              <div className="space-y-3">
                {sortedByPoints[0] && (
                  <div className="cartoon-panel p-6 text-center space-y-3 !border-yellow-500">
                    <p className="text-sm text-gray-600">🎉 Победитель</p>
                    <img src={`${YANDEX_AUDIO_BASE}/sound/Jokester/ava/${sortedByPoints[0].avatar}`} alt="" className="w-20 h-20 mx-auto rounded-2xl border-4 border-yellow-500 shadow-[4px_4px_0_#000]" />
                    <h2 className="text-3xl font-black text-black">{sortedByPoints[0].name}</h2>
                    <p className="text-xl font-black text-[#FF6B35]">{sortedByPoints[0].total_points} оч.</p>
                  </div>
                )}
                <ShareButton
                  rank={sortedByPoints.findIndex(p => p.id === myId) + 1 || null}
                  points={sortedByPoints.find(p => p.id === myId)?.total_points ?? null}
                  gameName="Креативач"
                  className="w-full py-3 text-base font-black cartoon-button text-center mb-1"
                />
                <div className="flex gap-3">
                  <a href="https://donatty.com/aleksandri" target="_blank" rel="noopener noreferrer" className="flex-1 py-3 text-base font-black cartoon-button-purple text-center">
                    💖 Поддержать
                  </a>
                  <button onClick={() => { creativachStorage.clear(); router.push('/creativach'); }} className="flex-1 py-3 text-base font-black cartoon-button">
                    🚪 Выйти
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── CREDITS ─── */}
        {room.status === 'credits' && (
          <div className="cartoon-panel p-6 text-center space-y-4 animate-[fadeIn_0.3s_ease]">
            <h2 className="text-2xl font-black text-black">🎬 Титры</h2>
            <p className="text-gray-700 font-medium">Смотрите на экран ведущего!</p>

            {/* Mini leaderboard */}
            <div className="space-y-2 mt-4">
              {sortedByPoints.map((p, i) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-2 p-2 rounded-lg ${p.id === myId ? 'bg-[#FF6B35]/10 border border-[#FF6B35]' : ''}`}
                >
                  <span className="font-black w-6 text-center text-sm">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                  </span>
                  <img src={`${YANDEX_AUDIO_BASE}/sound/Jokester/ava/${p.avatar}`} alt={p.name} className="w-8 h-8 rounded-lg border-2 border-black" />
                  <span className="font-bold text-black text-sm flex-1 truncate">{p.name}</span>
                  <span className="font-black text-[#FF6B35]">{p.total_points}</span>
                </div>
              ))}
            </div>

            <ShareButton
              rank={sortedByPoints.findIndex(p => p.id === myId) + 1 || null}
              points={sortedByPoints.find(p => p.id === myId)?.total_points ?? null}
              gameName="Креативач"
              className="w-full py-3 text-base font-black cartoon-button text-center"
            />
            <div className="flex gap-3 mt-4">
              <a href="https://donatty.com/aleksandri" target="_blank" rel="noopener noreferrer" className="flex-1 py-3 text-base font-black cartoon-button-purple text-center">
                💖 Поддержать
              </a>
              <button onClick={() => { creativachStorage.clear(); router.push('/creativach'); }} className="flex-1 py-3 text-base font-black cartoon-button">
                🚪 Выйти
              </button>
            </div>
          </div>
        )}

        {/* ─── FINISHED ─── */}
        {room.status === 'finished' && (
          <div className="cartoon-panel p-6 text-center space-y-4 animate-[fadeIn_0.3s_ease]">
            <h2 className="text-2xl font-black text-black">Игра завершена</h2>
            <button onClick={() => { creativachStorage.clear(); router.push('/creativach'); }} className="cartoon-button py-3 px-8 text-lg">
              🏠 На главную
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        .creativach-sunrays {
          position: absolute; inset: -100%;
          background: repeating-conic-gradient(from 0deg, #FF6B35 0deg 15deg, #E85D2C 15deg 30deg);
          animation: spin 120s linear infinite; z-index: 0;
        }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
