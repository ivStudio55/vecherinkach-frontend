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
  fetchDuelVotes,
  fetchCategoryVotes,
  subscribeJokesterRoom,
  subscribeJokesterPlayers,
  subscribeJokesterDuels,
  subscribeJokesterAnswers,
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

function normalizeAvatarFile(value?: string | null): string {
  if (!value) return '1.png';
  const match = value.match(/^ava(\d+)\.png$/i);
  if (match) return `${match[1]}.png`;
  return value;
}

function avatarSrc(value?: string | null): string {
  return `/audio/sound/Jokester/ava/${normalizeAvatarFile(value)}`;
}

function categoryLabel(categoryId?: string | null, categories: JokesterCategory[] = []): string {
  if (!categoryId) return 'Категория';
  const found = categories.find(c => c.id === categoryId || c.name === categoryId);
  return found?.name || categoryId;
}

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
  const [duelAnswers, setDuelAnswers] = useState<JokesterAnswer[]>([]);
  const [myRoundAnswers, setMyRoundAnswers] = useState<JokesterAnswer[]>([]);
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
      subscribeJokesterDuels(room.id, async d => {
        setDuels(d);
        // Reset answers for new duel
        setAnswer1('');
        setAnswer2('');
        setSubmitted1(false);
        setSubmitted2(false);
        setMyVote(null);
        setDuelAnswers([]);
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
  const gamePlayers = players.filter(p => p.role === 'player' && !p.is_host);
  const sortedByPoints = [...gamePlayers].sort((a, b) => b.total_points - a.total_points);
  const myRank = sortedByPoints.findIndex(p => p.id === myId) + 1;
  const currentDuel = duels.find(d => d.duel_index === room?.current_duel_index && d.round === room?.current_round);
  const amInDuel = currentDuel && (currentDuel.player1_id === myId || currentDuel.player2_id === myId);
  const myRoundDuels = duels
    .filter(d => d.round === room?.current_round && (d.player1_id === myId || d.player2_id === myId))
    .sort((a, b) => a.duel_index - b.duel_index);

  const pendingTargets = myRoundDuels.flatMap(d => {
    const t: Array<{ duel: JokesterDuel; qIndex: 0; text: string; cat: string | null }> = [];
    const hasQ1 = myRoundAnswers.some(a => a.duel_id === d.id && a.player_id === myId && a.question_index === 0);
    if (!hasQ1 && d.question1_text?.trim()) t.push({ duel: d, qIndex: 0, text: d.question1_text.trim(), cat: d.question1_cat });
    return t;
  });
  const currentTarget = pendingTargets[0] || null;

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
    if (!currentTarget) return;
    const text = answer1;
    if (!text.trim()) return;
    await submitAnswer(currentTarget.duel.id, myId, qIndex, text.trim());
    const updated = await fetchDuelAnswers(currentTarget.duel.id);
    const others = myRoundAnswers.filter(a => a.duel_id !== currentTarget.duel.id);
    setMyRoundAnswers([...others, ...updated]);
    setSubmitted1(true);
    setAnswer1('');
  };

  useEffect(() => {
    if (!room || room.voting_phase !== 'answering') return;
    let cancelled = false;
    (async () => {
      const answers = await Promise.all(myRoundDuels.map(d => fetchDuelAnswers(d.id)));
      if (!cancelled) setMyRoundAnswers(answers.flat());
    })();
    return () => {
      cancelled = true;
    };
  }, [room?.id, room?.current_round, room?.voting_phase, myRoundDuels.length]);

  /* ─── Live answers subscription during voting ─── */
  useEffect(() => {
    if (!currentDuel || room?.voting_phase !== 'voting') return;
    // Initial fetch
    fetchDuelAnswers(currentDuel.id).then(setDuelAnswers);
    // Subscribe for live updates
    const unsub = subscribeJokesterAnswers(currentDuel.id, setDuelAnswers);
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

  /* ─── Vote handler ─── */
  const handleVote = async (votedForId: string) => {
    if (!currentDuel || myVote) return;
    setMyVote(votedForId);
    await submitDuelVote(currentDuel.id, myId, 0, votedForId, me?.role || 'player');
  };

  /* ─── Category scroll animation ─── */
  useEffect(() => {
    if ((room?.status === 'round_playing' || room?.status === 'final_playing') && room.voting_phase === 'answering' && currentTarget) {
      // Показать анимацию скрола категорий
      setShowCategoryScroll(true);
      const cat = currentTarget.cat;
      setSelectedCategory(cat || '');
      const t = setTimeout(() => setShowCategoryScroll(false), 3000);
      return () => clearTimeout(t);
    }
  }, [room?.status, room?.voting_phase, room?.current_duel_index, currentTarget?.duel.id, currentTarget?.qIndex]);

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
          <img src={avatarSrc(me.avatar)} alt={me.name} className="w-16 h-16 rounded-full object-cover jokester-avatar-pop" />
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
                  <img src={avatarSrc(p.avatar)} alt={p.name} className="w-16 h-16 rounded-full object-cover mx-auto jokester-avatar-pop" />
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
            <div className="text-6xl animate-round-emoji-bounce">
              {room.current_round <= 3 ? `${room.current_round}️⃣` : '🏆'}
            </div>
            <h2 className="text-3xl font-black text-[#ffd700]">
              {room.status === 'final_rules' ? 'ФИНАЛ' : <span className="jokester-answer-font">Раунд {room.current_round}</span>}
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
                <div className="bg-[#111d33] border-2 border-[#ffd700]/50 rounded-3xl p-6 text-center max-w-md w-[90%] animate-[categoryReveal_2.5s_ease-out_forwards]">
                  <p className="text-xs text-gray-400 mb-2">Категория</p>
                  <p className="text-3xl font-black text-[#ffd700]">
                    {categories.find(c => c.id === selectedCategory)?.emoji}{' '}
                    {categories.find(c => c.id === selectedCategory)?.name || 'Неизвестно'}
                  </p>
                  {currentTarget?.text && (
                    <p className="text-sm text-gray-300 mt-3">{currentTarget.text}</p>
                  )}
                </div>
              </div>
            )}

            {/* Timer */}
            <PlayerTimerBar seconds={timer} total={ANSWER_TIME_SEC} />

            {currentTarget ? (
              <>
                <div className="bg-[#111d33] border-2 border-[#1f6ac6]/50 rounded-2xl p-4 space-y-3">
                  <p className="text-xs text-[#ffd700] tracking-wider">
                    {categoryLabel(currentTarget.cat, categories)} · дуэль {currentTarget.duel.duel_index + 1}
                  </p>
                  <p className="text-lg font-bold">{currentTarget.text}</p>
                  <textarea
                    placeholder="Твой смешной ответ..."
                    value={answer1}
                    onChange={e => setAnswer1(e.target.value)}
                    maxLength={200}
                    rows={3}
                    className="w-full px-3 py-2 rounded-xl bg-[#0d1a30] border border-gray-600 text-white placeholder-gray-500 focus:border-[#ffd700] focus:outline-none resize-none"
                  />
                  <button
                    onClick={() => handleSubmitAnswer(currentTarget.qIndex)}
                    disabled={!answer1.trim()}
                    className="w-full py-3 rounded-xl font-bold bg-[#1f6ac6] text-white hover:bg-[#2a7ad6] active:scale-95 transition disabled:opacity-40"
                  >
                    ✅ Отправить ответ
                  </button>
                  <p className="text-xs text-gray-400 text-right">Осталось ответов: {pendingTargets.length}</p>
                </div>
              </>
            ) : (
              <div className="text-center py-12 space-y-4">
                <div className="text-5xl">✅</div>
                <p className="text-lg text-[#ffd700] font-bold">Ответы отправлены!</p>
                <p className="text-gray-400">Ждём окончания таймера и начала голосования...</p>
              </div>
            )}
          </div>
        )}

        {/* ═══ VOTING ═══ */}
        {(room.status === 'round_playing' || room.status === 'final_playing') && room.voting_phase === 'voting' && (
          <VotingPanel
            currentDuel={currentDuel ?? null}
            players={players}
            myId={myId}
            amInDuel={!!amInDuel}
            myVote={myVote}
            timer={timer}
            duelAnswers={duelAnswers}
            questionText={currentDuel?.question1_text || ''}
            onVote={handleVote}
          />
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

        {/* ═══ ROUND RESULTS ═══ */}
        {(room.status === 'round_results' || room.status === 'final_results') && (
          <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            {/* My stats */}
            {me && (
              <div className="bg-[#111d33] border-2 border-[#ffd700]/50 rounded-3xl p-6 text-center space-y-3">
                <img src={avatarSrc(me.avatar)} alt={me.name} className="w-28 h-28 rounded-full object-cover mx-auto jokester-avatar-pop" />
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
                  <img src={avatarSrc(p.avatar)} alt={p.name} className="w-16 h-16 rounded-full object-cover jokester-avatar-pop" />
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
        @keyframes categoryReveal {
          0% { transform: translateY(12px) scale(0.98); opacity: 0; }
          20% { transform: translateY(0) scale(1); opacity: 1; }
          80% { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(-8px) scale(0.98); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

/* ─── Sub-components ─── */

/* ─── VotingPanel ─── */
function VotingPanel({
  currentDuel,
  players,
  myId,
  amInDuel,
  myVote,
  timer,
  duelAnswers,
  questionText,
  onVote,
}: {
  currentDuel: JokesterDuel | null;
  players: JokesterPlayer[];
  myId: string;
  amInDuel: boolean;
  myVote: string | null;
  timer: number;
  duelAnswers: JokesterAnswer[];
  questionText: string;
  onVote: (id: string) => void;
}) {
  const p1 = players.find(p => p.id === currentDuel?.player1_id);
  const p2 = players.find(p => p.id === currentDuel?.player2_id);
  const p1Answers = duelAnswers.filter(a => a.player_id === currentDuel?.player1_id);
  const p2Answers = duelAnswers.filter(a => a.player_id === currentDuel?.player2_id);

  return (
    <div className="space-y-5 animate-[fadeIn_0.5s_ease]">
      <PlayerTimerBar seconds={timer} total={VOTE_TIME_SEC} />

      {questionText && (
        <div className="bg-[#111d33] border border-[#ffd700]/40 rounded-2xl p-4 text-center">
          <p className="text-sm text-gray-400 mb-1">Вопрос дуэли</p>
          <p className="text-lg font-bold">{questionText}</p>
        </div>
      )}

      {amInDuel ? (
        <div className="text-center py-10 space-y-4">
          <div className="text-5xl">⚔️</div>
          <p className="text-xl font-bold text-[#ffd700]">Ты дуэлянт!</p>
          <p className="text-gray-400">Ждём результатов голосования...</p>
          {/* Показываем свои ответы */}
          {p1Answers.length > 0 && p1 && currentDuel && myId === currentDuel.player1_id && (
            <div className="bg-[#111d33] border border-[#1f6ac6]/40 rounded-2xl p-4 text-left space-y-2">
              <p className="text-xs text-gray-400">Твои ответы:</p>
              {p1Answers.map(a => <p key={a.id} className="text-white font-bold">« {a.answer_text} »</p>)}
            </div>
          )}
          {p2Answers.length > 0 && p2 && currentDuel && myId === currentDuel.player2_id && (
            <div className="bg-[#111d33] border border-red-600/40 rounded-2xl p-4 text-left space-y-2">
              <p className="text-xs text-gray-400">Твои ответы:</p>
              {p2Answers.map(a => <p key={a.id} className="text-white font-bold">« {a.answer_text} »</p>)}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-xl font-black text-center text-[#ffd700]">Голосуй!</h2>
          <p className="text-center text-sm text-gray-400">Чей ответ смешнее?</p>

          {/* Первый дуэлянт */}
          <button
            onClick={() => currentDuel && onVote(currentDuel.player1_id)}
            disabled={!!myVote}
            className={`w-full rounded-2xl border-2 p-4 text-left transition-all active:scale-95 ${
              myVote === currentDuel?.player1_id
                ? 'bg-[#1f6ac6]/30 border-[#1f6ac6] scale-[1.02]'
                : myVote ? 'opacity-40 border-gray-700' : 'bg-[#111d33] border-[#1f6ac6] hover:bg-[#1f6ac6]/20'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              {p1?.avatar && (
                <img src={avatarSrc(p1.avatar)} alt="" className="w-16 h-16 rounded-full object-cover jokester-avatar-pop" />
              )}
              <span className="font-bold text-[#1f6ac6]">🔵 Дуэлянт 1</span>
            </div>
            {p1Answers.length > 0 ? (
              p1Answers.map(a => (
                <p key={a.id} className="text-white text-4xl mt-1 italic jokester-answer-font">« {a.answer_text} »</p>
              ))
            ) : (
              <p className="text-gray-500 text-sm italic">Ответ ещё не подан...</p>
            )}
          </button>

          {/* Второй дуэлянт */}
          <button
            onClick={() => currentDuel && onVote(currentDuel.player2_id)}
            disabled={!!myVote}
            className={`w-full rounded-2xl border-2 p-4 text-left transition-all active:scale-95 ${
              myVote === currentDuel?.player2_id
                ? 'bg-red-600/30 border-red-600 scale-[1.02]'
                : myVote ? 'opacity-40 border-gray-700' : 'bg-[#111d33] border-red-600 hover:bg-red-600/20'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              {p2?.avatar && (
                <img src={avatarSrc(p2.avatar)} alt="" className="w-16 h-16 rounded-full object-cover jokester-avatar-pop" />
              )}
              <span className="font-bold text-red-400">🔴 Дуэлянт 2</span>
            </div>
            {p2Answers.length > 0 ? (
              p2Answers.map(a => (
                <p key={a.id} className="text-white text-4xl mt-1 italic jokester-answer-font">« {a.answer_text} »</p>
              ))
            ) : (
              <p className="text-gray-500 text-sm italic">Ответ ещё не подан...</p>
            )}
          </button>

          {myVote && (
            <p className="text-center text-[#ffd700] font-bold animate-[fadeIn_0.3s_ease]">
              ✅ Голос принят!
            </p>
          )}
        </div>
      )}
    </div>
  );
}

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
