// app/jokester/spectator/[code]/page.tsx
// Экран зрителя «Пошути-кач»
'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  fetchJokesterRoom,
  fetchJokesterPlayers,
  fetchJokesterDuels,
  fetchDuelAnswers,
  fetchDuelVotes,
  subscribeJokesterRoom,
  subscribeJokesterPlayers,
  subscribeJokesterDuels,
  subscribeJokesterAnswers,
  subscribeJokesterCategoryVotes,
  submitCategoryVote,
  submitDuelVote,
  jokesterStorage,
} from '@/lib/jokester/api';
import type {
  JokesterRoom,
  JokesterPlayer,
  JokesterDuel,
  JokesterAnswer,
  JokesterCategoryVote,
  JokesterQuestionPack,
  JokesterCategory,
} from '@/lib/jokester/types';
import { VOTE_TIME_SEC, ANSWER_TIME_SEC } from '@/lib/jokester/types';

function normalizeAvatarFile(value?: string | null): string {
  if (!value) return '1.png';
  const match = value.match(/^ava(\d+)\.png$/i);
  if (match) return `${match[1]}.png`;
  return value;
}

function avatarSrc(value?: string | null): string {
  return `/audio/sound/Jokester/ava/${normalizeAvatarFile(value)}`;
}

export default function JokesterSpectatorPage() {
  const params = useParams();
  const roomCode = params.code as string;

  const [room, setRoom] = useState<JokesterRoom | null>(null);
  const [players, setPlayers] = useState<JokesterPlayer[]>([]);
  const [duels, setDuels] = useState<JokesterDuel[]>([]);
  const [currentAnswers, setCurrentAnswers] = useState<JokesterAnswer[]>([]);
  const [categoryVotes, setCategoryVotes] = useState<JokesterCategoryVote[]>([]);
  const [categories, setCategories] = useState<JokesterCategory[]>([]);
  const [timer, setTimer] = useState(0);
  const [myVote, setMyVote] = useState<string | null>(null);
  const [myCatVotes, setMyCatVotes] = useState<Set<string>>(new Set());
  const [duelReveal, setDuelReveal] = useState<{ winnerName: string; winnerAnswer: string; question: string } | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const session = jokesterStorage.get();
  const myId = session.playerId;

  /* ─── Load categories ─── */
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
        setPlayers(await fetchJokesterPlayers(r.id));
        setDuels(await fetchJokesterDuels(r.id));
      }
    })();
  }, [roomCode]);

  /* ─── Realtime ─── */
  useEffect(() => {
    if (!room) return;
    const unsubs = [
      subscribeJokesterRoom(room.id, setRoom),
      subscribeJokesterPlayers(room.id, setPlayers),
      subscribeJokesterDuels(room.id, d => {
        setDuels(d);
        setMyVote(null);
        setDuelReveal(null);
      }),
    ];
    return () => unsubs.forEach(fn => fn());
  }, [room?.id]);

  /* ─── Category votes ─── */
  useEffect(() => {
    if (!room || room.status !== 'category_vote') return;
    return subscribeJokesterCategoryVotes(room.id, room.current_round, setCategoryVotes);
  }, [room?.id, room?.status, room?.current_round]);

  /* ─── Timer sync ─── */
  useEffect(() => {
    if (!room?.timer_started_at || !room.timer_duration_sec) return;
    const started = new Date(room.timer_started_at).getTime();
    const duration = room.timer_duration_sec * 1000;
    if (timerRef.current) clearInterval(timerRef.current);
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((duration - (Date.now() - started)) / 1000));
      setTimer(remaining);
      if (remaining <= 0 && timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [room?.timer_started_at, room?.timer_duration_sec]);

  /* ─── Fetch answers for current duel ─── */
  const currentDuel = duels.find(d => d.duel_index === room?.current_duel_index && d.round === room?.current_round);
  useEffect(() => {
    if (!currentDuel || room?.voting_phase !== 'voting') return;
    fetchDuelAnswers(currentDuel.id).then(setCurrentAnswers);
    const unsub = subscribeJokesterAnswers(currentDuel.id, setCurrentAnswers);
    return unsub;
  }, [currentDuel?.id, room?.voting_phase]);

  useEffect(() => {
    if (!currentDuel || room?.voting_phase !== 'results') return;
    let cancelled = false;
    (async () => {
      const [answers, votes] = await Promise.all([
        fetchDuelAnswers(currentDuel.id),
        fetchDuelVotes(currentDuel.id),
      ]);
      const p1 = votes.filter(v => v.voted_for_id === currentDuel.player1_id).length;
      const p2 = votes.filter(v => v.voted_for_id === currentDuel.player2_id).length;
      const winnerId = p1 === p2 ? null : p1 > p2 ? currentDuel.player1_id : currentDuel.player2_id;
      const winnerPlayer = players.find(p => p.id === winnerId);
      const winnerAnswer = winnerId
        ? answers.find(a => a.player_id === winnerId && !!a.answer_text?.trim())?.answer_text
          || answers.find(a => a.player_id === winnerId)?.answer_text
          || ''
        : '';
      if (!cancelled) {
        setDuelReveal({
          winnerName: winnerPlayer?.name || 'Ничья',
          winnerAnswer,
          question: currentDuel.question1_text || '',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentDuel?.id, room?.voting_phase, room?.current_round, room?.current_duel_index, players]);

  const gamePlayers = players.filter(p => p.role === 'player' && !p.is_host);
  const sortedByPoints = [...gamePlayers].sort((a, b) => b.total_points - a.total_points);
  const p1 = players.find(p => p.id === currentDuel?.player1_id);
  const p2 = players.find(p => p.id === currentDuel?.player2_id);

  const handleCategoryVote = async (catId: string) => {
    if (!room || myCatVotes.has(catId)) return;
    if (myCatVotes.size >= gamePlayers.length) return;
    setMyCatVotes(prev => new Set(prev).add(catId));
    await submitCategoryVote(room.id, room.current_round, myId, catId);
  };

  const handleVote = async (votedForId: string) => {
    if (!currentDuel || myVote) return;
    setMyVote(votedForId);
    await submitDuelVote(currentDuel.id, myId, 0, votedForId, 'spectator');
  };

  if (!room) {
    return (
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center">
        <p className="text-white animate-pulse">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a1628] text-white">
      {/* Header */}
      <header className="bg-[#0d1a30] border-b border-purple-600/30 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">👀</span>
          <span className="font-bold text-sm text-purple-400">Зритель</span>
        </div>
        <span className="text-xs text-gray-400">{roomCode} · R{room.current_round}</span>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">

        {/* ═══ LOBBY ═══ */}
        {room.status === 'lobby' && (
          <div className="text-center space-y-4 animate-[fadeIn_0.5s_ease]">
            <div className="text-5xl">👀</div>
            <h2 className="text-xl font-black text-purple-400">Зрительский зал</h2>
            <p className="text-gray-400">Ожидание начала игры...</p>
            <div className="bg-[#111d33] rounded-2xl p-4 space-y-2">
              <h3 className="text-sm font-bold text-gray-400">Рейтинг игроков</h3>
              {gamePlayers.map(p => (
                <div key={p.id} className="flex items-center gap-2 bg-[#0d1a30] rounded-lg p-2">
                  <img src={avatarSrc(p.avatar)} alt={p.name} className="w-14 h-14 rounded-full object-cover jokester-avatar-pop" />
                  <span className="text-sm font-bold">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ CATEGORY VOTE ═══ */}
        {room.status === 'category_vote' && (
          <div className="space-y-4 animate-[fadeIn_0.5s_ease]">
            <h2 className="text-lg font-black text-purple-400 text-center">Голосуй за категории!</h2>
            <p className="text-center text-xs text-gray-400">
              ({myCatVotes.size}/{gamePlayers.length})
            </p>
            <div className="grid grid-cols-2 gap-2">
              {categories.map(cat => {
                const voted = myCatVotes.has(cat.id);
                return (
                  <button
                    key={cat.id}
                    onClick={() => handleCategoryVote(cat.id)}
                    disabled={voted || myCatVotes.size >= gamePlayers.length}
                    className={`rounded-xl border-2 p-3 text-left transition-all active:scale-95 ${
                      voted
                        ? 'bg-purple-600/20 border-purple-600 text-purple-300'
                        : 'bg-[#111d33] border-gray-700 hover:border-purple-500'
                    } disabled:opacity-50`}
                  >
                    <span className="text-xl">{cat.emoji}</span>
                    <span className="text-lg font-black ml-1">{cat.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ VOTING ═══ */}
        {(room.status === 'round_playing' || room.status === 'final_playing') && room.voting_phase === 'voting' && (
          <div className="space-y-5 animate-[fadeIn_0.5s_ease]">
            <SpectatorTimerBar seconds={timer} total={VOTE_TIME_SEC} />
            <h2 className="text-lg font-black text-center text-purple-400">Голосуй за лучший ответ!</h2>

            {/* Вопрос */}
            {currentDuel && (
              <div className="bg-[#111d33] border border-gray-700 rounded-2xl p-4 text-center">
                <p className="font-bold">{currentDuel.question1_text}</p>
              </div>
            )}

            {/* Ответы */}
            <div className="grid grid-cols-1 gap-3">
              {currentDuel && (
                <>
                  <VoteButton
                    label="Дуэлянт 1"
                    avatar={p1?.avatar}
                    playerName={p1?.name}
                    answers={currentAnswers.filter(a => a.player_id === currentDuel.player1_id).map(a => a.answer_text)}
                    isSelected={myVote === currentDuel.player1_id}
                    disabled={!!myVote}
                    color="#1f6ac6"
                    onClick={() => handleVote(currentDuel.player1_id)}
                  />
                  <VoteButton
                    label="Дуэлянт 2"
                    avatar={p2?.avatar}
                    playerName={p2?.name}
                    answers={currentAnswers.filter(a => a.player_id === currentDuel.player2_id).map(a => a.answer_text)}
                    isSelected={myVote === currentDuel.player2_id}
                    disabled={!!myVote}
                    color="#f1532f"
                    onClick={() => handleVote(currentDuel.player2_id)}
                  />
                </>
              )}
            </div>
            {myVote && (
              <p className="text-center text-purple-400 font-bold animate-[fadeIn_0.3s_ease]">✅ Голос принят!</p>
            )}
          </div>
        )}

        {/* ═══ VOTE RESULTS ═══ */}
        {(room.status === 'round_playing' || room.status === 'final_playing') && room.voting_phase === 'results' && (
          <div className="text-center py-8 space-y-4 animate-[fadeIn_0.5s_ease]">
            <div className="text-5xl">🏆</div>
            <p className="text-xl font-bold text-[#ffd700]">Победитель дуэли</p>
            {duelReveal?.question && <p className="text-sm text-gray-400">{duelReveal.question}</p>}
            <p className="text-2xl font-black text-white">{duelReveal?.winnerName || 'Ничья'}</p>
            {duelReveal?.winnerAnswer && (
              <div className="bg-[#111d33] border border-[#ffd700]/40 rounded-2xl p-4">
                <p className="text-4xl font-black jokester-answer-font">« {duelReveal.winnerAnswer} »</p>
              </div>
            )}
          </div>
        )}

        {/* ═══ ANSWERING (spectator waits) ═══ */}
        {(room.status === 'round_playing' || room.status === 'final_playing') && room.voting_phase === 'answering' && (
          <div className="text-center py-12 space-y-4 animate-[fadeIn_0.5s_ease]">
            <SpectatorTimerBar seconds={timer} total={ANSWER_TIME_SEC} />
            <div className="text-5xl animate-[bounce_2s_infinite]">⏳</div>
            <p className="text-lg text-gray-400">Дуэлянты отвечают на вопросы...</p>
            <p className="text-sm text-gray-500">Скоро голосование!</p>
          </div>
        )}

        {/* ═══ RESULTS ═══ */}
        {(room.status === 'round_results' || room.status === 'final_results') && (
          <div className="space-y-4 animate-[fadeIn_0.5s_ease]">
            <h2 className="text-lg font-black text-center text-purple-400">
              {room.status === 'final_results' ? '🏆 Итоги финала' : `Итоги раунда ${room.current_round}`}
            </h2>
            <div className="space-y-2">
              {sortedByPoints.filter(p => !p.is_host).map((p, i) => (
                <div key={p.id} className="bg-[#111d33] rounded-xl p-3 flex items-center gap-3">
                  <span className="text-lg font-bold w-6 text-center">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                  </span>
                  <img src={avatarSrc(p.avatar)} alt={p.name} className="w-16 h-16 rounded-full object-cover jokester-avatar-pop" />
                  <span className="flex-1 font-bold text-sm">{p.name}</span>
                  <div className="text-right">
                    <span className="font-black text-[#ffd700] jokester-score-font">{p.total_points}</span>
                    <p className="text-xs text-gray-500">👥{p.player_votes} 👀{p.spectator_votes}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ CREDITS ═══ */}
        {room.status === 'credits' && (
          <div className="text-center py-12 space-y-4 animate-[fadeIn_0.5s_ease]">
            <div className="text-5xl">🎬</div>
            <p className="text-xl font-black text-purple-400">Титры</p>
            <p className="text-gray-400">Смотрите на экран ведущего!</p>
          </div>
        )}

        {room.status === 'finished' && (
          <div className="text-center py-12 space-y-4">
            <div className="text-5xl">🎉</div>
            <p className="text-xl font-black text-purple-400">Игра окончена!</p>
          </div>
        )}

        {/* Various states fallback */}
        {(room.status === 'starting' || room.status === 'round_rules' || room.status === 'final_rules') && (
          <div className="text-center py-12 space-y-4 animate-[fadeIn_0.5s_ease]">
            <div className="text-5xl animate-[bounce_1.5s_infinite]">🎭</div>
            <p className="text-xl font-bold text-purple-400">
              {room.status === 'starting' ? 'Игра начинается!' :
               room.status === 'final_rules' ? 'ФИНАЛ!' :
               `Раунд ${room.current_round}`}
            </p>
            <p className="text-gray-400">Следите за экраном ведущего...</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function SpectatorTimerBar({ seconds, total }: { seconds: number; total: number }) {
  const pct = total > 0 ? (seconds / total) * 100 : 0;
  const color = pct > 50 ? '#a855f7' : pct > 25 ? '#f97316' : '#ef4444';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span style={{ color }} className="font-bold">{seconds}с</span>
        <span className="text-gray-500">{total}с</span>
      </div>
      <div className="h-2 bg-[#1a2940] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function VoteButton({
  label,
  avatar,
  playerName,
  answers,
  isSelected,
  disabled,
  color,
  onClick,
}: {
  label: string;
  avatar?: string | null;
  playerName?: string;
  answers: string[];
  isSelected: boolean;
  disabled: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-2xl border-2 p-4 text-left transition-all active:scale-95 ${
        isSelected
          ? 'scale-[1.02] shadow-lg'
          : disabled ? 'opacity-40' : 'hover:scale-[1.01]'
      }`}
      style={{
        borderColor: color,
        backgroundColor: isSelected ? `${color}22` : '#111d33',
      }}
    >
      <div className="flex items-center gap-3 mb-2">
        {avatar && (
          <img src={avatarSrc(avatar)} alt={playerName || label} className="w-16 h-16 rounded-full object-cover jokester-avatar-pop" />
        )}
        <p className="text-xs font-bold" style={{ color }}>{label}</p>
      </div>
      {answers.length > 0 ? (
        answers.map((a, idx) => (
          <p key={`${label}-${idx}`} className="text-4xl font-bold text-white jokester-answer-font">« {a} »</p>
        ))
      ) : (
        <p className="text-4xl font-bold text-white jokester-answer-font">...</p>
      )}
    </button>
  );
}
