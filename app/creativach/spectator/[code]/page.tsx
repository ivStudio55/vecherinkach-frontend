// app/creativach/spectator/[code]/page.tsx
// Экран зрителя «Креативач»
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
  submitCreativachVote,
  creativachStorage,
} from '@/lib/creativach/api';
import type {
  CreativachRoom,
  CreativachPlayer,
  CreativachAnswer,
  CreativachVote,
} from '@/lib/creativach/types';
import { ROUNDS, ANSWER_TIME_SEC, VOTE_TIME_SEC } from '@/lib/creativach/types';

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

export default function CreativachSpectatorPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params?.code as string) || '';

  const [room, setRoom] = useState<CreativachRoom | null>(null);
  const [players, setPlayers] = useState<CreativachPlayer[]>([]);
  const [answers, setAnswers] = useState<CreativachAnswer[]>([]);
  const [votes, setVotes] = useState<CreativachVote[]>([]);
  const [myId, setMyId] = useState('');
  const [timerSec, setTimerSec] = useState(0);
  const [voted, setVoted] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const session = creativachStorage.get();
    if (session.playerId) setMyId(session.playerId);
  }, []);

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

  useEffect(() => {
    setVoted(false);
  }, [room?.current_round]);

  useEffect(() => {
    if (!myId) return;
    const myVote = votes.find(v => v.voter_id === myId);
    if (myVote) setVoted(true);
  }, [votes, myId]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!room?.timer_started_at || !room.timer_duration_sec) return;
    const updateTimer = () => {
      const elapsed = Math.floor((Date.now() - new Date(room.timer_started_at!).getTime()) / 1000);
      setTimerSec(Math.max(0, room.timer_duration_sec - elapsed));
    };
    updateTimer();
    timerRef.current = setInterval(updateTimer, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [room?.timer_started_at, room?.timer_duration_sec]);

  const gamePlayers = useMemo(() => players.filter(p => p.role === 'player' && !p.is_host), [players]);
  const currentRoundInfo = room?.current_round ? ROUNDS[room.current_round - 1] : null;
  const sortedByPoints = useMemo(() => [...gamePlayers].sort((a, b) => b.total_points - a.total_points), [gamePlayers]);

  const votingAnswers = useMemo(() => {
    const arr = [...answers];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers.length, room?.voting_phase]);

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

  const handleVote = useCallback(async (votedForId: string) => {
    if (!room || !myId || voted) return;
    await submitCreativachVote(room.id, room.current_round, myId, votedForId, 'spectator');
    setVoted(true);
  }, [room, myId, voted]);

  if (!room) {
    return (
      <div className="min-h-screen bg-purple-900 flex items-center justify-center">
        <div className="cartoon-panel p-8 text-center">
          <p className="text-xl font-black text-black">Загрузка...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-purple-900 text-white overflow-hidden relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="spectator-sunrays" />
      </div>

      {/* Header */}
      <div className="relative z-20 bg-black/30 backdrop-blur-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-black drop-shadow-[2px_2px_0_#000]">Креативач</h1>
          <span className="bg-purple-500/50 px-2 py-0.5 rounded-full text-xs font-bold">👀 Зритель</span>
        </div>
        <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs font-bold">#{code}</span>
      </div>

      <div className="relative z-10 max-w-lg mx-auto px-4 py-6 space-y-4">

        {/* LOBBY */}
        {room.status === 'lobby' && (
          <div className="cartoon-panel p-6 text-center space-y-4 animate-[fadeIn_0.3s_ease]">
            <h2 className="text-2xl font-black text-black">⏳ Ожидание</h2>
            <p className="text-gray-700 font-medium">Игра скоро начнётся! Вы сможете голосовать.</p>
            <p className="text-sm text-gray-500">Игроков: {gamePlayers.length}</p>
          </div>
        )}

        {/* RULES */}
        {(room.status === 'round_rules' || room.status === 'final_rules') && currentRoundInfo && (
          <div className="cartoon-panel p-6 text-center space-y-4 animate-[fadeIn_0.3s_ease]">
            <div className="bg-purple-600 text-white px-4 py-2 rounded-xl inline-block border-2 border-black shadow-[2px_2px_0_#000]">
              <span className="font-black text-lg">Раунд {currentRoundInfo.number}</span>
            </div>
            <h2 className="text-2xl font-black text-black">{currentRoundInfo.title}</h2>
            <p className="text-gray-700 font-medium text-sm">{currentRoundInfo.description}</p>
            <p className="text-sm text-purple-500 animate-pulse">Сейчас игроки будут отвечать...</p>
          </div>
        )}

        {/* ANSWERING — spectator waits */}
        {(room.status === 'round_playing' || room.status === 'final_playing') && room.voting_phase === 'answering' && (
          <div className="cartoon-panel p-6 text-center space-y-4 animate-[fadeIn_0.3s_ease]">
            <h2 className="text-xl font-black text-black">✍️ Игроки пишут ответы</h2>
            <TimerBar seconds={timerSec} total={ANSWER_TIME_SEC} />
            <p className="text-sm text-gray-600">{timerSec} сек. | Ответов: {answers.length}/{gamePlayers.length}</p>
            <p className="text-sm text-purple-500">Скоро вы сможете проголосовать!</p>
          </div>
        )}

        {/* VOTING */}
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
                    className="w-full cartoon-panel p-4 text-left hover:!bg-purple-50 hover:!border-purple-500 transition-all active:scale-95 animate-[fadeIn_0.3s_ease]"
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
              </div>
            )}
          </div>
        )}

        {/* RESULTS */}
        {(room.status === 'round_results' || room.status === 'final_results') && room.voting_phase === 'results' && (
          <div className="space-y-4 animate-[fadeIn_0.4s_ease]">
            <div className="cartoon-panel p-4 text-center">
              <h2 className="text-xl font-black text-black">
                {room.status === 'final_results' ? '🏆 Финал!' : '📊 Результаты'}
              </h2>
            </div>

            <div className="space-y-2">
              {answersWithVotes.map((a, i) => (
                <div key={a.id} className={`cartoon-panel p-3 flex items-center gap-3 ${i === 0 ? '!border-yellow-500 !bg-yellow-50' : ''}`}>
                  <span className="font-black text-lg w-6 text-center">{i === 0 ? '👑' : `${i + 1}`}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-500">{a.player?.name}</p>
                    <p className="text-sm font-bold text-black truncate">{a.answer_text}</p>
                  </div>
                  <span className="font-black text-purple-600">{a.voteCount}❤️</span>
                </div>
              ))}
            </div>

            <div className="cartoon-panel p-4 space-y-2">
              <h3 className="text-lg font-black text-black text-center">🏅 Рейтинг</h3>
              {sortedByPoints.map((p, i) => (
                <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg">
                  <span className="font-black w-6 text-center text-sm">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                  </span>
                  <img src={`/audio/sound/Jokester/ava/${p.avatar}`} alt={p.name} className="w-8 h-8 rounded-lg border-2 border-black" />
                  <span className="font-bold text-black text-sm flex-1 truncate">{p.name}</span>
                  <span className="font-black text-purple-600">{p.total_points}</span>
                </div>
              ))}
            </div>

            {room.status === 'final_results' && (
              <div className="flex gap-3">
                <a href="https://donatty.com/aleksandri" target="_blank" rel="noopener noreferrer" className="flex-1 py-3 text-base font-black cartoon-button-purple text-center">
                  💖 Поддержать
                </a>
                <button onClick={() => { creativachStorage.clear(); router.push('/creativach'); }} className="flex-1 py-3 text-base font-black cartoon-button">
                  🚪 Выйти
                </button>
              </div>
            )}
          </div>
        )}

        {/* CREDITS */}
        {room.status === 'credits' && (
          <div className="cartoon-panel p-6 text-center space-y-4 animate-[fadeIn_0.3s_ease]">
            <h2 className="text-2xl font-black text-black">🎬 Титры</h2>
            <p className="text-gray-700 font-medium">Смотрите на экран ведущего!</p>
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

        {/* FINISHED */}
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
        .spectator-sunrays {
          position: absolute; inset: -100%;
          background: repeating-conic-gradient(from 0deg, #581c87 0deg 15deg, #4a1772 15deg 30deg);
          animation: spin 120s linear infinite; z-index: 0;
        }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
