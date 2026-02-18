// app/jokester/room/[code]/page.tsx
// Экран игрока «Пошути-кач»
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  fetchJokesterRoom,
  fetchJokesterPlayers,
  fetchJokesterDuels,
  fetchDuelAnswers,
  fetchCategoryVotes,
  subscribeJokesterRoom,
  subscribeJokesterPlayers,
  subscribeJokesterDuels,
  subscribeJokesterCategoryVotes,
  submitCategoryVote,
  submitAnswer,
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
import { ANSWER_TIME_SEC, VOTE_TIME_SEC, roundMultiplier } from '@/lib/jokester/types';

/* ════════════════════════════════════════════════════ */
export default function JokesterPlayerPage() {
  const params = useParams();
  const roomCode = params.code as string;

  const [room, setRoom] = useState<JokesterRoom | null>(null);
  const [players, setPlayers] = useState<JokesterPlayer[]>([]);
  const [duels, setDuels] = useState<JokesterDuel[]>([]);
  const [currentAnswers, setCurrentAnswers] = useState<JokesterAnswer[]>([]);
  const [categoryVotes, setCategoryVotes] = useState<JokesterCategoryVote[]>([]);
  const [categories, setCategories] = useState<JokesterCategory[]>([]);
  const [timer, setTimer] = useState(0);
  const [answer1, setAnswer1] = useState('');
  const [answer2, setAnswer2] = useState('');
  const [submitted1, setSubmitted1] = useState(false);
  const [submitted2, setSubmitted2] = useState(false);
  const [myVote, setMyVote] = useState<string | null>(null);
  const [myCatVotes, setMyCatVotes] = useState<Set<string>>(new Set());
  const [showCategoryScroll, setShowCategoryScroll] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');

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
        // Reset answers for new duel
        setAnswer1('');
        setAnswer2('');
        setSubmitted1(false);
        setSubmitted2(false);
        setMyVote(null);
      }),
    ];
    return () => unsubs.forEach(fn => fn());
  }, [room?.id]);

  /* ─── Category votes subscription ─── */
  useEffect(() => {
    if (!room || room.status !== 'category_vote') return;
    const unsub = subscribeJokesterCategoryVotes(room.id, room.current_round, setCategoryVotes);
    return unsub;
  }, [room?.id, room?.status, room?.current_round]);

  /* ─── Timer sync ─── */
  useEffect(() => {
    if (!room?.timer_started_at || !room.timer_duration_sec) return;
    const started = new Date(room.timer_started_at).getTime();
    const duration = room.timer_duration_sec * 1000;

    if (timerRef.current) clearInterval(timerRef.current);

    const tick = () => {
      const elapsed = Date.now() - started;
      const remaining = Math.max(0, Math.ceil((duration - elapsed) / 1000));
      setTimer(remaining);
      if (remaining <= 0 && timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    tick();
    timerRef.current = setInterval(tick, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [room?.timer_started_at, room?.timer_duration_sec]);

  /* ─── Computed ─── */
  const me = players.find(p => p.id === myId);
  const gamePlayers = players.filter(p => p.role === 'player');
  const sortedByPoints = [...gamePlayers].sort((a, b) => b.total_points - a.total_points);
  const myRank = sortedByPoints.findIndex(p => p.id === myId) + 1;
  const currentDuel = duels.find(d => d.duel_index === room?.current_duel_index && d.round === room?.current_round);
  const amInDuel = currentDuel && (currentDuel.player1_id === myId || currentDuel.player2_id === myId);

  /* ─── Category vote handler ─── */
  const handleCategoryVote = async (catId: string) => {
    if (!room || myCatVotes.has(catId)) return;
    const maxVotes = gamePlayers.length;
    if (myCatVotes.size >= maxVotes) return;
    setMyCatVotes(prev => new Set(prev).add(catId));
    await submitCategoryVote(room.id, room.current_round, myId, catId);
  };

  /* ─── Answer submit ─── */
  const handleSubmitAnswer = async (qIndex: number) => {
    if (!currentDuel) return;
    const text = qIndex === 0 ? answer1 : answer2;
    if (!text.trim()) return;
    await submitAnswer(currentDuel.id, myId, qIndex, text.trim());
    if (qIndex === 0) setSubmitted1(true);
    else setSubmitted2(true);
  };

  /* ─── Vote handler ─── */
  const handleVote = async (votedForId: string) => {
    if (!currentDuel || myVote) return;
    setMyVote(votedForId);
    await submitDuelVote(currentDuel.id, myId, room?.current_question || 0, votedForId, me?.role || 'player');
  };

  /* ─── Category scroll animation ─── */
  useEffect(() => {
    if (room?.status === 'round_playing' && room.voting_phase === 'answering' && currentDuel && amInDuel) {
      // Показать анимацию скрола категорий
      setShowCategoryScroll(true);
      const cat = room.current_question === 0 ? currentDuel.question1_cat : currentDuel.question2_cat;
      setSelectedCategory(cat || '');
      const t = setTimeout(() => setShowCategoryScroll(false), 3000);
      return () => clearTimeout(t);
    }
  }, [room?.status, room?.voting_phase, room?.current_duel_index, room?.current_question]);

  /* ═══════════════════ Render ═══════════════════ */

  if (!room || !me) {
    return (
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center">
        <p className="text-white animate-pulse text-lg">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a1628] text-white">
      {/* Header */}
      <header className="bg-[#0d1a30] border-b border-[#ffd700]/20 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">
            {['😎','🤠','🧐','🤡','👻','🦊','🐸','🦄','🎃','🤖','👽','🐧'][me.seat % 12]}
          </span>
          <span className="font-bold text-sm">{me.name}</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-[#ffd700] font-black">{me.total_points} pts</span>
          {myRank > 0 && <span className="text-gray-400">#{myRank}</span>}
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">

        {/* ═══ LOBBY ═══ */}
        {room.status === 'lobby' && (
          <div className="text-center space-y-6 animate-[fadeIn_0.5s_ease]">
            <div className="text-6xl animate-[bounce_2s_infinite]">🎭</div>
            <h2 className="text-2xl font-black text-[#ffd700]">Ожидание игроков...</h2>
            <p className="text-gray-400">Код комнаты: <span className="text-white font-mono font-bold">{roomCode}</span></p>
            <div className="grid grid-cols-4 gap-2">
              {gamePlayers.map(p => (
                <div key={p.id} className={`bg-[#111d33] rounded-xl p-2 text-center ${p.id === myId ? 'border-2 border-[#ffd700]' : ''}`}>
                  <div className="text-xl">{['😎','🤠','🧐','🤡','👻','🦊','🐸','🦄','🎃','🤖','👽','🐧'][p.seat % 12]}</div>
                  <p className="text-xs truncate">{p.name}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ STARTING ═══ */}
        {room.status === 'starting' && (
          <div className="text-center space-y-6 animate-[fadeIn_0.5s_ease]">
            <div className="text-7xl animate-[bounce_1s_infinite]">🎬</div>
            <h2 className="text-3xl font-black text-[#ffd700]">Игра начинается!</h2>
            <p className="text-gray-400 animate-pulse">Приготовься шутить...</p>
          </div>
        )}

        {/* ═══ CATEGORY VOTE ═══ */}
        {room.status === 'category_vote' && (
          <div className="space-y-4 animate-[fadeIn_0.5s_ease]">
            <h2 className="text-xl font-black text-[#ffd700] text-center">Выбери категории</h2>
            <p className="text-center text-sm text-gray-400">
              Можно выбрать до {gamePlayers.length} категорий
              ({myCatVotes.size}/{gamePlayers.length})
            </p>
            <div className="grid grid-cols-2 gap-3">
              {categories.map(cat => {
                const voted = myCatVotes.has(cat.id);
                return (
                  <button
                    key={cat.id}
                    onClick={() => handleCategoryVote(cat.id)}
                    disabled={voted || myCatVotes.size >= gamePlayers.length}
                    className={`rounded-2xl border-2 p-3 text-left transition-all active:scale-95 ${
                      voted
                        ? 'bg-[#ffd700]/20 border-[#ffd700] text-[#ffd700]'
                        : 'bg-[#111d33] border-gray-700 hover:border-[#ffd700]/50'
                    } disabled:opacity-50`}
                  >
                    <span className="text-2xl block mb-1">{cat.emoji}</span>
                    <span className="text-sm font-bold">{cat.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ ROUND RULES ═══ */}
        {(room.status === 'round_rules' || room.status === 'final_rules') && (
          <div className="text-center space-y-6 animate-[fadeIn_0.5s_ease]">
            <div className="text-6xl animate-[bounce_2s_infinite]">
              {room.current_round <= 3 ? `${room.current_round}️⃣` : '🏆'}
            </div>
            <h2 className="text-3xl font-black text-[#ffd700]">
              {room.status === 'final_rules' ? 'ФИНАЛ' : `Раунд ${room.current_round}`}
            </h2>
            {room.current_round > 1 && (
              <p className="text-xl text-[#ffd700] font-bold">Множитель: ×{roundMultiplier(room.current_round)}</p>
            )}
            <p className="text-gray-400">Ожидайте начала...</p>
          </div>
        )}

        {/* ═══ ROUND PLAYING — ANSWERING ═══ */}
        {(room.status === 'round_playing' || room.status === 'final_playing') && room.voting_phase === 'answering' && (
          <div className="space-y-5 animate-[fadeIn_0.5s_ease]">
            {/* Category scroll animation */}
            {showCategoryScroll && (
              <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-[fadeIn_0.3s_ease]">
                <div className="text-center space-y-4">
                  <div className="overflow-hidden h-16 relative">
                    <div className="animate-[categoryScroll_2.5s_ease-out_forwards] space-y-2 text-xl text-gray-400">
                      {categories.map(c => (
                        <div
                          key={c.id}
                          className={`py-1 ${c.id === selectedCategory ? 'text-[#ffd700] text-3xl font-black' : ''}`}
                        >
                          {c.emoji} {c.name}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Timer */}
            <PlayerTimerBar seconds={timer} total={ANSWER_TIME_SEC} />

            {amInDuel && currentDuel ? (
              <>
                {/* Question 1 */}
                {!submitted1 && (
                  <div className="bg-[#111d33] border-2 border-[#1f6ac6]/50 rounded-2xl p-4 space-y-3">
                    <p className="text-xs text-[#ffd700] tracking-wider">
                      {currentDuel.question1_cat?.toUpperCase()} · вопрос 1
                    </p>
                    <p className="text-lg font-bold">{currentDuel.question1_text}</p>
                    <textarea
                      placeholder="Твой смешной ответ..."
                      value={answer1}
                      onChange={e => setAnswer1(e.target.value)}
                      maxLength={200}
                      rows={3}
                      className="w-full px-3 py-2 rounded-xl bg-[#0d1a30] border border-gray-600 text-white placeholder-gray-500 focus:border-[#ffd700] focus:outline-none resize-none"
                    />
                    <button
                      onClick={() => handleSubmitAnswer(0)}
                      disabled={!answer1.trim()}
                      className="w-full py-3 rounded-xl font-bold bg-[#1f6ac6] text-white hover:bg-[#2a7ad6] active:scale-95 transition disabled:opacity-40"
                    >
                      ✅ Отправить ответ 1
                    </button>
                  </div>
                )}
                {submitted1 && !submitted2 && (
                  <div className="bg-[#111d33] border-2 border-[#ffd700]/50 rounded-2xl p-4 space-y-3">
                    <p className="text-xs text-[#ffd700] tracking-wider">
                      {currentDuel.question2_cat?.toUpperCase()} · вопрос 2
                    </p>
                    <p className="text-lg font-bold">{currentDuel.question2_text}</p>
                    <textarea
                      placeholder="Твой смешной ответ..."
                      value={answer2}
                      onChange={e => setAnswer2(e.target.value)}
                      maxLength={200}
                      rows={3}
                      className="w-full px-3 py-2 rounded-xl bg-[#0d1a30] border border-gray-600 text-white placeholder-gray-500 focus:border-[#ffd700] focus:outline-none resize-none"
                    />
                    <button
                      onClick={() => handleSubmitAnswer(1)}
                      disabled={!answer2.trim()}
                      className="w-full py-3 rounded-xl font-bold bg-[#ffd700] text-[#0a1628] hover:bg-[#ffe44d] active:scale-95 transition disabled:opacity-40"
                    >
                      ✅ Отправить ответ 2
                    </button>
                  </div>
                )}
                {submitted1 && submitted2 && (
                  <div className="text-center py-12 space-y-4">
                    <div className="text-5xl">✅</div>
                    <p className="text-xl font-bold text-[#ffd700]">Ответы отправлены!</p>
                    <p className="text-gray-400">Ждём других игроков...</p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12 space-y-4">
                <div className="text-5xl animate-[bounce_2s_infinite]">⏳</div>
                <p className="text-lg text-gray-400">Дуэль идёт... Скоро голосование!</p>
              </div>
            )}
          </div>
        )}

        {/* ═══ VOTING ═══ */}
        {(room.status === 'round_playing' || room.status === 'final_playing') && room.voting_phase === 'voting' && (
          <div className="space-y-5 animate-[fadeIn_0.5s_ease]">
            <PlayerTimerBar seconds={timer} total={VOTE_TIME_SEC} />

            {amInDuel ? (
              <div className="text-center py-12 space-y-4">
                <div className="text-5xl">⚔️</div>
                <p className="text-xl font-bold text-[#ffd700]">Ты дуэлянт!</p>
                <p className="text-gray-400">Ждём результатов голосования...</p>
              </div>
            ) : (
              <div className="space-y-4">
                <h2 className="text-xl font-black text-center text-[#ffd700]">Голосуй!</h2>
                <p className="text-center text-sm text-gray-400">Чей ответ смешнее?</p>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => currentDuel && handleVote(currentDuel.player1_id)}
                    disabled={!!myVote}
                    className={`rounded-2xl border-3 p-5 text-center transition-all active:scale-95 ${
                      myVote === currentDuel?.player1_id
                        ? 'bg-[#1f6ac6]/30 border-[#1f6ac6] scale-105'
                        : myVote ? 'opacity-40' : 'bg-[#111d33] border-[#1f6ac6] hover:bg-[#1f6ac6]/20'
                    }`}
                  >
                    <p className="text-3xl mb-2">🔵</p>
                    <p className="font-bold">Дуэлянт 1</p>
                  </button>
                  <button
                    onClick={() => currentDuel && handleVote(currentDuel.player2_id)}
                    disabled={!!myVote}
                    className={`rounded-2xl border-3 p-5 text-center transition-all active:scale-95 ${
                      myVote === currentDuel?.player2_id
                        ? 'bg-red-600/30 border-red-600 scale-105'
                        : myVote ? 'opacity-40' : 'bg-[#111d33] border-red-600 hover:bg-red-600/20'
                    }`}
                  >
                    <p className="text-3xl mb-2">🔴</p>
                    <p className="font-bold">Дуэлянт 2</p>
                  </button>
                </div>
                {myVote && (
                  <p className="text-center text-[#ffd700] font-bold animate-[fadeIn_0.3s_ease]">
                    ✅ Голос принят!
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══ VOTE RESULTS ═══ */}
        {(room.status === 'round_playing' || room.status === 'final_playing') && room.voting_phase === 'results' && (
          <div className="text-center py-12 space-y-4 animate-[fadeIn_0.5s_ease]">
            <div className="text-5xl">📊</div>
            <p className="text-xl font-bold text-[#ffd700]">Результаты голосования</p>
            <p className="text-gray-400">Смотри на экран ведущего!</p>
          </div>
        )}

        {/* ═══ ROUND RESULTS ═══ */}
        {(room.status === 'round_results' || room.status === 'final_results') && (
          <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            {/* My stats */}
            {me && (
              <div className="bg-[#111d33] border-2 border-[#ffd700]/50 rounded-3xl p-6 text-center space-y-3">
                <div className="text-4xl">
                  {['😎','🤠','🧐','🤡','👻','🦊','🐸','🦄','🎃','🤖','👽','🐧'][me.seat % 12]}
                </div>
                <p className="text-2xl font-black text-[#ffd700]">{me.total_points} очков</p>
                <p className="text-lg text-white">Место: #{myRank}</p>
                <div className="flex justify-center gap-6 text-sm text-gray-400">
                  <span>👥 {me.player_votes} от игроков</span>
                  <span>👀 {me.spectator_votes} от зрителей</span>
                </div>
              </div>
            )}

            {/* Leaderboard */}
            <div className="space-y-2">
              {sortedByPoints.filter(p => !p.is_host).map((p, i) => (
                <div
                  key={p.id}
                  className={`bg-[#111d33] rounded-xl p-3 flex items-center gap-3 ${
                    p.id === myId ? 'border-2 border-[#ffd700]' : ''
                  }`}
                >
                  <span className="text-lg font-bold w-6 text-center">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                  </span>
                  <span className="text-xl">{['😎','🤠','🧐','🤡','👻','🦊','🐸','🦄','🎃','🤖','👽','🐧'][p.seat % 12]}</span>
                  <span className="flex-1 font-bold text-sm truncate">{p.name}</span>
                  <span className="font-black text-[#ffd700]">{p.total_points}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ CREDITS ═══ */}
        {room.status === 'credits' && (
          <div className="text-center py-12 space-y-6 animate-[fadeIn_0.5s_ease]">
            <div className="text-6xl">🎬</div>
            <p className="text-2xl font-black text-[#ffd700]">Спасибо за игру!</p>
            <p className="text-gray-400">Смотри титры на экране ведущего</p>
            {me && (
              <div>
                <p className="text-xl text-white">{me.name}</p>
                <p className="text-lg text-[#ffd700]">{me.total_points} очков · #{myRank} место</p>
              </div>
            )}
          </div>
        )}

        {/* ═══ FINISHED ═══ */}
        {room.status === 'finished' && (
          <div className="text-center py-12 space-y-6 animate-[fadeIn_0.5s_ease]">
            <div className="text-6xl">🎉</div>
            <p className="text-2xl font-black text-[#ffd700]">Игра окончена!</p>
            {me && <p className="text-lg text-white">{me.total_points} очков · #{myRank} место</p>}
          </div>
        )}

      </div>

      <style jsx>{`
        @keyframes categoryScroll {
          0% { transform: translateY(0); }
          80% { transform: translateY(calc(-100% + 3rem)); }
          100% { transform: translateY(calc(-100% + 3rem)); }
        }
      `}</style>
    </div>
  );
}

/* ─── Sub-components ─── */

function PlayerTimerBar({ seconds, total }: { seconds: number; total: number }) {
  const pct = total > 0 ? (seconds / total) * 100 : 0;
  const color = pct > 50 ? '#ffd700' : pct > 25 ? '#f97316' : '#ef4444';

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-bold" style={{ color }}>{seconds}с</span>
        <span className="text-gray-500">{total}с</span>
      </div>
      <div className="h-3 bg-[#1a2940] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
