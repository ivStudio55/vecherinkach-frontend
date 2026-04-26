// app/survivach/host/[code]/page.tsx
// Экран ведущего «Выживач»
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { QRCodeCanvas } from 'qrcode.react';
import {
  fetchRoomByCode,
  fetchPlayers,
  fetchAnswers,
  fetchBets,
  fetchActiveDuel,
  fetchPack,
  setRoomStatus,
  updatePlayer,
  updatePlayers,
  loadPackQuestions,
  loadDuelQuestions,
  subscribeRoom,
  subscribeRoomPlayers,
  subscribeRoomAnswers,
  subscribeRoomBets,
  subscribeRoomDuel,
  createDuel,
  updateDuel,
  submitAnswer,
} from '@/lib/survivach/api';
import {
  DEFAULT_CELL_MODES,
  getModeForCell,
  rankPlayers,
  getLeaderPosition,
  getLeaders,
  generateMathProblems,
  generateColorSequence,
  scramblePuzzle,
  DUCK_AVATARS,
  getAvatarUrl,
  MODE_LABELS,
  MODE_COLORS,
  BLITZ_START,
  TOTAL_CELLS,
  MEMORY_COLORS,
} from '@/lib/survivach/board';
import {
  SurvivachAudio,
  LOBBY_THEME,
  RULES_MUSIC,
  RULES_VO_POOL,
  MOVE_ANIMATION,
  TIMER_POOL,
  DUEL_POOL,
  PLAYER_ACTIONS_POOL,
  DUELISTS_ACTIONS_POOL,
  BET_WORKED_POOL,
  BET_MIX_POOL,
  BET_UNWORKED_POOL,
  DRAW_POOL,
  SUMMONED_WON_POOL,
  CALLER_WON_POOL,
  MODE_AUDIO,
  DUEL_AUDIO,
  randomFromPool,
} from '@/lib/survivach/audio';
import type {
  SurvivachRoom,
  SurvivachPlayer,
  SurvivachAnswer,
  SurvivachBet,
  SurvivachDuel,
  SurvivachPack,
  RoundMode,
  PlayerRoundResult,
  RoundResultsData,
  BetResultsData,
  MathProblem,
} from '@/lib/survivach/types';

const MIN_PLAYERS = 4;

/* ─── Scoring helpers ─── */
function calcPositionChange(isCorrect: boolean, isFirst: boolean, isZombie: boolean): number {
  if (isZombie) return 1; // zombies always +1
  if (!isCorrect) return 0;
  return isFirst ? 2 : 1;
}

function checkTextAnswer(input: string, acceptList: string[]): boolean {
  const norm = (s: string) => s.toLowerCase().trim();
  const ni = norm(input);
  return acceptList.some(a => norm(a) === ni);
}

/* ─── Board mini-view ─── */
function BoardView({ players, leaderPosition }: { players: SurvivachPlayer[]; leaderPosition: number }) {
  const cells = Array.from({ length: TOTAL_CELLS }, (_, i) => i + 1);
  const playersAtCell = (cell: number) => players.filter(p => p.position === cell);

  return (
    <div className="grid gap-1 select-none" style={{ gridTemplateColumns: 'repeat(13, 1fr)' }}>
      {cells.map(cell => {
        const mode = getModeForCell(cell);
        const here = playersAtCell(cell);
        const isLeader = cell === leaderPosition;
        return (
          <div
            key={cell}
            className={`relative rounded border text-center p-0.5 transition-all ${
              isLeader ? 'ring-2 ring-yellow-400 scale-105 z-10' : ''
            }`}
            style={{
              backgroundColor: cell >= BLITZ_START ? '#7f1d1d' : '#1e293b',
              borderColor: MODE_COLORS[mode as RoundMode] + '60',
              minHeight: 36,
            }}
          >
            <div className="text-[9px] text-gray-400 font-mono leading-none">{cell}</div>
            {cell < BLITZ_START && (
              <div className="text-[8px] leading-none"
                style={{ color: MODE_COLORS[mode as RoundMode] }}>
                {MODE_LABELS[mode as RoundMode].split(' ')[0]}
              </div>
            )}
            {cell >= BLITZ_START && (
              <div className="text-[8px] text-red-300 leading-none">⚡</div>
            )}
            <div className="flex flex-wrap justify-center gap-0.5 mt-0.5">
              {here.map(p => (
                <img
                  key={p.id}
                  src={getAvatarUrl(p.avatar, p.lives)}
                  alt={p.name}
                  title={p.name}
                  className="w-4 h-4 object-contain"
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Player card ─── */
function PlayerCard({ player, rank, showKarma = true }: {
  player: SurvivachPlayer;
  rank: number;
  showKarma?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 rounded-lg p-2 border ${
      player.is_zombie ? 'border-green-500/40 bg-green-900/20' : 'border-gray-700 bg-gray-800/60'
    }`}>
      <span className="text-gray-500 text-xs font-mono w-4">#{rank}</span>
      <img src={getAvatarUrl(player.avatar, player.lives)} alt="" className="w-8 h-8 object-contain" />
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm truncate">{player.name}</div>
        <div className="flex items-center gap-1 text-xs">
          <span>📍{player.position}</span>
          <span className="text-red-400">{'❤️'.repeat(player.lives)}{'🖤'.repeat(Math.max(0, 3 - player.lives))}</span>
        </div>
      </div>
      {showKarma && (
        <div className="text-right text-xs">
          <div className={`font-bold ${player.karma >= 3 ? 'text-yellow-300' : 'text-gray-400'}`}>
            ✨{player.karma}
          </div>
          {player.is_zombie && <div className="text-green-400 text-[10px]">🧟</div>}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════
   Main host page component
   ══════════════════════════════════════════ */

export default function SurvivachHostPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();

  /* ─── Core state ─── */
  const [room, setRoom] = useState<SurvivachRoom | null>(null);
  const [players, setPlayers] = useState<SurvivachPlayer[]>([]);
  const [answers, setAnswers] = useState<SurvivachAnswer[]>([]);
  const [bets, setBets] = useState<SurvivachBet[]>([]);
  const [duel, setDuel] = useState<SurvivachDuel | null>(null);
  const [pack, setPack] = useState<SurvivachPack | null>(null);
  const [loading, setLoading] = useState(true);

  /* ─── Round-specific state ─── */
  const [questions, setQuestions] = useState<Record<string, unknown> | null>(null);
  const [currentQ, setCurrentQ] = useState<Record<string, unknown> | null>(null);
  const [mathProblems, setMathProblems] = useState<MathProblem[]>([]);
  const [colorSequence, setColorSequence] = useState<string[]>([]);
  const [puzzleState, setPuzzleState] = useState<number[]>([]);
  const [timerLeft, setTimerLeft] = useState(0);
  const [moveTimerLeft, setMoveTimerLeft] = useState(7);
  const [usedQIds, setUsedQIds] = useState<Set<string | number>>(new Set());
  const [roundResultsData, setRoundResultsData] = useState<PlayerRoundResult[]>([]);
  const [betResultsData, setBetResultsData] = useState<BetResultsData | null>(null);
  const [duelQ, setDuelQ] = useState<Record<string, unknown> | null>(null);

  /* ─── Moving cloud messages ─── */
  const MOVE_MESSAGES = [
    '⚠️ В блице последний ответ не принимается — торопитесь!',
    '🧟 Зомби всегда двигаются вперёд на одну клетку',
    '✨ 3 правильных ответа подряд — начинается набор кармы',
    '💣 Зомби-бомба активируется только в момент передвижения!',
    '🎰 Ставка на зеро — рискни жизнью или очками кармы',
    '⚔️ 3 кармы + соседняя клетка = вызов на дуэль!',
  ];
  const [moveMessage, setMoveMessage] = useState('');

  /* ─── Audio ─── */
  const bgAudio = useRef(new SurvivachAudio());
  const fxAudio = useRef(new SurvivachAudio());

  /* ─── Timer refs ─── */
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const moveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ─── Subscriptions ─── */
  useEffect(() => {
    if (!room?.id) return;
    const round = room.current_round;
    const unsubs = [
      subscribeRoom(room.id, setRoom),
      subscribeRoomPlayers(room.id, setPlayers),
      subscribeRoomAnswers(room.id, round, setAnswers),
      subscribeRoomBets(room.id, round, setBets),
      subscribeRoomDuel(room.id, round, setDuel),
    ];
    return () => unsubs.forEach(fn => fn());
  }, [room?.id, room?.current_round]);

  /* ─── Initial load ─── */
  useEffect(() => {
    if (!code) return;
    const init = async () => {
      const r = await fetchRoomByCode(code);
      if (!r) { router.push('/ctrl-8f2q9z'); return; }
      const [p, pk] = await Promise.all([
        fetchPlayers(r.id),
        fetchPack(r.pack_id),
      ]);
      setRoom(r);
      setPlayers(p);
      setPack(pk);
      setLoading(false);

      if (r.status === 'lobby') {
        bgAudio.current.play(LOBBY_THEME, true);
      }
    };
    init();
  }, [code, router]);

  /* ─── Room status change effects ─── */
  useEffect(() => {
    if (!room) return;
    const st = room.status;

    if (st === 'moving') {
      bgAudio.current.play(MOVE_ANIMATION);
      setMoveMessage(MOVE_MESSAGES[Math.floor(Math.random() * MOVE_MESSAGES.length)]);
      setMoveTimerLeft(7);
      moveTimerRef.current = setInterval(() => {
        setMoveTimerLeft(t => {
          if (t <= 1) {
            clearInterval(moveTimerRef.current!);
            handleMoveAnimDone();
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }

    if (st === 'round_intro') {
      const mode = room.current_mode;
      if (mode && mode in MODE_AUDIO) {
        const ma = MODE_AUDIO[mode as keyof typeof MODE_AUDIO];
        const pool = room.zombie_bomb_active && 'zombie_bomb' in ma
          ? (ma as Record<string, string>).zombie_bomb
          : ma.normal;
        bgAudio.current.play(randomFromPool(pool, 3), false, () => {
          startRoundPlaying();
        });
      } else {
        startRoundPlaying();
      }
    }

    if (st === 'round_playing') {
      const dur = room.timer_duration_sec ?? 30;
      setTimerLeft(dur);
      const pool = randomFromPool(TIMER_POOL, 5);
      bgAudio.current.play(pool, true);
      timerRef.current = setInterval(() => {
        setTimerLeft(t => {
          if (t <= 1) {
            clearInterval(timerRef.current!);
            handleTimerExpired();
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }

    if (st === 'duel_intro') {
      bgAudio.current.play(randomFromPool(DUEL_POOL, 5), false, () => {
        setRoomStatus(room.id, 'duel_setup', {});
      });
    }

    if (st === 'duel_setup') {
      if (duel?.mode) {
        const pool = duel.mode === 'minesweeper'
          ? DUEL_AUDIO.minesweeper.setup
          : duel.mode === 'arithmetic_mean'
          ? DUEL_AUDIO.arithmetic_mean.crowd
          : DUEL_AUDIO.crowd_forecast.crowd;
        bgAudio.current.play(randomFromPool(pool, 3), true);
      }
    }

    if (st === 'duel_playing') {
      if (duel?.mode) {
        const pool = duel.mode === 'minesweeper'
          ? DUEL_AUDIO.minesweeper.duelists
          : duel.mode === 'arithmetic_mean'
          ? DUEL_AUDIO.arithmetic_mean.duelists
          : DUEL_AUDIO.crowd_forecast.duelists;
        bgAudio.current.play(randomFromPool(pool, 3), true);
      }
    }

    return () => {
      clearInterval(timerRef.current!);
      clearInterval(moveTimerRef.current!);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.status]);

  /* ─── Auto-advance: all non-host players answered (or all but one in Blitz) ─── */
  useEffect(() => {
    if (room?.status !== 'round_playing') return;
    const nonHostPlayers = players.filter(p => !p.is_host);
    if (nonHostPlayers.length === 0) return;
    
    // In Blitz mode, we don't wait for the last player
    const isBlitz = room.current_mode === 'blitz';
    const requiredAnswers = isBlitz ? Math.max(1, nonHostPlayers.length - 1) : nonHostPlayers.length;

    if (answers.length >= requiredAnswers) {
      clearInterval(timerRef.current!);
      handleTimerExpired();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers.length, room?.status, room?.current_mode]);

  /* ─── Auto-advance duel_setup: all non-duelists acted ─── */
  useEffect(() => {
    if (room?.status !== 'duel_setup' || !duel) return;
    if (duel.mode === 'minesweeper') {
      const dd = duel.duel_data as { mined_tiles?: Record<string, number[]> } | null;
      const nonDuelists = players.filter(
        p => !p.is_host && p.id !== duel.challenger_id && p.id !== duel.challenged_id
      );
      if (dd?.mined_tiles && Object.keys(dd.mined_tiles).length >= nonDuelists.length) {
        setRoomStatus(room.id, 'duel_playing', {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel?.duel_data, room?.status]);

  /* ─── Hot Potato logic ─── */
  useEffect(() => {
    if (room?.status === 'potato_playing') {
      const rd = room.round_results_data as any;
      if (rd?.potato_started_at && rd?.potato_duration_ms) {
        const checkExplosion = () => {
          if (Date.now() >= rd.potato_started_at + rd.potato_duration_ms) {
            handlePotatoExplosion(rd.potato_bomb_holder);
          }
        };
        const intId = setInterval(checkExplosion, 500);
        return () => clearInterval(intId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.status, room?.round_results_data]);

  const handlePotatoExplosion = async (loserId: string) => {
    if (!room) return;
    const rd = room.round_results_data as any;
    
    // Apply -1 life to the loser
    const p = players.find(x => x.id === loserId);
    if (p && !p.is_zombie) {
      const newLives = Math.max(0, p.lives - 1);
      await updatePlayers([{
        id: p.id,
        lives: newLives,
        is_zombie: newLives === 0,
      }]);
    }

    await setRoomStatus(room.id, 'potato_result', {
      round_results_data: {
        ...rd,
        potato_loser: loserId,
      }
    });
  };

  /* ══════════════════════════════════════════
     State transition handlers
     ══════════════════════════════════════════ */

  const handleStartGame = async () => {
    if (!room) return;
    bgAudio.current.stop();
    await setRoomStatus(room.id, 'rules', {});
    bgAudio.current.play(RULES_MUSIC);
    // Play VO narration; after it ends → advance to moving
    fxAudio.current.play(randomFromPool(RULES_VO_POOL, 5), false, () => {
      setRoomStatus(room.id, 'moving', {
        current_round: 1,
        leader_position: 1,
      });
    });
  };

  const handleMoveAnimDone = useCallback(async () => {
    if (!room || !pack) return;
    bgAudio.current.stop();

    const gamePlayers = await fetchPlayers(room.id);
    const leaderPos = getLeaderPosition(gamePlayers.filter(p => !p.is_host));
    const mode = getModeForCell(leaderPos, pack.cell_sequence);

    // Prepare question data based on mode
    let questionData: Record<string, unknown> = {};

    if (mode === 'umnik' || mode === 'blitz') {
      const qBank = questions ?? await loadPackQuestions(pack.base_url, mode);
      if (mode === 'umnik') {
        const list: unknown[] = (qBank as { umnik?: { questions: unknown[] } })?.umnik?.questions ?? [];
        const available = list.filter((q: unknown) => !usedQIds.has((q as { id: string }).id));
        const q = (available.length > 0 ? available : list)[Math.floor(Math.random() * (available.length || list.length))];
        if (q) {
          const typedQ = q as {
            id: string; question: string;
            options: string[]; extra_options?: string[];
            correct: number;
          };
          const opts = room.zombie_bomb_active && typedQ.extra_options
            ? [...typedQ.options, ...typedQ.extra_options]
            : typedQ.options;
          questionData = { mode: 'umnik', id: typedQ.id, question: typedQ.question, options: opts, correct: typedQ.correct };
          setUsedQIds(s => new Set(s).add(typedQ.id));
        }
      } else {
        const list = qBank as Array<{ id: number; question: string; options: string[]; correct_index: number }> ?? [];
        const available = list.filter(q => !usedQIds.has(q.id));
        const q = (available.length > 0 ? available : list)[Math.floor(Math.random() * (available.length || list.length))];
        if (q) {
          questionData = { mode: 'blitz', id: q.id, question: q.question, options: q.options, correct_index: q.correct_index };
        }
      }
    } else if (mode === 'art_historian') {
      const qBank = await loadPackQuestions(pack.base_url, mode);
      const list = (qBank as { questions: unknown[] })?.questions ?? [];
      const available = list.filter((q: unknown) => !usedQIds.has((q as { id: number }).id));
      const q = (available.length > 0 ? available : list)[Math.floor(Math.random() * (available.length || list.length))];
      if (q) {
        setUsedQIds(s => new Set(s).add((q as { id: number }).id));
        questionData = { ...(q as Record<string, unknown>), mode: 'art_historian' };
      }
    } else if (mode === 'interpreter') {
      const qBank = await loadPackQuestions(pack.base_url, mode);
      const list = (qBank as { questions: unknown[] })?.questions ?? [];
      const available = list.filter((q: unknown) => !usedQIds.has((q as { id: number }).id));
      const q = (available.length > 0 ? available : list)[Math.floor(Math.random() * (available.length || list.length))];
      if (q) {
        setUsedQIds(s => new Set(s).add((q as { id: number }).id));
        questionData = { ...(q as Record<string, unknown>), mode: 'interpreter' };
      }
    } else if (mode === 'mathematician') {
      const problems = generateMathProblems(room.zombie_bomb_active);
      setMathProblems(problems);
      questionData = { mode: 'mathematician', problems, timer_sec: 60 };
    } else if (mode === 'memory_diary') {
      const seqLen = room.zombie_bomb_active ? 7 : 5;
      const seq = generateColorSequence(seqLen);
      setColorSequence(seq);
      questionData = { mode: 'memory_diary', sequence: seq, show_duration_ms: 5000 };
    } else if (mode === 'tag_puzzle') {
      const size = room.zombie_bomb_active ? 4 : 3;
      const state = scramblePuzzle(size);
      setPuzzleState(state);
      questionData = { mode: 'tag_puzzle', size, initial_state: state };
    }

    const timerSec = mode === 'mathematician' ? 60 : 30;

    await setRoomStatus(room.id, 'round_intro', {
      current_mode: mode,
      leader_position: leaderPos,
      question_data: questionData,
      timer_duration_sec: timerSec,
      // FIX STAGE 3: Remove premature Zombie Bomb clear so its state persists through the round
    });
    setCurrentQ(questionData);
  }, [room, pack, questions, usedQIds]);

  const startRoundPlaying = async () => {
    if (!room) return;
    await setRoomStatus(room.id, 'round_playing', {
      timer_started_at: new Date().toISOString(),
    });
  };

  const handleTimerExpired = useCallback(async () => {
    if (!room) return;
    bgAudio.current.stop();
    await processRoundResults();
  }, [room, answers, bets, players]);

  const processRoundResults = async () => {
    if (!room) return;
    const mode = room.current_mode;
    if (!mode) return;

    // FIX STAGE 1: Explicitly fetch final answers to prevent race condition
    const finalAnswers = await fetchAnswers(room.id, room.current_round);
    
    const nonHostPlayers = players.filter(p => !p.is_host);
    const results: PlayerRoundResult[] = [];
    let firstCorrectFound = false;

    // We store old leader for blitz calculations
    const alivePlayers = nonHostPlayers.filter(p => !p.is_zombie);
    const oldLeader = alivePlayers.sort((a, b) => b.position - a.position)[0];

    // Special case: mathematician — rank by correct count
    if (mode === 'mathematician') {
      const sorted = [...nonHostPlayers].sort((a, b) => {
        const aa = finalAnswers.find(x => x.player_id === a.id);
        const bb = finalAnswers.find(x => x.player_id === b.id);
        const ca = (aa?.answer_data as { correct_count?: number })?.correct_count ?? 0;
        const cb = (bb?.answer_data as { correct_count?: number })?.correct_count ?? 0;
        if (cb !== ca) return cb - ca;
        return a.position - b.position; // tiebreaker: closer to leader
      });

      const maxCorrect = ((sorted[0] && finalAnswers.find(x => x.player_id === sorted[0].id)?.answer_data as { correct_count?: number })?.correct_count) ?? 0;
      const minCorrect = ((sorted[sorted.length - 1] && finalAnswers.find(x => x.player_id === sorted[sorted.length - 1].id)?.answer_data as { correct_count?: number })?.correct_count) ?? 0;

      for (const p of nonHostPlayers) {
        const ans = finalAnswers.find(x => x.player_id === p.id);
        const cc = (ans?.answer_data as { correct_count?: number })?.correct_count ?? 0;
        let posChange = 1;
        let livesChange = 0;
        if (cc === maxCorrect && !p.is_zombie) { posChange = 2; }
        if (cc === minCorrect && !p.is_zombie) { posChange = 0; livesChange = -1; }
        if (p.is_zombie) posChange = 1;
        const newPos = Math.min(TOTAL_CELLS, p.position + posChange);
        const newLives = Math.max(0, p.lives + livesChange);
        results.push({
          player_id: p.id,
          is_correct: cc > 0,
          was_first: false,
          position_change: posChange,
          lives_change: livesChange,
          karma_change: 0,
          new_position: newPos,
          new_lives: newLives,
          new_karma: p.karma,
          is_zombie_now: newLives === 0 || p.is_zombie,
        });
      }
    } else if (mode === 'blitz') {
      const sortedAnswers = [...finalAnswers].sort((a, b) => new Date(a.submitted_at || 0).getTime() - new Date(b.submitted_at || 0).getTime());
      const allowedCount = Math.max(1, nonHostPlayers.length - 1);
      
      for (const p of nonHostPlayers) {
        const rankIndex = sortedAnswers.findIndex(a => a.player_id === p.id);
        const ans = rankIndex >= 0 && rankIndex < allowedCount ? sortedAnswers[rankIndex] : undefined;

        const isCorrect = ans?.is_correct ?? false;
        const isFirst = isCorrect && rankIndex === 0;
        let posChange = isCorrect ? (isFirst ? 2 : 1) : 0;
        
        // Zombies: in blitz they must answer correctly to move (which they can because they get UI controls in blitz clientside)
        const livesChange = p.is_zombie ? 0 : (isCorrect ? 0 : -1);
        let newStreak = isCorrect ? p.correct_streak + 1 : 0;
        let karmaGain = 0;
        if (!p.is_zombie && newStreak >= 3) karmaGain = 1;
        
        const newKarma = p.karma + karmaGain;
        const newLives = p.is_zombie ? 0 : Math.max(0, p.lives + livesChange);
        const newPos = Math.min(TOTAL_CELLS, p.position + posChange);

        results.push({
          player_id: p.id,
          is_correct: isCorrect,
          was_first: isFirst,
          position_change: posChange,
          lives_change: livesChange,
          karma_change: karmaGain,
          new_position: newPos,
          new_lives: newLives,
          new_karma: newKarma,
          is_zombie_now: p.is_zombie || newLives === 0,
        });
      }
    } else {
      // Standard scoring
      for (const p of nonHostPlayers) {
        if (p.is_zombie) {
          results.push({
            player_id: p.id,
            is_correct: true,
            was_first: false,
            position_change: 1,
            lives_change: 0,
            karma_change: 0,
            new_position: Math.min(TOTAL_CELLS, p.position + 1),
            new_lives: p.lives,
            new_karma: p.karma,
            is_zombie_now: true,
          });
          continue;
        }

        const ans = finalAnswers.find(x => x.player_id === p.id);
        const isCorrect = ans?.is_correct ?? false;
        const isFirst = isCorrect && !firstCorrectFound;
        if (isFirst) firstCorrectFound = true;
        let posChange = isCorrect ? (isFirst ? 2 : 1) : 0;
        
        // Zombies don't lose lives, they just don't move if incorrect
        const livesChange = p.is_zombie ? 0 : (isCorrect ? 0 : -1);

        // Karma tracking
        let newStreak = isCorrect ? p.correct_streak + 1 : 0;
        let karmaGain = 0;
        if (!p.is_zombie && newStreak >= 3) {
          karmaGain = 1;
        }
        const newKarma = p.karma + karmaGain;
        const newLives = p.is_zombie ? 0 : Math.max(0, p.lives + livesChange);
        const newPos = Math.min(TOTAL_CELLS, p.position + posChange);

        results.push({
          player_id: p.id,
          is_correct: isCorrect,
          was_first: isFirst,
          position_change: posChange,
          lives_change: livesChange,
          karma_change: karmaGain,
          new_position: newPos,
          new_lives: newLives,
          new_karma: newKarma,
          is_zombie_now: p.is_zombie || newLives === 0,
        });
      }
    }

    // FIX STAGE 1: Blitz mode penalty logic - if a player overtook the old leader, old leader gets -1
    if (mode === 'blitz' && oldLeader) {
      const oldLeaderResult = results.find(r => r.player_id === oldLeader.id);
      
      const someoneOvertook = results.some(r => {
        if (r.player_id === oldLeader.id || r.is_zombie_now) return false;
        // Did they overtake the old leader's NEW position?
        return r.new_position > (oldLeaderResult?.new_position ?? oldLeader.position);
      });

      if (someoneOvertook && oldLeaderResult && !oldLeaderResult.is_zombie_now) {
        oldLeaderResult.position_change -= 1;
        oldLeaderResult.new_position = Math.max(0, oldLeaderResult.new_position - 1);
      }
    }

    // FIX STAGE 1: Zombies infect on collision
    const zombiePositions = new Set(
      results.filter(r => r.is_zombie_now).map(r => r.new_position)
    );

    for (const r of results) {
      if (!r.is_zombie_now && zombiePositions.has(r.new_position)) {
        // Infected!
        r.lives_change -= r.new_lives; // Lose all remaining lives
        r.new_lives = 0;
        r.is_zombie_now = true;
      }
    }

    // FIX STAGE 2: Apply bet modifications AND reset Zombie Bomb
    const anyCorrect = results.some(r => r.is_correct);
    const resolvedBets: BetResultsData['bets'] = bets.map(b => {
      const r = results.find(x => x.player_id === b.player_id);
      if (!r) return { player_id: b.player_id, bet_type: b.bet_type, won: false };
      const won = !anyCorrect; // bet "nobody answers" - won if nobody got it right
      if (won) {
        if (b.bet_type === 'karma') {
          // Double karma if they win the bet
          r.karma_change += 1; 
          r.new_karma += 1;
        }
      } else {
        if (b.bet_type === 'life') {
          // On loss, player loses a life. Because 'is_correct' false already took 1 life locally for this round, we take ANOTHER ONE.
          r.lives_change -= 1; 
          r.new_lives = Math.max(0, r.new_lives - 1); 
          if (r.new_lives === 0) r.is_zombie_now = true;
        } else if (b.bet_type === 'karma') {
          // Need to remove the karma they bet
          r.karma_change -= 1;
          r.new_karma = Math.max(0, r.new_karma - 1);
        }
      }
      return { player_id: b.player_id, bet_type: b.bet_type, won };
    });

    // Reset Zombie Bomb if it was active
    const shouldResetBomb = room.zombie_bomb_active;

    const betResultsForSave: BetResultsData = {
      round: room.current_round,
      anyone_correct: anyCorrect,
      bets: resolvedBets,
    };
    setBetResultsData(betResultsForSave);
    setRoundResultsData(results);

    // Determine result audio
    const ma = MODE_AUDIO[mode as keyof typeof MODE_AUDIO] as Record<string, string | undefined>;
    const allCorrect = results.every(r => r.is_correct);
    const noneCorrect = results.every(r => !r.is_correct);
    const resultPool = allCorrect && ma.all_correct
      ? ma.all_correct
      : noneCorrect && ma.everyone_mistake
      ? ma.everyone_mistake
      : ma.mixed ?? '';

    const correctAnswer = resolveCorrectAnswer(mode);
    const perfectRound = alivePlayers.length > 0 && alivePlayers.every(p => {
      const res = results.find(r => r.player_id === p.id);
      return res?.is_correct;
    });

    await setRoomStatus(room.id, 'round_results', {
      round_results_data: { 
        round: room.current_round, 
        mode, 
        correct_answer: correctAnswer, 
        player_results: results,
        perfect_round: perfectRound,
      },
      bet_results_data: bets.length > 0 ? betResultsForSave : null,
      ...(shouldResetBomb ? { zombie_bomb_active: false, zombie_bomb_player_id: null } : {})
    });

    bgAudio.current.play(randomFromPool(resultPool, 5), false, async () => {
      // After results audio → apply changes and move to next phase
      await applyResults(results);
      if (bets.length > 0) {
        await setRoomStatus(room.id, 'bet_reveal', {});
        bgAudio.current.play(
          anyCorrect
            ? resolvedBets.every(b => !b.won) ? randomFromPool(BET_UNWORKED_POOL, 5) : randomFromPool(BET_MIX_POOL, 5)
            : randomFromPool(BET_WORKED_POOL, 5),
          false,
          () => advanceAfterBetReveal(),
        );
      } else {
        await advanceAfterBetReveal();
      }
    });
  };

  function resolveCorrectAnswer(mode: RoundMode | null): string {
    if (!currentQ) return '';
    switch (mode) {
      case 'umnik': return (currentQ.options as string[])?.[(currentQ.correct as number)] ?? '';
      case 'blitz': return (currentQ.options as string[])?.[currentQ.correct_index as number] ?? '';
      case 'art_historian': return (currentQ.primary_answer as string) ?? '';
      case 'interpreter': return (currentQ.primary_answer as string) ?? '';
      case 'mathematician': return '';
      case 'memory_diary': return (currentQ.sequence as string[])?.join(' → ') ?? '';
      case 'tag_puzzle': return 'Правильный порядок';
      default: return '';
    }
  }

  const applyResults = async (results: PlayerRoundResult[]) => {
    await updatePlayers(results.map(r => ({
      id: r.player_id,
      position: r.new_position,
      lives: r.new_lives,
      karma: r.new_karma,
      is_zombie: r.is_zombie_now,
      correct_streak: r.is_correct ? undefined : 0, // reset streak on wrong
    })));
  };

  const advanceAfterBetReveal = async () => {
    if (!room) return;
    const updatedPlayers = await fetchPlayers(room.id);
    const gamePlayers = updatedPlayers.filter(p => !p.is_host);

    // Check win condition
    const winners = gamePlayers.filter(p => p.position >= TOTAL_CELLS);
    if (winners.length > 0) {
      await setRoomStatus(room.id, 'finished', {});
      return;
    }

    // Check for duel trigger (any player has >= 3 karma and can reach a target)
    // Duel is player-initiated in real game — here we just go to next round
    const newLeaderPos = getLeaderPosition(gamePlayers);
    const newRound = room.current_round + 1;

    // Check for Hot Potato condition: perfect round & at least 3 players alive
    // (A hot potato needs players to pass it between)
    // We already stored `perfect_round` in round_results_data.
    const roundData = room.round_results_data as RoundResultsData | null;
    const aliveGamePlayers = gamePlayers.filter(p => !p.is_zombie);

    if (roundData?.perfect_round && aliveGamePlayers.length >= 3 && !roundData.potato_loser && !roundData.potato_bomb_holder) {
      // Pick a random alive player to get the bomb
      const randomStartId = aliveGamePlayers[Math.floor(Math.random() * aliveGamePlayers.length)].id;
      
      const newRoundData = {
        ...roundData,
        potato_bomb_holder: randomStartId,
        potato_duration_ms: 10000 + Math.random() * 5000,
      };

      await setRoomStatus(room.id, 'potato_intro', {
        round_results_data: newRoundData,
      });
      return;
    }

    if (newLeaderPos >= BLITZ_START && room.current_mode !== 'blitz') {
      await setRoomStatus(room.id, 'blitz_intro', {
        current_round: newRound,
        leader_position: newLeaderPos,
      });
    } else {
      await setRoomStatus(room.id, 'moving', {
        current_round: newRound,
        leader_position: newLeaderPos,
      });
    }
  };

  /* ─── Duel handling ─── */
  const handleInitiateDuel = async (
    challengerId: string,
    challengedId: string,
    duelMode: 'minesweeper' | 'arithmetic_mean' | 'crowd_forecast',
  ) => {
    if (!room || !pack) return;
    const tileCount = players.filter(p => !p.is_host).length + 2;
    let initialDuelData: Record<string, unknown> = {};
    if (duelMode === 'minesweeper') {
      initialDuelData = { mode: 'minesweeper', tile_count: tileCount, mined_tiles: {}, challenger_picks: [], challenged_picks: [] };
    } else if (duelMode === 'arithmetic_mean') {
      const qBank = await loadDuelQuestions(pack.base_url, 'arithmetic_mean');
      const list = (qBank as { questions: unknown[] })?.questions ?? [];
      const q = list[Math.floor(Math.random() * list.length)] as Record<string, unknown>;
      initialDuelData = { mode: 'arithmetic_mean', question: q?.question ?? '', player_guesses: {}, average: null, challenger_answer: null, challenged_answer: null };
      setDuelQ(q);
    } else {
      const qBank = await loadDuelQuestions(pack.base_url, 'crowd_forecast');
      const list = (qBank as { questions: unknown[] })?.questions ?? [];
      const q = list[Math.floor(Math.random() * list.length)] as Record<string, unknown>;
      initialDuelData = { mode: 'crowd_forecast', question: q?.question ?? '', options: q?.options ?? [], player_votes: {}, majority_index: null, challenger_prediction: null, challenged_prediction: null };
      setDuelQ(q);
    }

    const newDuel = await createDuel(
      room.id, room.current_round, duelMode,
      challengerId, challengedId, initialDuelData as unknown as import('@/lib/survivach/types').DuelData,
    );
    await setRoomStatus(room.id, 'duel_intro', {
      duel_data: initialDuelData,
    });
    setDuel(newDuel);
  };

  const handleDuelResult = async (winnerId: string | null) => {
    if (!room || !duel) return;
    const challenger = players.find(p => p.id === duel.challenger_id);
    const challenged = players.find(p => p.id === duel.challenged_id);
    if (!challenger || !challenged) return;

    await updateDuel(duel.id, { status: 'done', winner_id: winnerId });

    if (winnerId === null) {
      // Draw
      bgAudio.current.play(randomFromPool(DRAW_POOL, 5), false, () => advanceAfterDuel());
    } else if (winnerId === duel.challenged_id) {
      // Called player won → takes 3 karma from challenger (unless challenger is zombie, then just defended)
      if (challenger.is_zombie) {
        // Zombie lost duel. Zombie receives nothing (stays zombie). Alive player keeps life.
      } else {
        await updatePlayers([
          { id: challenger.id, karma: Math.max(0, challenger.karma - 3) },
          { id: challenged.id, karma: challenged.karma + 3 },
        ]);
      }
      bgAudio.current.play(randomFromPool(SUMMONED_WON_POOL, 5), false, () => advanceAfterDuel());
    } else {
      // Challenger won
      if (challenger.is_zombie) {
        // Zombie won! Resurrects (gets 1 life). Challenged loses 1 life (and might become zombie).
        // If challenged was already zombie (unlikely but possible), they stay zombie.
        const newChallengedLives = Math.max(0, challenged.lives - 1);
        const newChallengedIsZombie = newChallengedLives === 0 || challenged.is_zombie;
        
        // Check if challenged landed on another zombie cell (already handled by main logic, but specs say they lose life anyway)
        await updatePlayers([
          { id: challenger.id, position: challenged.position, is_zombie: false, lives: 1 },
          { id: challenged.id, position: challenger.position, is_zombie: newChallengedIsZombie, lives: newChallengedLives },
        ]);
      } else {
        // Normal swap positions
        await updatePlayers([
          { id: challenger.id, position: challenged.position },
          { id: challenged.id, position: challenger.position },
        ]);
      }
      bgAudio.current.play(randomFromPool(CALLER_WON_POOL, 5), false, () => advanceAfterDuel());
    }

    await setRoomStatus(room.id, 'duel_result', { duel_data: { ...room.duel_data, winner_id: winnerId } as unknown as import('@/lib/survivach/types').DuelData });
  };

  const advanceAfterDuel = async () => {
    if (!room) return;
    const updatedPlayers = await fetchPlayers(room.id);
    const newLeaderPos = getLeaderPosition(updatedPlayers.filter(p => !p.is_host));
    const newRound = room.current_round + 1;
    
    // FIX STAGE 3: Clear local duel states to prevent phantom renders
    setDuel(null);
    setDuelQ(null);

    await setRoomStatus(room.id, 'moving', { current_round: newRound, leader_position: newLeaderPos });
  };

  /* ─── Loading & error states ─── */
  if (loading) {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white text-2xl animate-pulse">🧟 Загрузка...</div>;
  }

  if (!room) {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white text-2xl">Комната не найдена</div>;
  }

  const ranked = rankPlayers(players.filter(p => !p.is_host));
  const leaderPos = getLeaderPosition(ranked);
  const joinUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/survivach/room/${code}`;

  /* ══════════════════════════════════════════
     Render by status
     ══════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* ─── LOBBY ─── */}
      {room.status === 'lobby' && (
        <div className="min-h-screen flex flex-col items-center justify-center p-8 gap-8">
          <div className="text-center">
            <h1 className="text-6xl font-black mb-2">🧟 ВЫЖИВАЧ</h1>
            <p className="text-gray-400">Доска выживания · 26 клеток · Зомби · Дуэли</p>
          </div>

          <div className="flex gap-8 items-start">
            <div className="text-center">
              <QRCodeCanvas value={joinUrl} size={180} bgColor="#0f172a" fgColor="#ffffff" />
              <p className="text-gray-400 text-sm mt-2">Сканировать для входа</p>
            </div>
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 min-w-48">
              <div className="text-4xl font-mono font-black text-center text-yellow-400 tracking-widest mb-2">
                {code}
              </div>
              <p className="text-gray-400 text-xs text-center">Код комнаты</p>
              <div className="mt-4 text-sm text-gray-400 text-center">
                {players.filter(p => !p.is_host).length} / {MIN_PLAYERS}+ игроков
              </div>
            </div>
          </div>

          {/* Player list */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl w-full">
            {DUCK_AVATARS.map(duck => {
              const occupant = players.find(p => p.avatar === duck && !p.is_host);
              return (
                <div key={duck} className={`border rounded-xl p-3 text-center transition-all ${
                  occupant ? 'border-green-500 bg-green-900/20' : 'border-gray-700 bg-gray-900/50 opacity-40'
                }`}>
                  <img src={getAvatarUrl(duck, 3)} alt={duck} className="w-12 h-12 mx-auto object-contain" />
                  {occupant
                    ? <p className="text-sm font-bold mt-1 text-green-300 truncate">{occupant.name}</p>
                    : <p className="text-xs text-gray-500 mt-1">Свободно</p>
                  }
                </div>
              );
            })}
          </div>

          <button
            onClick={handleStartGame}
            disabled={players.filter(p => !p.is_host).length < MIN_PLAYERS}
            className="px-12 py-5 rounded-2xl text-2xl font-black disabled:opacity-40 disabled:cursor-not-allowed transition-all bg-red-600 hover:bg-red-500 active:scale-95 shadow-2xl shadow-red-900/50"
          >
            ☠️ Начать выживание
          </button>
          {players.filter(p => !p.is_host).length < MIN_PLAYERS && (
            <p className="text-gray-500 text-sm">Минимум {MIN_PLAYERS} игрока</p>
          )}
          <button
            onClick={async () => { if (confirm('Закрыть комнату?')) { await setRoomStatus(room.id, 'finished', {}); } }}
            className="text-gray-600 hover:text-red-400 text-sm underline transition-colors mt-2"
          >
            Закрыть комнату
          </button>
        </div>
      )}

      {/* ─── RULES ─── */}
      {room.status === 'rules' && (
        <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-b from-gray-950 to-red-950">
          <h2 className="text-4xl font-black mb-8">📜 Правила выживания</h2>
          <div className="max-w-2xl w-full grid gap-4 text-sm leading-relaxed">
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
              <b className="text-yellow-400">🎯 Цель:</b> Первым добраться до клетки 26, не превратившись в зомби.
            </div>
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
              <b className="text-green-400">✅ Правильный ответ:</b> +1 клетка вперёд. Первый ответивший — +2 клетки.
            </div>
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
              <b className="text-red-400">❌ Неправильный ответ:</b> остаёшься на месте, −1 жизнь.
            </div>
            <div className="bg-gray-900 border border-green-700 rounded-xl p-4">
              <b className="text-green-400">🧟 Зомби-режим:</b> 3 ошибки = смерть → превращение в зомби. Зомби всегда идут на +1, заражают при встрече.
            </div>
            <div className="bg-gray-900 border border-yellow-700 rounded-xl p-4">
              <b className="text-yellow-400">✨ Карма:</b> 3 правильных подряд → карма. При 3 очках — вызов на дуэль!
            </div>
            <div className="bg-gray-900 border border-purple-700 rounded-xl p-4">
              <b className="text-purple-400">⚡ Блиц (кл. 19+):</b> Быстрые вопросы. Последний ответ не считается — надо торопиться!
            </div>
          </div>
          <p className="text-gray-500 text-sm mt-8 animate-pulse">Ожидайте начала игры...</p>
        </div>
      )}

      {/* ─── MOVING ─── */}
      {room.status === 'moving' && (
        <div className="min-h-screen flex flex-col p-6 gap-6">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-black">🎲 Передвижение</h2>
            <div className="px-4 py-2 bg-gray-800 rounded-lg text-lg font-mono">
              {moveTimerLeft}s
            </div>
            <div className="px-4 py-2 rounded-lg font-bold text-sm"
              style={{ backgroundColor: MODE_COLORS[getModeForCell(room.leader_position) as RoundMode] + '30',
                        color: MODE_COLORS[getModeForCell(room.leader_position) as RoundMode] }}>
              Следующий: {MODE_LABELS[getModeForCell(room.leader_position) as RoundMode]}
            </div>
          </div>

          <BoardView players={players.filter(p => !p.is_host)} leaderPosition={room.leader_position} />

          {moveMessage && (
            <div className="mx-auto max-w-xl bg-gray-900 border border-yellow-500/40 rounded-2xl p-4 text-center text-yellow-200 font-medium">
              {moveMessage}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {ranked.map((p, i) => <PlayerCard key={p.id} player={p} rank={i + 1} />)}
          </div>
        </div>
      )}

      {/* ─── ROUND INTRO ─── */}
      {room.status === 'round_intro' && (
        <div className="min-h-screen flex flex-col items-center justify-center gap-6">
          <div className="text-8xl font-black animate-bounce">
            {MODE_LABELS[room.current_mode as RoundMode]?.split(' ')[0] ?? '🎮'}
          </div>
          <h2 className="text-4xl font-black" style={{ color: MODE_COLORS[room.current_mode as RoundMode] }}>
            {MODE_LABELS[room.current_mode as RoundMode]}
          </h2>
          <p className="text-gray-400 text-lg">Раунд {room.current_round}</p>
          {room.zombie_bomb_active && (
            <div className="px-6 py-3 bg-green-900/40 border border-green-500 rounded-2xl text-green-300 font-bold text-xl animate-pulse">
              💣 ЗОМБИ-БОМБА АКТИВИРОВАНА!
            </div>
          )}
          <p className="text-gray-500 animate-pulse">Подготовьтесь...</p>
        </div>
      )}

      {/* ─── ROUND PLAYING ─── */}
      {room.status === 'round_playing' && currentQ && (
        <div className="min-h-screen flex flex-col p-6 gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-lg font-bold" style={{ color: MODE_COLORS[room.current_mode as RoundMode] }}>
              {MODE_LABELS[room.current_mode as RoundMode]}
            </span>
            <span>Раунд {room.current_round}</span>
            <div className={`ml-auto text-2xl font-mono font-black px-4 py-1 rounded-lg ${
              timerLeft <= 10 ? 'text-red-400 bg-red-900/30 animate-pulse' : 'text-white bg-gray-800'
            }`}>
              ⏱ {timerLeft}s
            </div>
          </div>

          {/* Question display by mode */}
          {(room.current_mode === 'umnik' || room.current_mode === 'blitz') && (
            <div className="flex-1 flex flex-col items-center gap-6 justify-center">
              <h2 className={`text-2xl font-bold text-center max-w-2xl ${room.current_mode === 'blitz' ? 'text-red-400 animate-pulse' : ''}`}>
                {(currentQ as { question: string }).question}
              </h2>
              <div className="grid grid-cols-2 gap-3 max-w-2xl w-full">
                {((currentQ as { options: string[] }).options ?? []).map((opt, i) => (
                  <div key={i} className={`px-4 py-3 bg-gray-800 border ${room.current_mode === 'blitz' ? 'border-red-500/50' : 'border-gray-600'} rounded-xl text-center font-medium`}>
                    <span className="text-gray-500 mr-2">{String.fromCharCode(65 + i)}.</span>{opt}
                  </div>
                ))}
              </div>
            </div>
          )}

          {room.current_mode === 'art_historian' && (
            <div className="flex-1 flex flex-col items-center gap-4">
              <h2 className="text-xl font-bold text-center max-w-2xl">
                {(currentQ as { question: string }).question}
              </h2>
              <div className="relative">
                <img
                  src={(currentQ as { image_url: string }).image_url}
                  alt="artwork"
                  className={`max-h-80 object-contain rounded-xl ${room.zombie_bomb_active ? 'blur-md' : ''}`}
                />
                {room.zombie_bomb_active && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="bg-green-900/80 text-green-300 font-bold px-4 py-2 rounded-xl">💣 Блюр активен</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {room.current_mode === 'interpreter' && (
            <div className="flex-1 flex flex-col items-center gap-6 justify-center max-w-2xl mx-auto">
              <div className="bg-gray-900 border border-purple-500/40 rounded-2xl p-6 text-lg italic text-purple-200">
                "{(currentQ as { translated_text: string }).translated_text}"
              </div>
              {room.zombie_bomb_active && (
                <p className="text-red-400 font-bold">💣 Только название песни!</p>
              )}
            </div>
          )}

          {room.current_mode === 'mathematician' && (
            <div className="flex-1 flex flex-col items-center gap-4 justify-center">
              <p className="text-gray-400">Игроки решают примеры 60 секунд</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-w-3xl w-full">
                {mathProblems.slice(0, 8).map((p, i) => (
                  <div key={i} className="bg-gray-900 border border-gray-700 rounded-xl p-3 text-center font-mono">
                    {p.expression}
                  </div>
                ))}
                {mathProblems.length > 8 && <div className="col-span-2 md:col-span-4 text-center text-gray-500 text-sm">...и ещё {mathProblems.length - 8} примеров</div>}
              </div>
            </div>
          )}

          {room.current_mode === 'memory_diary' && (
            <div className="flex-1 flex flex-col items-center gap-6 justify-center">
              <h2 className="text-2xl font-bold">Запомните последовательность!</h2>
              <div className="flex gap-3">
                {colorSequence.map((c, i) => (
                  <div key={i} className="w-16 h-16 rounded-full border-4 border-white/20 shadow-lg"
                    style={{ backgroundColor: MEMORY_COLORS[c] }} />
                ))}
              </div>
              {room.zombie_bomb_active && (
                <p className="text-green-400 font-bold">💣 Усложнённая последовательность!</p>
              )}
            </div>
          )}

          {room.current_mode === 'tag_puzzle' && (
            <div className="flex-1 flex flex-col items-center gap-4 justify-center">
              <h2 className="text-2xl font-bold">Пятнашки — кто быстрее!</h2>
              <div className="bg-gray-900 border border-yellow-500/40 rounded-xl p-4 text-center">
                <p className="text-gray-400 text-sm">Решайте на своих телефонах</p>
                <div className="mt-2 font-mono text-yellow-400">
                  {puzzleState.slice(0, 9).map((n, i) => n === 0 ? '  ' : String(n).padStart(2)).join(' ')}
                </div>
              </div>
            </div>
          )}

          {/* Answers progress */}
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm text-gray-400">Ответили</span>
              <span className="font-bold">{answers.length} / {players.filter(p => !p.is_host).length}</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {players.filter(p => !p.is_host).map(p => {
                const ans = answers.find(a => a.player_id === p.id);
                return (
                  <div key={p.id} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs ${
                    ans ? 'bg-green-900/40 border border-green-600' : 'bg-gray-800 border border-gray-700'
                  }`}>
                    <img src={getAvatarUrl(p.avatar, p.lives)} alt="" className="w-5 h-5 object-contain" />
                    <span>{p.name}</span>
                    {ans && <span>✓</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bets indicator */}
          {bets.length > 0 && (
            <div className="text-center text-yellow-400 text-sm font-bold">
              🎰 Сделали ставку: {bets.length} чел.
            </div>
          )}

          {/* Karma/duel eligible players */}
          {ranked.filter(p => p.karma >= 3 && !p.is_zombie).length > 0 && (
            <div className="bg-yellow-900/20 border border-yellow-500/40 rounded-xl p-3">
              <p className="text-yellow-400 font-bold text-sm mb-2">✨ Могут вызвать на дуэль:</p>
              <div className="flex gap-2 flex-wrap">
                {ranked.filter(p => p.karma >= 3 && !p.is_zombie).map(p => (
                  <span key={p.id} className="px-2 py-1 bg-yellow-900/40 rounded text-xs">{p.name} ({p.karma}✨)</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── ROUND RESULTS ─── */}
      {room.status === 'round_results' && (
        <div className="min-h-screen flex flex-col p-6 gap-4">
          <h2 className="text-3xl font-black text-center">📊 Результаты раунда</h2>

          {room.round_results_data && (
            <div className="max-w-2xl mx-auto w-full">
              {room.current_mode !== 'mathematician' && (
                <div className="text-center mb-4 bg-gray-900 border border-gray-700 rounded-xl p-3">
                  <span className="text-gray-400 text-sm">Правильный ответ: </span>
                  <span className="font-bold text-green-400">{room.round_results_data.correct_answer}</span>
                </div>
              )}
              <div className="grid gap-2">
                {rankPlayers(players.filter(p => !p.is_host)).map((p, i) => {
                  const r = roundResultsData.find(x => x.player_id === p.id);
                  return (
                    <div key={p.id} className={`flex items-center gap-3 p-3 rounded-xl border ${
                      r?.is_correct ? 'border-green-600/50 bg-green-900/10' : 'border-red-600/30 bg-red-900/10'
                    }`}>
                      <span className="text-gray-500 w-4 text-xs">#{i + 1}</span>
                      <img src={getAvatarUrl(p.avatar, r?.new_lives ?? p.lives)} alt="" className="w-8 h-8 object-contain" />
                      <span className="flex-1 font-medium">{p.name}</span>
                      {r && (
                        <>
                          {r.is_correct
                            ? <span className="text-green-400 font-bold">{r.was_first ? '⚡ +2' : '✅ +1'}</span>
                            : <span className="text-red-400 font-bold">❌ −♥</span>
                          }
                          <span className="text-gray-400 text-sm">→ кл.{r.new_position}</span>
                          {r.karma_change > 0 && <span className="text-yellow-400 text-xs">+{r.karma_change}✨</span>}
                          {r.is_zombie_now && !p.is_zombie && <span className="text-green-400">🧟 ЗОМБИ!</span>}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── BET REVEAL ─── */}
      {room.status === 'bet_reveal' && betResultsData && (
        <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-6">
          <h2 className="text-4xl font-black">🎰 Они сделали ставку!</h2>
          <div className="flex gap-4 flex-wrap justify-center">
            {betResultsData.bets.map(b => {
              const p = players.find(x => x.id === b.player_id);
              if (!p) return null;
              return (
                <div key={b.player_id} className={`flex flex-col items-center gap-2 p-4 rounded-2xl border ${
                  b.won ? 'border-green-500 bg-green-900/20' : 'border-red-500 bg-red-900/20'
                }`}>
                  <img src={getAvatarUrl(p.avatar, p.lives)} alt="" className="w-16 h-16 object-contain" />
                  <span className="font-bold">{p.name}</span>
                  <span className="text-sm">{b.bet_type === 'karma' ? '✨ Карма' : '❤️ Жизнь'}</span>
                  <span className={`text-2xl font-black ${b.won ? 'text-green-400' : 'text-red-400'}`}>
                    {b.won ? '✅ СЫГРАЛО' : '❌ НЕТ'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── DUEL INTRO ─── */}
      {room.status === 'duel_intro' && duel && (
        <div className="min-h-screen flex flex-col items-center justify-center gap-8">
          <h2 className="text-5xl font-black">⚔️ ДУЭЛЬ!</h2>
          <div className="flex items-center gap-8">
            {[duel.challenger_id, duel.challenged_id].map((pid, idx) => {
              const p = players.find(x => x.id === pid);
              if (!p) return null;
              return (
                <div key={pid} className="flex flex-col items-center gap-2">
                  <img src={getAvatarUrl(p.avatar, p.lives)} alt="" className="w-24 h-24 object-contain" />
                  <span className="font-bold text-xl">{p.name}</span>
                  <span className="text-gray-400 text-sm">{idx === 0 ? 'Challenger' : 'Challenged'}</span>
                </div>
              );
            })}
          </div>
          <p className="text-gray-400 animate-pulse">Подготовка к дуэли...</p>
        </div>
      )}

      {/* ─── DUEL SETUP ─── */}
      {room.status === 'duel_setup' && duel && (
        <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-6">
          <h2 className="text-3xl font-black">
            {duel.mode === 'minesweeper' ? '💣 Сапёр' :
             duel.mode === 'arithmetic_mean' ? '📊 Среднее арифметическое' :
             '🗳️ Прогноз толпы'}
          </h2>

          {duel.mode === 'minesweeper' && (
            <div className="text-center max-w-lg">
              <p className="text-gray-300 mb-4">Остальные игроки расставляют мины на плитках.</p>
              <p className="text-gray-400 text-sm">Дуэлянты будут выбирать плитки по очереди.</p>
              <div className="mt-4 grid grid-cols-4 gap-2">
                {Array.from({ length: (duel.duel_data as { tile_count?: number })?.tile_count ?? 6 }).map((_, i) => (
                  <div key={i} className="h-12 bg-gray-800 border border-gray-600 rounded-lg flex items-center justify-center text-gray-500">?</div>
                ))}
              </div>
            </div>
          )}

          {duel.mode === 'arithmetic_mean' && duelQ && (
            <div className="text-center max-w-lg">
              <div className="bg-gray-900 border border-blue-500/40 rounded-2xl p-6 mb-4">
                <p className="text-xl font-bold">{(duelQ as { question: string }).question}</p>
              </div>
              <p className="text-gray-400">Все игроки вводят своё число. Затем дуэлянты угадывают среднее.</p>
            </div>
          )}

          {duel.mode === 'crowd_forecast' && duelQ && (
            <div className="text-center max-w-lg">
              <div className="bg-gray-900 border border-purple-500/40 rounded-2xl p-6 mb-4">
                <p className="text-xl font-bold">{(duelQ as { question: string }).question}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {((duelQ as { options: string[] }).options ?? []).map((opt, i) => (
                  <div key={i} className="bg-gray-800 border border-gray-600 rounded-xl p-3 text-center">{opt}</div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 flex-wrap justify-center">
            {players.filter(p => !p.is_host && p.id !== duel.challenger_id && p.id !== duel.challenged_id).map(p => {
              const dd = duel.duel_data as { mined_tiles?: Record<string, number[]>; player_votes?: Record<string, number>; player_guesses?: Record<string, number> } | null;
              const hasActed = duel.mode === 'minesweeper'
                ? !!(dd?.mined_tiles?.[p.id])
                : duel.mode === 'crowd_forecast'
                ? p.id in (dd?.player_votes ?? {})
                : p.id in (dd?.player_guesses ?? {});
              return (
                <div key={p.id} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs ${
                  hasActed ? 'bg-green-900/30 border border-green-600' : 'bg-gray-800 border border-gray-700'
                }`}>
                  <img src={getAvatarUrl(p.avatar, p.lives)} alt="" className="w-5 h-5 object-contain" />
                  <span>{p.name}</span>
                  {hasActed && <span>✓</span>}
                </div>
              );
            })}
          </div>

          <button
            onClick={() => setRoomStatus(room.id, 'duel_playing', {})}
            className="px-8 py-4 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold"
          >
            ▶ Начать дуэль
          </button>
        </div>
      )}

      {/* ─── DUEL PLAYING ─── */}
      {room.status === 'duel_playing' && duel && (
        <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-6">
          <h2 className="text-3xl font-black">⚔️ Дуэлянты отвечают</h2>

          <div className="flex items-center gap-8">
            {[duel.challenger_id, duel.challenged_id].map(pid => {
              const p = players.find(x => x.id === pid);
              const dd = duel.duel_data as { challenger_answer?: unknown; challenged_answer?: unknown; challenger_picks?: number[]; challenged_picks?: number[]; challenger_prediction?: unknown; challenged_prediction?: unknown } | null;
              const hasAnswered = pid === duel.challenger_id
                ? dd?.challenger_answer != null || (dd?.challenger_picks ?? []).length > 0 || dd?.challenger_prediction != null
                : dd?.challenged_answer != null || (dd?.challenged_picks ?? []).length > 0 || dd?.challenged_prediction != null;
              if (!p) return null;
              return (
                <div key={pid} className={`flex flex-col items-center gap-2 p-6 rounded-2xl border ${hasAnswered ? 'border-green-500 bg-green-900/20' : 'border-gray-600 bg-gray-900'}`}>
                  <img src={getAvatarUrl(p.avatar, p.lives)} alt="" className="w-20 h-20 object-contain" />
                  <span className="font-bold">{p.name}</span>
                  {hasAnswered ? <span className="text-green-400">✅ Ответил</span> : <span className="text-gray-400 animate-pulse">Думает...</span>}
                </div>
              );
            })}
          </div>

          {/* Duel result buttons */}
          <div className="flex gap-3">
            {[duel.challenger_id, duel.challenged_id].map(pid => {
              const p = players.find(x => x.id === pid);
              return (
                <button key={pid} onClick={() => handleDuelResult(pid)}
                  className="px-6 py-3 bg-yellow-600 hover:bg-yellow-500 rounded-xl font-bold">
                  🏆 Победил {p?.name}
                </button>
              );
            })}
            <button onClick={() => handleDuelResult(null)}
              className="px-6 py-3 bg-gray-600 hover:bg-gray-500 rounded-xl font-bold">
              🤝 Ничья
            </button>
          </div>
        </div>
      )}

      {/* ─── DUEL RESULT ─── */}
      {room.status === 'duel_result' && duel && (
        <div className="min-h-screen flex flex-col items-center justify-center gap-6">
          <h2 className="text-4xl font-black">⚔️ Итог дуэли</h2>
          {duel.winner_id ? (
            (() => {
              const w = players.find(p => p.id === duel.winner_id);
              return w ? (
                <div className="flex flex-col items-center gap-2">
                  <img src={getAvatarUrl(w.avatar, w.lives)} alt="" className="w-24 h-24 object-contain" />
                  <span className="text-2xl font-black text-yellow-400">🏆 {w.name} победил!</span>
                </div>
              ) : null;
            })()
          ) : (
            <span className="text-2xl font-bold text-gray-400">🤝 Ничья — все остаются</span>
          )}
          <p className="text-gray-500 animate-pulse">Переход к следующему ходу...</p>
        </div>
      )}

      {/* ─── HOT POTATO ─── */}
      {room.status === 'potato_intro' && (
        <div className="min-h-screen flex flex-col items-center justify-center gap-8 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-600 via-red-950 to-black p-8 relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-orange-600/20 blur-[120px] rounded-full pointer-events-none"></div>

          <h2 className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-br from-yellow-300 via-orange-500 to-red-600 drop-shadow-[0_0_30px_rgba(234,88,12,0.8)] animate-pulse tracking-tighter uppercase relative z-10">
            ГОРЯЧАЯ КАРТОШКА
          </h2>
          <div className="text-3xl text-gray-200 text-center max-w-4xl leading-relaxed flex flex-col gap-4 relative z-10 border border-orange-500/30 bg-black/40 backdrop-blur-md p-10 rounded-[2rem] shadow-2xl">
            <p>Вы слишком умные! Все выжившие ответили верно.</p>
            <p>Случайный игрок получает бомбу-картошку 💣</p>
            <p className="text-4xl text-orange-400 font-black mt-4 drop-shadow-[0_0_15px_rgba(234,88,12,0.6)]">
              ТРЯСИ ТЕЛЕФОН
            </p>
            <p className="text-xl text-gray-400">чтобы перекинуть её другому!</p>
            <p className="text-red-400 font-bold mt-2 border-t border-red-500/20 pt-6">У кого бомба взорвётся — теряет жизнь!</p>
          </div>
          <button onClick={async () => {
            const rd = room.round_results_data as any;
            await setRoomStatus(room.id, 'potato_playing', {
              round_results_data: {
                ...rd,
                potato_started_at: Date.now(),
              }
            });
          }} className="px-16 py-6 bg-gradient-to-b from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 rounded-full text-4xl font-black mt-8 text-white shadow-[0_0_50px_rgba(234,88,12,0.6)] hover:shadow-[0_0_80px_rgba(234,88,12,0.9)] transition-all duration-300 hover:scale-105 active:scale-95 uppercase tracking-wide border-b-4 border-red-800 relative z-10">
            НАЧАТЬ ПЕРЕДАЧУ
          </button>
        </div>
      )}

      {room.status === 'potato_playing' && (
        <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-red-950 via-black to-black relative overflow-hidden">
          {/* Background alert pulse */}
          <div className="absolute inset-0 bg-red-600/10 animate-ping pointer-events-none" style={{ animationDuration: '0.6s' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-red-600/10 blur-[150px] rounded-full pointer-events-none"></div>
          
          <h2 className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500 mb-16 drop-shadow-[0_0_30px_rgba(239,68,68,0.8)] tracking-tighter uppercase relative z-10 animate-pulse">
            БОМБА У ИГРОКА!
          </h2>
          
          <div className="flex flex-wrap gap-12 justify-center max-w-6xl relative z-10">
            {players.filter(p => !p.is_host && !p.is_zombie).map(p => {
              const hasBomb = (room.round_results_data as any)?.potato_bomb_holder === p.id;
              return (
                <div key={p.id} className={`flex flex-col items-center gap-6 transition-all duration-500 ${
                  hasBomb ? 'scale-[1.3] z-20' : 'scale-90 opacity-40 blur-[2px] grayscale'
                }`}>
                  <div className={`relative ${hasBomb ? 'animate-bounce drop-shadow-[0_0_50px_rgba(239,68,68,0.8)]' : ''}`}>
                    <img src={getAvatarUrl(p.avatar, p.lives)} alt={p.name} className="w-40 h-40 object-contain drop-shadow-2xl" />
                    {hasBomb && (
                      <div className="absolute -top-12 -right-12 text-8xl animate-pulse drop-shadow-[0_0_40px_white] z-30 filter contrast-125">
                        💣
                      </div>
                    )}
                  </div>
                  <span className={`text-4xl font-black tracking-tight ${hasBomb ? 'text-red-400 drop-shadow-[0_0_10px_rgba(248,113,113,0.8)] text-white' : 'text-gray-500'}`}>
                    {p.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {room.status === 'potato_result' && (
        <div className="min-h-screen flex flex-col items-center justify-center gap-12 bg-black bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-900/50 via-black to-black p-8 text-center relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-[600px] bg-red-600/20 blur-[150px] rounded-full pointer-events-none mix-blend-screen"></div>

          <h2 className="text-9xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-red-500 to-red-800 drop-shadow-[0_0_60px_rgba(239,68,68,1)] animate-shake uppercase tracking-tighter relative z-10">
            БАБАХ!
          </h2>
          {(() => {
            const loserId = (room.round_results_data as any)?.potato_loser;
            const loser = players.find(p => p.id === loserId);
            if (!loser) return null;
            return (
              <div className="flex flex-col items-center justify-center gap-8 mt-4 relative z-10">
                <div className="relative group">
                  <div className="absolute inset-0 bg-red-600 blur-[60px] opacity-60 rounded-full"></div>
                  <img src={getAvatarUrl(loser.avatar, loser.lives)} alt={loser.name} className="w-64 h-64 object-contain relative z-10 drop-shadow-[0_20px_50px_rgba(0,0,0,0.8)]" />
                </div>
                <div className="text-5xl font-black text-white tracking-tight">
                  Игрок <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400 drop-shadow-[0_0_15px_rgba(248,113,113,0.6)]">{loser.name}</span> взорвался
                </div>
                <div className="text-5xl font-black text-white bg-gradient-to-r from-red-700 to-red-900 border-2 border-red-500 px-12 py-6 rounded-[2.5rem] mt-4 shadow-[0_0_40px_rgba(220,38,38,0.7)] flex items-center gap-4">
                  <span className="text-red-300">💥</span> -1 ЖИЗНЬ <span className="text-red-300">💥</span>
                </div>
              </div>
            );
          })()}
          
          <button onClick={() => advanceAfterBetReveal()} className="px-16 py-6 bg-white text-black hover:bg-gray-200 rounded-full text-3xl font-black mt-8 shadow-[0_0_30px_rgba(255,255,255,0.4)] transition-all duration-300 hover:scale-105 active:scale-95 uppercase tracking-wider relative z-10">
            ПРОДОЛЖИТЬ
          </button>
        </div>
      )}

      {/* ─── BLITZ INTRO ─── */}
      {room.status === 'blitz_intro' && (
        <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-gradient-to-b from-gray-950 to-red-950">
          <h2 className="text-6xl font-black text-red-400 animate-pulse">⚡ БЛИЦ!</h2>
          <p className="text-xl text-gray-300 text-center max-w-lg">
            Забег на выживание! Правильный ответ → +1 клетка. Последний ответивший — штраф!<br />
            🧟 Зомби преследуют — каждый вопрос они идут вперёд.
          </p>
          <button onClick={async () => {
            await setRoomStatus(room.id, 'moving', {
              current_round: room.current_round,
              leader_position: room.leader_position,
              current_mode: 'blitz',
            });
          }} className="px-12 py-5 bg-red-600 hover:bg-red-500 rounded-2xl text-2xl font-black">
            ⚡ ПОГНАЛИ!
          </button>
        </div>
      )}

      {/* ─── FINISHED ─── */}
      {room.status === 'finished' && (
        <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-6">
          <h1 className="text-6xl font-black">🏆 ФИНИШ!</h1>
          <div className="grid gap-3 max-w-lg w-full">
            {ranked.map((p, i) => (
              <div key={p.id} className={`flex items-center gap-4 p-4 rounded-2xl border ${
                i === 0 ? 'border-yellow-400 bg-yellow-900/20' : 'border-gray-700 bg-gray-900'
              }`}>
                <span className="text-2xl">{['🥇','🥈','🥉'][i] ?? `#${i+1}`}</span>
                <img src={getAvatarUrl(p.avatar, p.lives)} alt="" className="w-12 h-12 object-contain" />
                <div>
                  <div className="font-bold">{p.name}</div>
                  <div className="text-sm text-gray-400">Кл.{p.position} · {p.lives}❤️ · {p.karma}✨</div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => router.push('/ctrl-8f2q9z')} className="px-8 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl">
            ← В панель управления
          </button>
        </div>
      )}

      {/* ─── Floating leaderboard sidebar (in-game) ─── */}
      {!['lobby', 'rules', 'finished'].includes(room.status) && (
        <div className="fixed right-4 top-4 bg-gray-900/90 border border-gray-700 rounded-xl p-3 w-48 hidden xl:block">
          <p className="text-xs text-gray-400 font-bold mb-2">РЕЙТИНГ</p>
          {ranked.map((p, i) => (
            <div key={p.id} className="flex items-center gap-1 mb-1 text-xs">
              <span className="text-gray-500 w-4">#{i+1}</span>
              <img src={getAvatarUrl(p.avatar, p.lives)} alt="" className="w-5 h-5 object-contain" />
              <span className="flex-1 truncate">{p.name}</span>
              <span className="text-gray-400">{p.position}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
