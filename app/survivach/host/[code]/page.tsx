// app/survivach/host/[code]/page.tsx
// Экран ведущего «Выживач»
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { QRCodeCanvas } from 'qrcode.react';
import {
  fetchRoomByCode,
  fetchRoomById,
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
  clearAnswers,
} from '@/lib/survivach/api';
import { supabase } from '@/lib/supabase';
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
  ZOMBIE_WON_POOL,
  MODE_AUDIO,
  DUEL_AUDIO,
  LAUGH_POOL,
  SCREAM_POOL,
  HOT_POTATO_START_POOL,
  HOT_POTATO_FAIL_POOL,
  HOT_POTATO_FAIL_Z_POOL,
  BLITZ_THEME,
  BLITZ_START_POOL,
  BLITZ_CHANGE_LEADER_POOL,
  randomFromPool,
  POOL_COUNTS,
  MEET_POOL,
  randomMeetFile,
} from '@/lib/survivach/audio';
import type {
  SurvivachRoom,
  SurvivachPlayer,
  SurvivachAnswer,
  SurvivachBet,
  SurvivachDuel,
  SurvivachPack,
  RoundMode,
  DuelMode,
  PlayerRoundResult,
  RoundResultsData,
  BetResultsData,
  MathProblem,
  InterpreterQuestion,
} from '@/lib/survivach/types';

const MIN_PLAYERS = 4;

const LANG_NAMES: Record<string, string> = {
  ru: '🇷🇺 Русский', en: '🇬🇧 Английский', ja: '🇯🇵 Японский',
  zh: '🇨🇳 Китайский', ko: '🇰🇷 Корейский', hi: '🇮🇳 Хинди',
  fa: '🇮🇷 Фарси', km: '🇰🇭 Кхмерский', tyv: '🏔️ Тувинский',
};

/* ─── Scoring helpers ─── */
function calcPositionChange(isCorrect: boolean, isFirst: boolean, isZombie: boolean): number {
  if (isZombie) return 1; // zombies always +1
  if (!isCorrect) return 0;
  return isFirst ? 2 : 1;
}

/** Shuffle options array and return new array + updated correct index */
function shuffleOptions(options: string[], correctIndex: number): { options: string[]; correct: number } {
  const indexed = options.map((o, i) => ({ o, i }));
  for (let j = indexed.length - 1; j > 0; j--) {
    const k = Math.floor(Math.random() * (j + 1));
    [indexed[j], indexed[k]] = [indexed[k], indexed[j]];
  }
  return { options: indexed.map(x => x.o), correct: indexed.findIndex(x => x.i === correctIndex) };
}

function checkTextAnswer(input: string, acceptList: string[]): boolean {
  const norm = (s: string) => s.toLowerCase().trim();
  const ni = norm(input);
  return acceptList.some(a => norm(a) === ni);
}

/* ─── Board mini-view ─── */
function BoardView({ players, leaderPosition }: { players: SurvivachPlayer[]; leaderPosition: number }) {
  const COLS = 13;
  const ROWS = 2;
  const cells = Array.from({ length: TOTAL_CELLS }, (_, i) => i + 1);

  const getCellPos = (cell: number) => {
    const isTop = cell <= COLS;
    const col = isTop ? cell - 1 : (COLS * 2) - cell;
    const row = isTop ? 0 : 1;
    return { col, row };
  };

  // Group players by cell to offset them visually and prevent overlap
  const playersByCell = players.reduce((acc, p) => {
    if (!acc[p.position]) acc[p.position] = [];
    acc[p.position].push(p);
    return acc;
  }, {} as Record<number, SurvivachPlayer[]>);

  return (
    <div className="relative w-full bg-[#080211] rounded-[2rem] border min-h-[140px] md:border-0 border-white/5 shadow-[0_0_80px_rgba(0,0,0,0.9)] overflow-hidden p-2 md:p-8 max-w-[1500px] mx-auto my-2 isolate backdrop-blur-xl">
      {/* Multi-layered Atmospheric Effects */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_50%_-20%,_rgba(125,46,255,0.15),_transparent_60%)] mix-blend-screen" />
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_120%,_rgba(255,40,40,0.2),_transparent_70%)] mix-blend-screen" />
      <div className="absolute bottom-0 w-full h-[60%] bg-gradient-to-t from-[#000000]/60 to-transparent pointer-events-none" />
      <div className="absolute top-0 w-full h-[50%] bg-gradient-to-b from-[#0c0418]/60 to-transparent pointer-events-none" />

      {/* Grid Container Base */}
      <div className="relative w-full aspect-[4/1] md:aspect-[13/2.2] z-10">
        {/* GLASS CELLS */}
        {cells.map(cell => {
          const pos = getCellPos(cell);
          const mode = getModeForCell(cell);
          const isLeader = cell === leaderPosition;
          const isBlitz = cell >= BLITZ_START;
          
          return (
            <div
              key={`cell-${cell}`}
              className="absolute p-[2px] md:p-1.5 transition-all duration-500 will-change-transform"
              style={{
                left: `${(pos.col / COLS) * 100}%`,
                top: `${(pos.row / ROWS) * 100}%`,
                width: `${100 / COLS}%`,
                height: `${100 / ROWS}%`,
              }}
            >
              <div className={`relative w-full h-full rounded-md md:rounded-xl backdrop-blur-sm border border-white/10 flex flex-col items-center justify-center transition-all overflow-hidden ${
                isLeader ? 'shadow-[0_0_30px_#facc15,inset_0_0_20px_rgba(250,204,21,0.3)] bg-white/10 z-10 ring-1 ring-yellow-400/50 scale-[1.05] animate-[pulse_2s_ease-in-out_infinite]' : 
                isBlitz ? 'shadow-[inset_0_0_15px_rgba(220,38,38,0.2)] bg-red-900/10' : 
                'shadow-[inset_0_0_10px_rgba(255,255,255,0.05)] bg-white/5 saturate-[1.2]'
              }`}
              >
                {/* Gloss Reflection overlay */}
                <div className="absolute inset-0 pointer-events-none rounded-inherit bg-gradient-to-br from-white/10 to-transparent mix-blend-overlay"></div>
                <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-white/5 to-transparent pointer-events-none skew-x-[-20deg] mix-blend-overlay"></div>

                <span className="absolute top-1 left-1 text-[8px] md:text-sm font-black text-white/30 z-10 drop-shadow-md">{cell}</span>
                {isBlitz ? (
                  <div className="text-red-500/80 text-xl md:text-3xl font-black opacity-80 animate-[pulse_1s_ease-in-out_infinite] z-10 drop-shadow-[0_0_10px_#ef4444]">⚡</div>
                ) : (
                  <div className="text-[7px] md:text-[11px] font-black uppercase text-center opacity-80 leading-tight px-1 z-10 break-words drop-shadow-[0_2px_4px_rgba(0,0,0,1)] tracking-wider" style={{ color: MODE_COLORS[mode as RoundMode] }}>
                    {MODE_LABELS[mode as RoundMode]?.split(' ')[0]}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* OVERLAY PLAYERS with smooth path transition */}
        {players.map(p => {
          const pos = getCellPos(p.position);
          
          // Slight offset if multiple players are on the same cell
          const siblings = playersByCell[p.position] || [];
          const idx = siblings.findIndex(s => s.id === p.id);
          const total = siblings.length;
          
          const baseX = (pos.col / COLS) * 100 + (100 / COLS / 2);
          const baseY = (pos.row / ROWS) * 100 + (100 / ROWS / 2);
          
          const offsetX = total > 1 ? (idx % 2 === 0 ? -12 : 12) + (Math.floor(idx/2) * 5) : 0;
          const offsetY = total > 1 ? (idx < 2 ? -8 : 12) : 0;

          // Compute custom animation delay based on id or idx to desync floats
          const floatDelay = `${(idx * 0.3) % 2}s`;

          return (
            <div
              key={p.id}
              className="absolute z-20 transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)] transform -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `calc(${baseX}% + ${offsetX}px)`,
                top: `calc(${baseY}% + ${offsetY}px)`,
              }}
            >
              <div 
                className={`relative group drop-shadow-[0_15px_15px_rgba(0,0,0,0.8)] filter transition-all duration-500 will-change-transform ${p?.is_zombie ? 'animate-[bounce_3s_ease-in-out_infinite]' : 'animate-[float_4s_ease-in-out_infinite]'}`}
                style={{ animationDelay: floatDelay }}
              >
                {/* Glow behind the avatar for zombies/high karma */}
                {p.is_zombie && <div className="absolute inset-0 bg-green-500 blur-xl opacity-40 rounded-full scale-110 pointer-events-none mix-blend-screen" />}
                {p.karma >= 3 && !p.is_zombie && <div className="absolute inset-0 bg-yellow-400 blur-xl opacity-30 rounded-full scale-125 pointer-events-none mix-blend-screen" />}

                <img
                  src={getAvatarUrl(p.avatar, p.lives)}
                  alt={p.name}
                  className={`w-10 h-10 md:w-16 md:h-16 object-contain pointer-events-none transition-transform duration-300 drop-shadow-[0_0_10px_rgba(255,255,255,0.1)] ${p.is_zombie ? 'saturate-[1.5] brightness-125 hue-rotate-[130deg]' : ''}`}
                />
                
                {/* Status badges */}
                {p.is_zombie && <div className="absolute -top-2 -right-2 text-sm md:text-xl drop-shadow-[0_0_8px_#22c55e]">🧟</div>}
                
                {/* Player Name */}
                <div className="absolute -bottom-4 md:-bottom-6 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-full text-[8px] md:text-[11px] font-bold text-white/90 whitespace-nowrap border border-white/20 shadow-[0_4px_15px_rgba(0,0,0,1)] tracking-wide">
                  {p.name.length > 7 ? p.name.substring(0,6) + '…' : p.name}
                </div>
              </div>
            </div>
          );
        })}
      </div>
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
    <div className={`group flex items-center gap-3 rounded-xl p-2.5 border transition-all duration-300 backdrop-blur-md ${
      player.is_zombie 
        ? 'border-green-400/30 bg-green-950/30 shadow-[0_0_15px_rgba(74,222,128,0.1)] hover:shadow-[0_0_20px_rgba(74,222,128,0.2)] hover:border-green-400/50' 
        : 'border-white/10 bg-white/5 shadow-[0_4px_15px_rgba(0,0,0,0.5)] hover:bg-white/10 hover:border-white/20'
    }`}>
      <span className="text-white/40 text-xs font-black font-mono w-4 drop-shadow-sm">#{rank}</span>
      
      <div className="relative">
        <img 
          src={getAvatarUrl(player.avatar, player.lives)} 
          alt="" 
          className={`w-10 h-10 object-contain drop-shadow-md transition-transform duration-300 group-hover:scale-110 ${player.is_zombie ? 'saturate-[1.5] hue-rotate-[130deg]' : ''}`} 
        />
        {player.is_zombie && <div className="absolute inset-0 bg-green-500/20 blur-md rounded-full -z-10 mix-blend-screen" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className={`font-black text-sm truncate tracking-wide ${player.is_zombie ? 'text-green-300' : 'text-white/90'}`}>
          {player.name}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs">
          <span className="bg-black/40 px-1.5 py-0.5 rounded text-white/70 font-mono font-bold">📍{player.position}</span>
          <span className="text-[10px] tracking-widest drop-shadow-[0_0_3px_rgba(248,113,113,0.8)]">
            {'❤️'.repeat(player.lives)}{'🖤'.repeat(Math.max(0, 3 - player.lives))}
          </span>
        </div>
      </div>

      {showKarma && (
        <div className="flex flex-col items-end justify-center min-w-[24px]">
          <div className={`font-black text-sm px-2 py-0.5 rounded-md border ${
            player.karma >= 3 
              ? 'bg-yellow-400/20 text-yellow-300 border-yellow-400/40 shadow-[0_0_10px_rgba(250,204,21,0.3)] animate-pulse' 
              : 'bg-black/30 text-white/50 border-white/10'
          }`}>
            ✨{player.karma}
          </div>
          {player.is_zombie && <div className="mt-1 text-[12px] drop-shadow-[0_0_5px_rgba(74,222,128,0.8)]">🧟</div>}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════
   Ghost Component
   ══════════════════════════════════════════ */
function GhostAnim({ p }: { p: { id: string, name: string, avatar: string, key?: number } }) {
  const [done, setDone] = useState(false);
  const [params] = useState(() => ({
    x: Math.random() * 600 - 300,
    delay: Math.random() * 1 // initial randomized delay
  }));

  if (done) return null;

  return (
    <div 
      className="absolute bottom-[10vh] left-1/2 -translate-x-1/2 flex flex-col items-center ghost-anim will-change-transform pointer-events-none"
      style={{ marginLeft: `${params.x}px`, animationDelay: `${params.delay}s` }}
      onAnimationEnd={() => setDone(true)}
    >
      <div className="relative">
         <div className="absolute inset-0 bg-purple-500 blur-[30px] rounded-full opacity-60 mix-blend-screen scale-150" />
         <img src={getAvatarUrl(p.avatar, 3)} alt={p.name} className="w-40 h-40 object-contain drop-shadow-[0_0_30px_#d8b4fe] brightness-125 saturate-50 opacity-90 animate-[float_3s_ease-in-out_infinite]" />
      </div>
      <span className="mt-4 text-2xl font-black text-purple-100 drop-shadow-[0_0_15px_#c084fc] tracking-widest uppercase bg-purple-950/40 px-6 py-1.5 rounded-full border border-purple-500/30 backdrop-blur-md">{p.name}</span>
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
  const [selectedRule, setSelectedRule] = useState<string | null>(null);
  const [roundResultsData, setRoundResultsData] = useState<PlayerRoundResult[]>([]);
  const [betResultsData, setBetResultsData] = useState<BetResultsData | null>(null);
  const [duelQ, setDuelQ] = useState<Record<string, unknown> | null>(null);
  
  /* ─── Testing mode ─── */
  const [testMode, setTestMode] = useState<'select' | RoundMode | 'hot_potato' | DuelMode | null>(null);
  const [testBomb, setTestBomb] = useState(false);

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
  const laughedAnswerIds = useRef(new Set<string>());
  const isProcessingResultsRef = useRef(false);
  const potatoExplosionInProgressRef = useRef(false);

  /* ─── Blitz state ─── */
  const blitzTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usedBlitzQIds = useRef<Set<number>>(new Set());
  const blitzQBankRef = useRef<Array<{ id: number; question: string; options: string[]; correct_index: number }> | null>(null);

  /* ─── Lobby logic & Ghosts ─── */
  const [ghosts, setGhosts] = useState<{ id: string, name: string, avatar: string, key: number }[]>([]);
  const prevPlayers = useRef<SurvivachPlayer[]>([]);
  const [showZombieHand, setShowZombieHand] = useState(false);
  const meetAudioPlayer = useRef<SurvivachAudio | null>(null);

  useEffect(() => {
    if (room?.status !== 'lobby') return;

    if (!meetAudioPlayer.current) {
       meetAudioPlayer.current = new SurvivachAudio();
       meetAudioPlayer.current.play(randomMeetFile(), false);
    }

    const nonHost = players.filter(p => !p.is_host);
    if (nonHost.length > prevPlayers.current.length) {
      // New player joined! Map sound to their avatar duck number, fallback to random duck1..12
      const newPlayers = nonHost.filter(p => !prevPlayers.current.some(old => old.id === p.id));
      newPlayers.forEach(np => {
         const avatarDuckNum = np.avatar.replace(/\D/g, ''); // extracts number from "duck5" -> "5"
         const duckNum = avatarDuckNum || (Math.floor(Math.random() * 12) + 1);
         const cSound = new Audio(`https://storage.yandexcloud.net/vecherinkach/json/survivach/connect/duck${duckNum}.mp3`);
         cSound.play().catch(e => console.error('Connection sound blocked:', e));
      });
    }
    prevPlayers.current = nonHost;
  }, [players, room?.status]);

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
      // In blitz, keep the blitz BGM playing (started in blitz_intro); don't restart timer music
      if (room.current_mode !== 'blitz') {
        const pool = randomFromPool(TIMER_POOL, 5);
        bgAudio.current.play(pool, true);
      }
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
        bgAudio.current.play(randomFromPool(pool, 3), false);
      }
    }

    if (st === 'duel_playing') {
      if (duel?.mode) {
        const pool = duel.mode === 'minesweeper'
          ? DUEL_AUDIO.minesweeper.duelists
          : duel.mode === 'arithmetic_mean'
          ? DUEL_AUDIO.arithmetic_mean.duelists
          : DUEL_AUDIO.crowd_forecast.duelists;
        bgAudio.current.play(randomFromPool(pool, 3), false);
      }
    }

    return () => {
      clearInterval(timerRef.current!);
      clearInterval(moveTimerRef.current!);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.status]);

  /* ─── Real-time laugh on correct answer ─── */
  useEffect(() => {
    if (room?.status !== 'round_playing') return;
    answers.forEach(ans => {
      if (ans.is_correct && !laughedAnswerIds.current.has(ans.id)) {
        laughedAnswerIds.current.add(ans.id);
        new Audio(randomFromPool(LAUGH_POOL, 5)).play().catch(() => {});
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, room?.status]);

  /* ─── Reset laugh tracking on new round ─── */
  useEffect(() => {
    laughedAnswerIds.current.clear();
  }, [room?.current_round]);

  /* ─── Auto-advance: all non-host players answered (or all but one in Blitz) ─── */
  useEffect(() => {
    if (room?.status !== 'round_playing') return;
    // SKIP auto-advance in test mode
    if (room.current_round === 999) return;
    
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
  }, [answers.length, room?.status, room?.current_mode, room?.current_round]);

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
    if (duel.mode === 'arithmetic_mean') {
      const dd = duel.duel_data as { player_guesses?: Record<string, number>; average?: number | null } | null;
      const nonDuelists = players.filter(
        p => !p.is_host && p.id !== duel.challenger_id && p.id !== duel.challenged_id
      );
      const guessCount = Object.keys(dd?.player_guesses ?? {}).length;
      if (nonDuelists.length > 0 && guessCount >= nonDuelists.length && dd?.average == null) {
        const vals = Object.values(dd!.player_guesses!).map(Number);
        const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
        const updatedData = { ...dd, average: avg };
        updateDuel(duel.id, { duel_data: updatedData as unknown as import('@/lib/survivach/types').DuelData })
          .then(() => setRoomStatus(room.id, 'duel_playing', {}));
      }
    }
    if (duel.mode === 'crowd_forecast') {
      const dd = duel.duel_data as { player_votes?: Record<string, number>; majority_index?: number | null } | null;
      const nonDuelists = players.filter(
        p => !p.is_host && p.id !== duel.challenger_id && p.id !== duel.challenged_id
      );
      const voteCount = Object.keys(dd?.player_votes ?? {}).length;
      if (nonDuelists.length > 0 && voteCount >= nonDuelists.length && dd?.majority_index == null) {
        const votes = Object.values(dd!.player_votes!);
        const tally: Record<number, number> = {};
        votes.forEach(v => { tally[v] = (tally[v] ?? 0) + 1; });
        const sortedEntries = Object.entries(tally).sort((a, b) => b[1] - a[1]);
        const maxVoteCount = sortedEntries[0][1];
        const tiedOptions = sortedEntries.filter(e => e[1] === maxVoteCount);
        // -1 means a tie in votes (no clear majority) → will result in a draw
        const majorityIndex = tiedOptions.length === 1 ? parseInt(sortedEntries[0][0]) : -1;
        const updatedData = { ...dd, majority_index: majorityIndex };
        updateDuel(duel.id, { duel_data: updatedData as unknown as import('@/lib/survivach/types').DuelData })
          .then(() => setRoomStatus(room.id, 'duel_playing', {}));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel?.duel_data, room?.status]);

  /* ─── Auto-determine minesweeper winner ─── */
  useEffect(() => {
    if (room?.status !== 'duel_playing' || !duel || duel.mode !== 'minesweeper') return;
    const dd = duel.duel_data as { mined_tiles?: Record<string, number[]>; challenger_picks?: number[]; challenged_picks?: number[]; exploded_challenger?: boolean; exploded_challenged?: boolean } | null;
    const challengerPicks = dd?.challenger_picks ?? [];
    const challengedPicks = dd?.challenged_picks ?? [];
    
    // Wait for both to pick
    if (challengerPicks.length === 0 || challengedPicks.length === 0) return;
    
    const allMines = Object.values(dd?.mined_tiles ?? {}).flat();
    const challengerHitMine = challengerPicks.some(pick => allMines.includes(pick));
    const challengedHitMine = challengedPicks.some(pick => allMines.includes(pick));
    
    // Determine winner
    let winnerId: string | null = null;
    if (challengerHitMine && challengedHitMine) {
      winnerId = null; // Both hit mine = draw
    } else if (challengerHitMine) {
      winnerId = duel.challenged_id; // Challenger hit mine = challenged wins
    } else if (challengedHitMine) {
      winnerId = duel.challenger_id; // Challenged hit mine = challenger wins
    } else {
      winnerId = null; // Neither hit mine = draw
    }
    
    // Auto-advance to result after a short delay
    // Play scream if a live player hit a mine
    const challengerPlayer = players.find(p => p.id === duel.challenger_id);
    const challengedPlayer = players.find(p => p.id === duel.challenged_id);
    if ((challengerHitMine && !challengerPlayer?.is_zombie) || (challengedHitMine && !challengedPlayer?.is_zombie)) {
      new Audio(randomFromPool(SCREAM_POOL, 3)).play().catch(() => {});
    }

    setTimeout(() => {
      handleDuelResult(winnerId);
    }, 2000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel?.duel_data, room?.status]);

  /* ─── Auto-determine arithmetic_mean winner ─── */
  useEffect(() => {
    if (room?.status !== 'duel_playing' || !duel || duel.mode !== 'arithmetic_mean') return;
    const dd = duel.duel_data as { average?: number | null; challenger_answer?: number | null; challenged_answer?: number | null } | null;
    if (dd?.challenger_answer == null || dd?.challenged_answer == null) return;
    const avg = dd.average ?? 0;
    const challengerDiff = Math.abs(dd.challenger_answer - avg);
    const challengedDiff = Math.abs(dd.challenged_answer - avg);
    let winnerId: string | null = null;
    if (challengerDiff < challengedDiff) winnerId = duel.challenger_id;
    else if (challengedDiff < challengerDiff) winnerId = duel.challenged_id;
    // else draw
    setTimeout(() => {
      handleDuelResult(winnerId);
    }, 2000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel?.duel_data, room?.status]);

  /* ─── Auto-determine crowd_forecast winner ─── */
  useEffect(() => {
    if (room?.status !== 'duel_playing' || !duel || duel.mode !== 'crowd_forecast') return;
    const dd = duel.duel_data as { majority_index?: number | null; challenger_prediction?: number | null; challenged_prediction?: number | null } | null;
    if (dd?.challenger_prediction == null || dd?.challenged_prediction == null) return;
    const maj = dd.majority_index ?? -1;
    const challRight = dd.challenger_prediction === maj;
    const chaledRight = dd.challenged_prediction === maj;
    let winnerId: string | null = null;
    if (challRight && !chaledRight) winnerId = duel.challenger_id;
    else if (chaledRight && !challRight) winnerId = duel.challenged_id;
    // else draw (both right or both wrong)
    setTimeout(() => {
      handleDuelResult(winnerId);
    }, 2000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel?.duel_data, room?.status]);

  /* ─── Hot Potato intro audio ─── */
  useEffect(() => {
    if (room?.status === 'potato_intro') {
      const roomId = room.id;
      const rd = room.round_results_data as any;
      bgAudio.current.play(randomFromPool(HOT_POTATO_START_POOL, 3), false, async () => {
        await setRoomStatus(roomId, 'potato_playing', {
          round_results_data: { ...rd, potato_started_at: Date.now() },
        });
      });
      return () => bgAudio.current.stop();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.status]);

  /* ─── Hot Potato logic ─── */
  useEffect(() => {
    if (room?.status !== 'potato_playing') {
      potatoExplosionInProgressRef.current = false;
    }
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
    if (potatoExplosionInProgressRef.current) return;
    potatoExplosionInProgressRef.current = true;
    try {
      const rd = room.round_results_data as any;
      
      // Penalty by spec:
      // - Alive loser: -1 life and move 1 cell back
      // - Zombie loser: -1 life only, stays in place
      const p = players.find(x => x.id === loserId);
      const isZombie = p?.is_zombie ?? false;
      if (p) {
        const newLives = Math.max(0, p.lives - 1);
        const newPosition = isZombie ? p.position : Math.max(1, p.position - 1);
        await updatePlayers([{
          id: p.id,
          position: newPosition,
          lives: newLives,
          is_zombie: newLives === 0 || isZombie,
        }]);
      }

      await setRoomStatus(room.id, 'potato_result', {
        round_results_data: {
          ...rd,
          potato_loser: loserId,
        }
      });

      // Play fail audio, then auto-advance
      const failPool = isZombie ? HOT_POTATO_FAIL_Z_POOL : HOT_POTATO_FAIL_POOL;
      bgAudio.current.play(randomFromPool(failPool, 3), false, () => {
        potatoExplosionInProgressRef.current = false;
        advanceAfterBetReveal();
      });
    } catch (error) {
      potatoExplosionInProgressRef.current = false;
      throw error;
    }
  };

  /* ══════════════════════════════════════════
     State transition handlers
     ══════════════════════════════════════════ */

  const handleStartGame = async () => {
    if (!room) return;
    setShowZombieHand(true);
    
    // Play zombie hand sound if exists, or connect sound for effect
    fxAudio.current.play('https://storage.yandexcloud.net/vecherinkach/json/survivach/lobby/zombie_hand.mp3', false);

    // Wait for the zombie hand animation to finish
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    bgAudio.current.stop();
    await setRoomStatus(room.id, 'rules', {});
    bgAudio.current.play(RULES_MUSIC);
    // Note: If voiceover file doesn't exist, this callback will never fire and game hangs on Rules screen.
    // Allow user to manually skip rules instead of hanging indefinitely if fetching audio fails.
    fxAudio.current.play(randomFromPool(RULES_VO_POOL, 3), false, skipRulesFlow);
  };

  const skipRulesFlow = useCallback(() => {
    if (room?.status !== 'rules') return;
    fxAudio.current.stop();
    bgAudio.current.stop();
    setRoomStatus(room.id, 'moving', {
      current_round: 1,
      leader_position: 1,
    });
  }, [room?.status, room?.id]);

  const startTestMode = useCallback(async (mode: RoundMode | 'hot_potato' | DuelMode, withBomb = false) => {
    if (!room || !pack) return;
    
    fxAudio.current.stop();
    bgAudio.current.stop();

    // Handle Hot Potato
    if (mode === 'hot_potato') {
      const nonHostPlayers = players.filter(p => !p.is_host);
      if (nonHostPlayers.length === 0) {
        alert('Нужен хотя бы один игрок для тестирования');
        return;
      }
      const holderIndex = Math.floor(Math.random() * nonHostPlayers.length);
      await setRoomStatus(room.id, 'potato_intro', {
        current_mode: null,
        question_data: { holder_id: nonHostPlayers[holderIndex].id },
      });
      return;
    }

    // Handle Duels
    if (mode === 'minesweeper' || mode === 'arithmetic_mean' || mode === 'crowd_forecast') {
      const nonHostPlayers = players.filter(p => !p.is_host);
      if (nonHostPlayers.length < 2) {
        alert('Нужно минимум 2 игрока для тестирования дуэли');
        return;
      }
      // Pick two random players for test duel
      const caller = nonHostPlayers[0];
      const summoned = nonHostPlayers[1];
      
      // Create minimal duel data for test
      let duelData: any;
      if (mode === 'minesweeper') {
        duelData = {
          mode: 'minesweeper',
          tile_count: nonHostPlayers.length + 2,
          mined_tiles: {},
          challenger_picks: [],
          challenged_picks: [],
          exploded_challenger: false,
          exploded_challenged: false,
        };
      } else {
        // Load question from JSON for arithmetic_mean / crowd_forecast
        const duelQuestions = await loadDuelQuestions('https://storage.yandexcloud.net/vecherinkach/json/survivach', mode as 'arithmetic_mean' | 'crowd_forecast');
        if (mode === 'arithmetic_mean') {
          const list = (duelQuestions as { questions: unknown[] })?.questions ?? [];
          const q = list[Math.floor(Math.random() * list.length)] as Record<string, unknown>;
          duelData = {
            mode: 'arithmetic_mean',
            question: q?.question ?? 'Тестовый вопрос',
            player_guesses: {},
            average: null,
            challenger_answer: null,
            challenged_answer: null,
          };
        } else {
          const list = (duelQuestions as { questions: unknown[] })?.questions ?? [];
          const q = list[Math.floor(Math.random() * list.length)] as Record<string, unknown>;
          duelData = {
            mode: 'crowd_forecast',
            question: q?.question ?? 'Тестовый вопрос',
            options: (q?.options as string[]) ?? ['Вариант 1', 'Вариант 2'],
            player_votes: {},
            majority_index: null,
            challenger_prediction: null,
            challenged_prediction: null,
          };
        }
      }
      
      await createDuel(
        room.id,
        999, // Test round marker
        mode,
        caller.id,
        summoned.id,
        duelData
      );
      
      await setRoomStatus(room.id, 'duel_intro', {
        current_mode: null,
      });
      return;
    }

    // Handle Question Modes
    let questionData: Record<string, unknown> = {};
    
    if (mode === 'umnik') {
      const qBank = await loadPackQuestions(pack.base_url, mode);
      const list: unknown[] = (qBank as { umnik?: { questions: unknown[] } })?.umnik?.questions ?? [];
      const q = list[Math.floor(Math.random() * list.length)];
      if (q) {
        const typedQ = q as { id: string; question: string; options: string[]; extra_options?: string[]; correct: number };
        const rawOpts = withBomb && typedQ.extra_options ? [...typedQ.options, ...typedQ.extra_options] : typedQ.options;
        const { options: opts, correct } = shuffleOptions(rawOpts, typedQ.correct);
        questionData = { mode: 'umnik', id: typedQ.id, question: typedQ.question, options: opts, correct };
      }
    } else if (mode === 'mathematician') {
      const problems = generateMathProblems(withBomb);
      setMathProblems(problems);
      questionData = { mode: 'mathematician', problems };
    } else if (mode === 'art_historian') {
      const qBank = await loadPackQuestions(pack.base_url, mode);
      const list = (qBank as { questions: unknown[] })?.questions ?? [];
      const q = list[Math.floor(Math.random() * list.length)];
      if (q) {
        questionData = { ...(q as Record<string, unknown>), mode: 'art_historian' };
      }
    } else if (mode === 'interpreter') {
      const qBank = await loadPackQuestions(pack.base_url, mode);
      const list = (qBank as { questions: unknown[] })?.questions ?? [];
      const q = list[Math.floor(Math.random() * list.length)];
      if (q) {
        const qRecord = q as Record<string, unknown>;
        if (withBomb) {
          const bombAccept = (qRecord.zombie_bomb_mode as { accept_only?: string[] })?.accept_only ?? [qRecord.primary_answer as string];
          questionData = { ...qRecord, mode: 'interpreter', accept_answer: bombAccept };
        } else {
          questionData = { ...qRecord, mode: 'interpreter' };
        }
      }
    } else if (mode === 'memory_diary') {
      const seqLen = withBomb ? 7 : 5;
      const seq = generateColorSequence(seqLen);
      setColorSequence(seq);
      questionData = { mode: 'memory_diary', sequence: seq, show_duration_ms: 10000 };
    } else if (mode === 'tag_puzzle') {
      const size = withBomb ? 4 : 3;
      const state = scramblePuzzle(size);
      setPuzzleState(state);
      questionData = { mode: 'tag_puzzle', size, initial_state: state };
    }

    // Set current question in local state so host screen can display it
    setCurrentQ(questionData);

    // Clear stale answers from previous test rounds (all use round=999)
    await clearAnswers(room.id, 999);

    await setRoomStatus(room.id, 'round_playing', {
      current_mode: mode as RoundMode,
      current_round: 999, // Test round marker
      question_data: questionData,
      timer_started_at: new Date().toISOString(),
      timer_duration_sec: mode === 'mathematician' ? 60 : mode === 'tag_puzzle' ? 120 : 30,
      zombie_bomb_active: withBomb,
    });
  }, [room, pack, players]);


  const handleMoveAnimDone = useCallback(async () => {
    if (!room || !pack) return;
    bgAudio.current.stop();

    const gamePlayers = await fetchPlayers(room.id);
    const leaderPos = getLeaderPosition(gamePlayers.filter(p => !p.is_host));
    const mode = getModeForCell(leaderPos, pack.cell_sequence);

    // Prepare question data based on mode
    let questionData: Record<string, unknown> = {};

    if (mode === 'umnik' || mode === 'blitz') {
      const qBank = questions ?? (mode === "blitz" ? await loadPackQuestions("https://storage.yandexcloud.net/vecherinkach/json/survivach", "blitz") : await loadPackQuestions(pack.base_url, mode));
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
          const rawOpts = room.zombie_bomb_active && typedQ.extra_options
            ? [...typedQ.options, ...typedQ.extra_options]
            : typedQ.options;
          const { options: opts, correct } = shuffleOptions(rawOpts, typedQ.correct);
          questionData = { mode: 'umnik', id: typedQ.id, question: typedQ.question, options: opts, correct };
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
        const qRecord = q as Record<string, unknown>;
        if (room.zombie_bomb_active) {
          const bombAccept = (qRecord.zombie_bomb_mode as { accept_only?: string[] })?.accept_only ?? [qRecord.primary_answer as string];
          questionData = { ...qRecord, mode: 'interpreter', accept_answer: bombAccept };
        } else {
          questionData = { ...qRecord, mode: 'interpreter' };
        }
      }
    } else if (mode === 'mathematician') {
      const problems = generateMathProblems(room.zombie_bomb_active);
      setMathProblems(problems);
      questionData = { mode: 'mathematician', problems, timer_sec: 60 };
    } else if (mode === 'memory_diary') {
      const seqLen = room.zombie_bomb_active ? 7 : 5;
      const seq = generateColorSequence(seqLen);
      setColorSequence(seq);
      questionData = { mode: 'memory_diary', sequence: seq, show_duration_ms: 10000 };
    } else if (mode === 'tag_puzzle') {
      const size = room.zombie_bomb_active ? 4 : 3;
      const state = scramblePuzzle(size);
      setPuzzleState(state);
      questionData = { mode: 'tag_puzzle', size, initial_state: state };
    }

    const timerSec = mode === 'mathematician' ? 60 : mode === 'tag_puzzle' ? 120 : 30;

    await setRoomStatus(room.id, 'round_intro', {
      current_mode: mode,
      leader_position: leaderPos,
      question_data: questionData,
      timer_duration_sec: timerSec,
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
    // BLITZ FIX: не останавливаем музыку в блиц-режиме
    if (room.current_mode !== 'blitz') {
      bgAudio.current.stop();
    }
    await processRoundResults();
  }, [room, answers, bets, players]);

  const processRoundResults = async () => {
    if (!room) return;
    if (isProcessingResultsRef.current) return; // prevent double-call from timer + all-answers effect
    isProcessingResultsRef.current = true;
    const mode = room.current_mode;
    if (!mode) { isProcessingResultsRef.current = false; return; }

    // FIX STAGE 1: Explicitly fetch final answers to prevent race condition
    const finalAnswers = await fetchAnswers(room.id, room.current_round);
    
    const nonHostPlayers = players.filter(p => !p.is_host);
    const results: PlayerRoundResult[] = [];
    let firstCorrectFound = false;
    let blitzSlowPlayerId: string | null = null;

    // We store old leader for blitz calculations
    const alivePlayers = nonHostPlayers.filter(p => !p.is_zombie);
    const oldLeader = alivePlayers.sort((a, b) => b.position - a.position)[0];

    // Special case: mathematician — rank by correct count then by answer speed
    if (mode === 'mathematician') {
      const sorted = [...nonHostPlayers].sort((a, b) => {
        const aa = finalAnswers.find(x => x.player_id === a.id);
        const bb = finalAnswers.find(x => x.player_id === b.id);
        const ca = (aa?.answer_data as { correct_count?: number })?.correct_count ?? 0;
        const cb = (bb?.answer_data as { correct_count?: number })?.correct_count ?? 0;
        if (cb !== ca) return cb - ca;
        // Tiebreaker: faster answer time wins
        return (aa?.answer_time_ms ?? Infinity) - (bb?.answer_time_ms ?? Infinity);
      });

      const aliveSorted = sorted.filter(p => !p.is_zombie);
      const mathWinner = aliveSorted[0] ?? null;
      const mathLoser = aliveSorted.length > 1 ? aliveSorted[aliveSorted.length - 1] : null;

      for (const p of nonHostPlayers) {
        const ans = finalAnswers.find(x => x.player_id === p.id);
        const cc = (ans?.answer_data as { correct_count?: number })?.correct_count ?? 0;
        let posChange = 1;
        let livesChange = 0;
        if (p.is_zombie) {
          posChange = 1;
        } else if (mathWinner && p.id === mathWinner.id) {
          posChange = 2;
        } else if (mathLoser && p.id === mathLoser.id) {
          posChange = 0; livesChange = -1;
        }
        const newPos = Math.min(TOTAL_CELLS, p.position + posChange);
        const newLives = Math.max(0, p.lives + livesChange);
        const isCorr = cc > 0;
        const mNewStreak = isCorr && !p.is_zombie ? p.correct_streak + 1 : 0;
        const mKarmaGain = !p.is_zombie && mNewStreak >= 3 ? 1 : 0;
        const willBeZombie = newLives === 0 || p.is_zombie;
        results.push({
          player_id: p.id,
          is_correct: isCorr,
          was_first: false,
          position_change: posChange,
          lives_change: livesChange,
          karma_change: mKarmaGain,
          new_position: newPos,
          new_lives: newLives,
          new_karma: p.karma + mKarmaGain,
          is_zombie_now: willBeZombie,
          new_streak: willBeZombie ? 0 : mNewStreak,
          new_total_correct: p.total_correct + (isCorr ? 1 : 0),
          new_total_time_ms: p.total_answer_time_ms + (ans?.answer_time_ms ?? 0),
        });
      }
    } else if (mode === 'blitz') {
      const sortedAnswers = [...finalAnswers].sort((a, b) => new Date(a.submitted_at || 0).getTime() - new Date(b.submitted_at || 0).getTime());
      const allowedCount = Math.max(1, nonHostPlayers.length - 1);

      // The "slow" player is any non-zombie player who didn't make the cutoff
      const answeredInTimeIds = new Set(sortedAnswers.slice(0, allowedCount).map(a => a.player_id));
      blitzSlowPlayerId = nonHostPlayers.filter(p => !p.is_zombie && !answeredInTimeIds.has(p.id))[0]?.id ?? null;
      
      for (const p of nonHostPlayers) {
        const rankIndex = sortedAnswers.findIndex(a => a.player_id === p.id);
        const ans = rankIndex >= 0 && rankIndex < allowedCount ? sortedAnswers[rankIndex] : undefined;

        const isCorrect = ans?.is_correct ?? false;
        const isFirst = isCorrect && rankIndex === 0;
        // BLITZ FIX: все получают +1, бонус за первого убран
        let posChange = isCorrect ? 1 : 0;
        
        // Zombies: in blitz they must answer correctly to move (which they can because they get UI controls in blitz clientside)
        const livesChange = p.is_zombie ? 0 : (isCorrect ? 0 : -1);
        let newStreak = isCorrect ? p.correct_streak + 1 : 0;
        let karmaGain = 0;
        if (!p.is_zombie && newStreak >= 3) karmaGain = 1;
        
        const newKarma = p.karma + karmaGain;
        const newLives = p.is_zombie ? 0 : Math.max(0, p.lives + livesChange);
        const newPos = Math.min(TOTAL_CELLS, p.position + posChange);

        const blitzDirectAns = finalAnswers.find(a => a.player_id === p.id);
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
          new_streak: p.is_zombie || newLives === 0 ? 0 : newStreak,
          new_total_correct: p.total_correct + (isCorrect ? 1 : 0),
          new_total_time_ms: p.total_answer_time_ms + (blitzDirectAns?.answer_time_ms ?? 0),
        });
      }
    } else {
      // Standard scoring
      for (const p of nonHostPlayers) {
        if (p.is_zombie) {
          const ans = finalAnswers.find(x => x.player_id === p.id);
          const isCorrect = ans?.is_correct ?? false;
          const newStreak = isCorrect ? p.correct_streak + 1 : 0;
          // Zombies accumulate karma via correct streaks — needed for duel & resurrection
          const karmaGain = isCorrect && newStreak >= 3 ? 1 : 0;
          results.push({
            player_id: p.id,
            is_correct: isCorrect,
            was_first: false, // zombies don't claim first-correct position bonus
            position_change: 1,
            lives_change: 0,
            karma_change: karmaGain,
            new_position: Math.min(TOTAL_CELLS, p.position + 1),
            new_lives: 0,
            new_karma: p.karma + karmaGain,
            is_zombie_now: true,
            new_streak: newStreak,
            new_total_correct: p.total_correct + (isCorrect ? 1 : 0),
            new_total_time_ms: p.total_answer_time_ms + (ans?.answer_time_ms ?? 0),
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
          new_streak: newLives === 0 ? 0 : newStreak,
          new_total_correct: p.total_correct + (isCorrect ? 1 : 0),
          new_total_time_ms: p.total_answer_time_ms + (ans?.answer_time_ms ?? 0),
        });
      }
    }

    // TEST MODE FIX: In test mode (round 999), disable field movement - show only rating changes
    if (room.current_round === 999) {
      for (const r of results) {
        const currentPlayer = nonHostPlayers.find(p => p.id === r.player_id);
        if (currentPlayer) {
          r.position_change = 0;
          r.new_position = currentPlayer.position; // Keep current position
        }
      }
    }

    // FIX STAGE 1: Blitz mode "King of the Hill" - when leader is caught, push them back
    let leaderChanged = false;
    if (mode === 'blitz' && oldLeader && room.current_round !== 999) {
      const oldLeaderResult = results.find(r => r.player_id === oldLeader.id);
      if (!oldLeaderResult) return;
      
      // Find all alive players who reached same position as old leader (catching up)
      const catchingUp = results.filter(r => {
        if (r.player_id === oldLeader.id || r.is_zombie_now) return false;
        return r.new_position === oldLeaderResult.new_position;
      });

      if (catchingUp.length > 0) {
        // Someone caught the old leader - push old leader back 1 step
        if (!oldLeaderResult.is_zombie_now) {
          oldLeaderResult.position_change -= 1;
          oldLeaderResult.new_position = Math.max(0, oldLeaderResult.new_position - 1);
        }
        
        // Determine new leader among catchers by rating
        const catcherPlayers = catchingUp.map(r => players.find(p => p.id === r.player_id)!).filter(Boolean);
        const rankedCatchers = rankPlayers(catcherPlayers);
        const newLeader = rankedCatchers[0];
        
        if (newLeader && newLeader.id !== oldLeader.id) {
          leaderChanged = true;
        }
      }
    }

    // Cell-19 collision: if 2+ alive players land on exactly cell 19, the rating leader takes cell 20
    const landingOn19 = results.filter(r => r.new_position === BLITZ_START && !r.is_zombie_now);
    if (landingOn19.length > 1 && room.current_round !== 999) {
      const rankedAll = rankPlayers(nonHostPlayers);
      const leaderAmong = rankedAll.find(p => landingOn19.some(r => r.player_id === p.id));
      if (leaderAmong) {
        const lr = results.find(r => r.player_id === leaderAmong.id)!;
        lr.new_position = Math.min(TOTAL_CELLS, BLITZ_START + 1);
        lr.position_change += 1;
      }
    }

    // FIX STAGE 1: Zombies infect on collision
    const zombiePositions = new Set(
      results.filter(r => r.is_zombie_now).map(r => r.new_position)
    );

    // Skip zombie infection in test mode
    for (const r of results) {
      if (room.current_round === 999) break;
      if (!r.is_zombie_now && zombiePositions.has(r.new_position)) {
        // Infected!
        r.lives_change -= r.new_lives; // Lose all remaining lives
        r.new_lives = 0;
        r.is_zombie_now = true;
        r.new_streak = 0; // infection resets streak
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
    const aliveResults = results.filter(r => !players.find(p => p.id === r.player_id)?.is_zombie);
    const allCorrect = aliveResults.length > 0 && aliveResults.every(r => r.is_correct);
    const noneCorrect = aliveResults.length > 0 && aliveResults.every(r => !r.is_correct);
    const correctCount = aliveResults.filter(r => r.is_correct).length;
    const incorrectCount = aliveResults.filter(r => !r.is_correct).length;
    const maExtra = ma as Record<string, string | undefined>;
    const resultPool = allCorrect && ma.all_correct
      ? ma.all_correct
      : noneCorrect && ma.everyone_mistake
      ? ma.everyone_mistake
      : correctCount === 1 && maExtra.only_one_answered
      ? maExtra.only_one_answered
      : incorrectCount === 1 && maExtra.only_one_not_answer
      ? maExtra.only_one_not_answer
      : ma.mixed ?? '';

    const correctAnswer = resolveCorrectAnswer(mode);
    const perfectRound = alivePlayers.length > 0 && alivePlayers.every(p => {
      const res = results.find(r => r.player_id === p.id);
      return res?.is_correct;
    });

    console.log('[PROCESS RESULTS] perfectRound calculation:', {
      'alivePlayers.length': alivePlayers.length,
      perfectRound,
      aliveResults: alivePlayers.map(p => {
        const res = results.find(r => r.player_id === p.id);
        return { player_id: p.id, is_correct: res?.is_correct };
      }),
    });

    // ─── Reaction FX ───
    // Play scream if any player freshly becomes zombie this round
    const newZombies = results.filter(r => {
      const wasZombie = players.find(p => p.id === r.player_id)?.is_zombie ?? false;
      return r.is_zombie_now && !wasZombie;
    });
    if (newZombies.length > 0) {
      new Audio(randomFromPool(SCREAM_POOL, 5)).play().catch(() => {});
    }
    // Play laugh if any non-zombie answered correctly
    const hasCorrect = results.some(r => {
      const wasZombie = players.find(p => p.id === r.player_id)?.is_zombie ?? false;
      return r.is_correct && !wasZombie;
    });
    
    // BLITZ FIX: Play leader change sound if leader changed
    if (leaderChanged && mode === 'blitz') {
      fxAudio.current.play(randomFromPool(BLITZ_CHANGE_LEADER_POOL, 5), false);
    }
    if (hasCorrect) {
      new Audio(randomFromPool(LAUGH_POOL, 5)).play().catch(() => {});
    }

    // ─── BLITZ: быстрый переход без показа рейтинга ───
    if (mode === 'blitz') {
      // TEST MODE: In test mode (round 999), show results screen instead of auto-advancing
      if (room.current_round === 999) {
        await setRoomStatus(room.id, 'round_results', {
          round_results_data: { 
            round: room.current_round, 
            mode, 
            correct_answer: correctAnswer, 
            player_results: results,
            perfect_round: perfectRound,
            blitz_slow_player_id: blitzSlowPlayerId,
            blitz_mode: true
          },
          ...(shouldResetBomb ? { zombie_bomb_active: false, zombie_bomb_player_id: null } : {})
        });
        await applyResults(results);
        isProcessingResultsRef.current = false;
        return;
      }

      // Detect leader change and play audio
      const newLeaderResult = results.filter(r => !r.is_zombie_now).sort((a, b) => b.new_position - a.new_position)[0];
      if (newLeaderResult && newLeaderResult.player_id !== oldLeader?.id) {
        new Audio(randomFromPool(BLITZ_CHANGE_LEADER_POOL, 5)).play().catch(() => {});
      }

      // Сохраняем результаты в БД, но НЕ меняем статус комнаты (остаемся в round_playing)
      const { error: updateError } = await supabase
        .from('survivach_rooms')
        .update({
          round_results_data: { 
            round: room.current_round, 
            mode, 
            correct_answer: correctAnswer, 
            player_results: results,
            perfect_round: perfectRound,
            blitz_slow_player_id: blitzSlowPlayerId,
            blitz_mode: true
          },
          ...(shouldResetBomb ? { zombie_bomb_active: false, zombie_bomb_player_id: null } : {})
        })
        .eq('id', room.id);
      if (updateError) console.error('[BLITZ] Failed to save results:', updateError);

      // Apply results immediately, then auto-advance
      await applyResults(results);
      isProcessingResultsRef.current = false;
      blitzTimerRef.current = setTimeout(() => {
        advanceBlitzRound();
      }, 1500); // Уменьшили с 2500 до 1500мс для большей динамики
      return;
    }

    // ─── ОБЫЧНЫЕ РЕЖИМЫ: показываем round_results ───
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

    bgAudio.current.play(randomFromPool(resultPool, POOL_COUNTS[resultPool] ?? 5), false, async () => {
      // After results audio → apply changes and move to next phase
      try {
        await applyResults(results);
        if (bets.length > 0) {
          await setRoomStatus(room.id, 'bet_reveal', {});
          bgAudio.current.play(
            anyCorrect
              ? resolvedBets.every(b => !b.won) ? randomFromPool(BET_UNWORKED_POOL, 5) : randomFromPool(BET_MIX_POOL, 5)
              : randomFromPool(BET_WORKED_POOL, 5),
            false,
            () => advanceAfterBetReveal(perfectRound),
          );
        } else {
          await advanceAfterBetReveal(perfectRound);
        }
      } finally {
        isProcessingResultsRef.current = false;
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
      correct_streak: r.new_streak,
      total_correct: r.new_total_correct,
      total_answer_time_ms: r.new_total_time_ms,
    })));
  };

  /* ─── Blitz: load and start next question instantly ─── */
  const advanceBlitzRound = async () => {
    if (!room) return;

    // Check win condition first
    const updatedPlayers = await fetchPlayers(room.id);
    const gamePlayers = updatedPlayers.filter(p => !p.is_host);
    const winners = gamePlayers.filter(p => p.position >= TOTAL_CELLS);
    if (winners.length > 0) {
      bgAudio.current.stop();
      await setRoomStatus(room.id, 'finished', {});
      return;
    }

    // BLITZ FIX: удаляем старые ответы перед новым вопросом (т.к. round не меняется)
    await supabase
      .from('survivach_answers')
      .delete()
      .eq('room_id', room.id)
      .eq('round', room.current_round);
    setAnswers([]); // очищаем локальный стейт

    // Pick next blitz question
    let qBank = blitzQBankRef.current;
    if (!qBank) {
      qBank = await loadPackQuestions(
        'https://storage.yandexcloud.net/vecherinkach/json/survivach', 'blitz'
      ) as Array<{ id: number; question: string; options: string[]; correct_index: number }>;
      blitzQBankRef.current = qBank;
    }
    const available = qBank.filter(q => !usedBlitzQIds.current.has(q.id));
    const pool = available.length > 0 ? available : qBank;
    const q = pool[Math.floor(Math.random() * pool.length)];
    if (!q) return;
    usedBlitzQIds.current.add(q.id);

    // Leader gets 3 options — remove last wrong option
    const nonHostPlayers = gamePlayers.filter(p => !p.is_host);
    const leaderPlayer = rankPlayers(nonHostPlayers)[0] ?? null;
    const leaderPos = getLeaderPosition(nonHostPlayers);
    const removeIdx = q.correct_index === 3 ? 2 : 3;
    const leaderOptions = q.options.filter((_, i) => i !== removeIdx);
    const leaderCorrectIndex = q.correct_index > removeIdx ? q.correct_index - 1 : q.correct_index;

    const questionData = {
      mode: 'blitz',
      id: q.id,
      question: q.question,
      options: q.options,
      correct_index: q.correct_index,
      leader_options: leaderOptions,
      leader_correct_index: leaderCorrectIndex,
      leader_player_id: leaderPlayer?.id ?? null,
    };
    setCurrentQ(questionData);
    // BLITZ FIX: увеличиваем state_version для обновления экранов игроков
    const { data: updatedRoom } = await supabase
      .from('survivach_rooms')
      .update({
        status: 'round_playing',
        current_round: room.current_round,
        leader_position: leaderPos,
        current_mode: 'blitz',
        question_data: questionData,
        timer_started_at: new Date().toISOString(),
        timer_duration_sec: 30,
        state_version: (room.state_version ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', room.id)
      .select()
      .single();
    
    // BLITZ FIX: обновляем локальное состояние для триггера useEffect
    if (updatedRoom) {
      setRoom(updatedRoom as SurvivachRoom);
    }
    
    // BLITZ FIX: вручную сбрасываем и запускаем таймер (т.к. статус не изменился, useEffect не сработает)
    clearInterval(timerRef.current!);
    setTimerLeft(30);
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
  };

  const advanceAfterBetReveal = async (perfectRound = false) => {
    if (!room) return;
    
    // TEST MODE: In test mode (round 999), don't advance - stay on results screen
    if (room.current_round === 999) {
      return;
    }
    
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

    // Check for Hot Potato condition: perfect round & at least 2 players alive
    // (A hot potato needs players to pass it between)
    // We already stored `perfect_round` in round_results_data.
    const aliveGamePlayers = gamePlayers.filter(p => !p.is_zombie);

    // Fetch the freshest room state so we merge into the NEW round_results_data,
    // not the stale one from the closure of round_playing.
    const latestRoom = await fetchRoomById(room.id);
    const roundData = (latestRoom?.round_results_data as RoundResultsData | null) ?? null;
    const roundResults = roundData?.player_results ?? [];
    const perfectFromResults =
      roundResults.length > 0 &&
      roundResults.every((r) => {
        const wasZombieBeforeRound = players.find(p => p.id === r.player_id)?.is_zombie ?? false;
        return wasZombieBeforeRound || r.is_correct;
      });

    const isPerfect = perfectRound || !!roundData?.perfect_round || perfectFromResults;
    const isCurrentRoundData = latestRoom && roundData?.round === latestRoom.current_round;
    const isAlreadyPotatoFlow = room.status === 'potato_intro' || room.status === 'potato_playing' || room.status === 'potato_result';

    // Debug logging for hot potato trigger
    console.log('[HOT POTATO DEBUG]', {
      perfectRound,
      'roundData?.perfect_round': roundData?.perfect_round,
      perfectFromResults,
      isPerfect,
      'roundData?.round': roundData?.round,
      'latestRoom?.current_round': latestRoom?.current_round,
      isCurrentRoundData,
      'room.status': room.status,
      isAlreadyPotatoFlow,
      'aliveGamePlayers.length': aliveGamePlayers.length,
      'roundResults': roundResults.map(r => ({ player_id: r.player_id, is_correct: r.is_correct })),
    });

    if (isPerfect && isCurrentRoundData && !isAlreadyPotatoFlow && aliveGamePlayers.length >= 2) {
      console.log('[HOT POTATO] Trigger condition MET! Starting potato_intro');
      // Pick a random alive player to get the bomb
      const randomStartId = aliveGamePlayers[Math.floor(Math.random() * aliveGamePlayers.length)].id;
      
      const newRoundData = {
        ...roundData,
        potato_bomb_holder: randomStartId,
        potato_duration_ms: 10000 + Math.random() * 5000,
        potato_task: Math.floor(Math.random() * 3),
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
    const tileCount = 9; // Fixed 3x3 grid
    let initialDuelData: Record<string, unknown> = {};
    if (duelMode === 'minesweeper') {
      initialDuelData = { mode: 'minesweeper', tile_count: tileCount, mined_tiles: {}, challenger_picks: [], challenged_picks: [], exploded_challenger: false, exploded_challenged: false };
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

    // IMPORTANT: Set status to 'duel_result' BEFORE playing audio
    // This ensures the result screen is shown even if audio fails to load
    await setRoomStatus(room.id, 'duel_result', { duel_data: { ...room.duel_data, winner_id: winnerId } as unknown as import('@/lib/survivach/types').DuelData });

    if (winnerId === null) {
      // Draw - no one changes position or stats
      bgAudio.current.play(randomFromPool(DRAW_POOL, 5), false, () => advanceAfterDuel());
    } else if (winnerId === duel.challenged_id) {
      // Challenged (summoned) won
      if (challenged.is_zombie) {
        // Zombie summoned won! Resurrects (gets 1 life). Challenger loses 1 life (and might become zombie).
        const newChallengerLives = Math.max(0, challenger.lives - 1);
        // If another zombie is already at the zombie's old position, the alive player also becomes zombie
        const zombiesAtChallengedPos = players.filter(
          p => !p.is_host && p.is_zombie && p.id !== challenged.id && p.position === challenged.position
        );
        const newChallengerIsZombie = newChallengerLives === 0 || challenger.is_zombie || zombiesAtChallengedPos.length > 0;
        const finalChallengerLives = newChallengerIsZombie ? 0 : newChallengerLives;
        
        await updatePlayers([
          { id: challenged.id, position: challenger.position, is_zombie: false, lives: 1 },
          { id: challenger.id, position: challenged.position, is_zombie: newChallengerIsZombie, lives: finalChallengerLives },
        ]);
        bgAudio.current.play(randomFromPool(ZOMBIE_WON_POOL, 5), false, () => advanceAfterDuel());
      } else if (challenger.is_zombie) {
        // Zombie challenger lost duel. Nothing happens (zombie stays zombie, alive player keeps life, no karma transfer).
        bgAudio.current.play(randomFromPool(SUMMONED_WON_POOL, 5), false, () => advanceAfterDuel());
      } else {
        // Both alive: challenged takes 3 karma from challenger, positions stay same
        await updatePlayers([
          { id: challenger.id, karma: Math.max(0, challenger.karma - 3) },
          { id: challenged.id, karma: challenged.karma + 3 },
        ]);
        bgAudio.current.play(randomFromPool(SUMMONED_WON_POOL, 5), false, () => advanceAfterDuel());
      }
    } else {
      // Challenger (caller) won
      if (challenger.is_zombie) {
        // Zombie challenger won! Resurrects (gets 1 life). Challenged loses 1 life (and might become zombie).
        const newChallengedLives = Math.max(0, challenged.lives - 1);
        // If another zombie is already at the zombie's old position, the alive player also becomes zombie
        const zombiesAtChallengerPos = players.filter(
          p => !p.is_host && p.is_zombie && p.id !== challenger.id && p.position === challenger.position
        );
        const newChallengedIsZombie = newChallengedLives === 0 || challenged.is_zombie || zombiesAtChallengerPos.length > 0;
        const finalChallengedLives = newChallengedIsZombie ? 0 : newChallengedLives;
        
        await updatePlayers([
          { id: challenger.id, position: challenged.position, is_zombie: false, lives: 1 },
          { id: challenged.id, position: challenger.position, is_zombie: newChallengedIsZombie, lives: finalChallengedLives },
        ]);
        bgAudio.current.play(randomFromPool(ZOMBIE_WON_POOL, 5), false, () => advanceAfterDuel());
      } else {
        // Normal swap positions (both alive)
        await updatePlayers([
          { id: challenger.id, position: challenged.position },
          { id: challenged.id, position: challenger.position },
        ]);
        bgAudio.current.play(randomFromPool(CALLER_WON_POOL, 5), false, () => advanceAfterDuel());
      }
    }
  };

  const advanceAfterDuel = async () => {
    if (!room) return;
    
    // TEST MODE: In test mode (round 999), don't advance - stay on duel_result screen
    if (room.current_round === 999) {
      return;
    }
    
    const updatedPlayers = await fetchPlayers(room.id);
    const newLeaderPos = getLeaderPosition(updatedPlayers.filter(p => !p.is_host));
    const newRound = room.current_round + 1;
    
    // FIX STAGE 3: Clear local duel states to prevent phantom renders
    setDuel(null);
    setDuelQ(null);

    await setRoomStatus(room.id, 'moving', { current_round: newRound, leader_position: newLeaderPos });
  };

  /* ─── Force-advance to next phase (host manual skip) ─── */
  const resetPlayersAfterTest = async () => {
    if (!room) return;
    const allPlayers = await fetchPlayers(room.id);
    const nonHost = allPlayers.filter(p => !p.is_host);
    await updatePlayers(nonHost.map(p => ({
      id: p.id,
      lives: 3,
      karma: 0,
      position: 1,
      correct_streak: 0,
      is_zombie: false,
      total_correct: 0,
      total_answer_time_ms: 0,
    })));
    await supabase
      .from('survivach_rooms')
      .update({ zombie_bomb_active: false, zombie_bomb_player_id: null })
      .eq('id', room.id);
  };

  const handleForceNext = async () => {
    if (!room) return;
    bgAudio.current.stop();
    fxAudio.current.stop();

    switch (room.status) {
      case 'moving':
        clearInterval(moveTimerRef.current!);
        setMoveTimerLeft(0);
        await handleMoveAnimDone();
        break;
      case 'round_intro':
        await startRoundPlaying();
        break;
      case 'round_playing':
        clearInterval(timerRef.current!);
        setTimerLeft(0);
        await handleTimerExpired();
        break;
      case 'round_results': {
        // In blitz mode, cancel the pending auto-advance timer and advance immediately
        if ((room.round_results_data as { blitz_mode?: boolean } | null)?.blitz_mode) {
          if (blitzTimerRef.current) clearTimeout(blitzTimerRef.current);
          await advanceBlitzRound();
          break;
        }
        isProcessingResultsRef.current = false; // unblock guard so advance can proceed
        if (roundResultsData.length > 0) {
          await applyResults(roundResultsData);
        }
        const pfRound = (room.round_results_data as { perfect_round?: boolean } | null)?.perfect_round ?? false;
        if (bets.length > 0) {
          await setRoomStatus(room.id, 'bet_reveal', {});
          await advanceAfterBetReveal(pfRound);
        } else {
          await advanceAfterBetReveal(pfRound);
        }
        break;
      }
      case 'bet_reveal':
        await advanceAfterBetReveal((room.round_results_data as { perfect_round?: boolean } | null)?.perfect_round ?? false);
        break;
      case 'duel_intro':
        await setRoomStatus(room.id, 'duel_setup', {});
        break;
      case 'duel_setup':
        await setRoomStatus(room.id, 'duel_playing', {});
        break;
      case 'duel_result':
        await advanceAfterDuel();
        break;
      case 'potato_intro': {
        const rd = room.round_results_data as any;
        await setRoomStatus(room.id, 'potato_playing', {
          round_results_data: { ...rd, potato_started_at: Date.now() },
        });
        break;
      }
      case 'potato_playing': {
        const rd = room.round_results_data as { potato_bomb_holder?: string } | null;
        if (rd?.potato_bomb_holder) {
          await handlePotatoExplosion(rd.potato_bomb_holder);
        }
        break;
      }
      case 'potato_result': {
        await advanceAfterBetReveal();
        break;
      }
    }
  };

  const handleCloseRoom = async () => {
    if (!room) return;
    if (confirm('Закрыть комнату? Игра завершится для всех.')) {
      bgAudio.current.stop();
      fxAudio.current.stop();
      await setRoomStatus(room.id, 'finished', {});
    }
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
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-gray-950 text-white">

      {/* --- PERSISTENT BOARD VIEW --- */}
      {!["lobby", "rules", "finished"].includes(room.status) && (
        <div className="shrink-0 w-full z-[100] bg-[#0c0418]/80 backdrop-blur-3xl shadow-[0_10px_50px_rgba(0,0,0,0.9)] border-b border-white/10 relative pt-2 px-2 md:pt-4 md:px-4">
          <BoardView players={players.filter(p => !p.is_host)} leaderPosition={room.leader_position} />
        </div>
      )}

      {/* --- SCROLLABLE CONTENT AREA --- */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative flex flex-col">
      {/* ─── LOBBY ─── */}
      {room.status === 'lobby' && (
        <div onClick={() => fxAudio.current.play('')} className="relative min-h-full h-full bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-indigo-900 via-purple-950 to-[#0c0418] text-white overflow-hidden select-none">
          <style dangerouslySetInnerHTML={{ __html: `
            @keyframes ghostFly {
              0% { transform: translateY(0) scale(0.8) rotate(0deg); opacity: 0; filter: brightness(1.2) hue-rotate(90deg) contrast(1.5); }
              10% { opacity: 0.9; transform: translateY(-30px) scale(1) rotate(-5deg); filter: brightness(1.5) hue-rotate(180deg); }
              90% { opacity: 0.4; transform: translateY(-400px) scale(1.3) rotate(10deg); filter: brightness(2) hue-rotate(240deg); }
              100% { opacity: 0; transform: translateY(-500px) scale(1.5) rotate(0deg); }
            }
            .ghost-anim {
              animation: ghostFly 4.5s ease-out forwards;
              will-change: transform, opacity, filter;
            }
            @keyframes zombieHandUp {
              0% { transform: translateY(120%) rotate(15deg); }
              70% { transform: translateY(-10%) rotate(-5deg); }
              100% { transform: translateY(0) rotate(0deg); }
            }
            .zombie-hand-anim {
              animation: zombieHandUp 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
              will-change: transform;
            }
            @keyframes survivachGlow {
              0%   { color: transparent; text-shadow: none; opacity: 0; filter: blur(4px); }
              10%  { color: #fff; text-shadow: 0 0 20px #e9d5ff, 0 0 40px #c084fc, 0 0 80px #9333ea; opacity: 1; filter: blur(0px); }
              50%  { color: #fff; text-shadow: 0 0 20px #e9d5ff, 0 0 40px #c084fc, 0 0 80px #9333ea; opacity: 1; filter: blur(0px); }
              60%  { color: transparent; text-shadow: none; opacity: 0; filter: blur(4px); }
              100% { color: transparent; text-shadow: none; opacity: 0; filter: blur(4px); }
            }
            .glow-char-anim {
              animation: survivachGlow 6s ease-in-out infinite;
              will-change: opacity, text-shadow, color, filter;
            }
            @keyframes floating {
              0%, 100% { transform: translateY(0px) rotate(0deg); }
              50% { transform: translateY(-10px) rotate(1deg); }
            }
          `}} />

          {/* Background Elements: Moon & Silhouette */}
          <div className="absolute top-12 right-20 w-48 h-48 bg-yellow-100 rounded-full shadow-[0_0_120px_#fef08a] opacity-90 mix-blend-screen overflow-hidden">
            <div className="absolute top-1/4 left-1/4 w-8 h-8 rounded-full bg-yellow-200 shadow-[inset_2px_4px_6px_rgba(0,0,0,0.15)] opacity-50"></div>
            <div className="absolute top-1/2 right-1/4 w-12 h-12 rounded-full bg-yellow-200 shadow-[inset_-2px_-3px_8px_rgba(0,0,0,0.15)] opacity-40"></div>
            <div className="absolute bottom-1/4 left-1/3 w-6 h-6 rounded-full bg-yellow-200 shadow-[inset_1px_2px_4px_rgba(0,0,0,0.15)] opacity-60"></div>
            <div className="absolute top-1/3 right-1/2 w-4 h-4 rounded-full bg-yellow-200 shadow-[inset_1px_1px_3px_rgba(0,0,0,0.1)] opacity-70"></div>
          </div>
          
          <div className="absolute bottom-0 w-full h-[35vh] bg-[#0c0418] z-0" style={{ clipPath: 'polygon(0% 100%, 0% 70%, 5% 55%, 10% 65%, 15% 45%, 25% 75%, 35% 65%, 45% 85%, 60% 50%, 75% 70%, 85% 40%, 95% 60%, 100% 70%, 100% 100%)' }}></div>

          {/* Main Gravestone Container */}
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-[8vh] z-10">

            {/* Glowing Text above */}
            <div className="mb-4 sm:mb-8 flex gap-1 sm:gap-[6px] md:gap-3 z-30">
              {"ВЫЖИВАЧ".split('').map((char, i) => (
                <span 
                  key={i} 
                  className="glow-char-anim text-5xl sm:text-6xl md:text-[5rem] lg:text-[6.5rem] font-black tracking-widest text-transparent"
                  style={{ animationDelay: `${i * 0.25}s` }}
                >
                  {char}
                </span>
              ))}
            </div>

            <div className="relative w-[340px] h-[600px] bg-[linear-gradient(180deg,#312e81_0%,#1e1b4b_100%)] rounded-t-[10rem] border-[12px] border-[#0c0418] border-b-0 shadow-[inset_0_20px_50px_rgba(0,0,0,0.5),_0_0_100px_rgba(88,28,135,0.4)] flex flex-col pt-12 p-8 relative overflow-hidden transition-all duration-1000">
              {/* Inner detail text */}
              <div className="flex justify-center mb-2 px-2 opacity-50 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                <span className="text-5xl filter grayscale">💀</span>
              </div>
              <h2 className="text-[28px] font-black text-center text-[#0c0418] tracking-tighter uppercase drop-shadow-[0_1px_2px_rgba(255,255,255,0.15)] leading-tight" style={{ WebkitTextStroke: '1px #1e1b4b' }}>
                ПРИСОЕДИНЯЙСЯ
              </h2>

              <div className="flex flex-col items-center mt-3 gap-[2px] w-full flex-1 overflow-hidden z-20">
                 {players.filter(p => !p.is_host).slice(0, 12).map((p) => {
                    const trunc = p.name.length > 15 ? p.name.substring(0, 15) + '…' : p.name;
                    return (
                      <div key={p.id} className="text-xl font-bold uppercase text-[#1e1b4b] mix-blend-multiply opacity-80" style={{ WebkitTextStroke: '0.4px rgba(0,0,0,0.2)' }}>
                        {trunc}
                      </div>
                    );
                 })}
              </div>

              <button
                onClick={handleStartGame}
                disabled={players.filter(p => !p.is_host).length < MIN_PLAYERS || showZombieHand}
                className="w-full py-5 mt-auto rounded-2xl text-xl font-black transition-all bg-purple-700 hover:bg-purple-500 disabled:bg-[#1e1b4b] disabled:text-gray-600 disabled:cursor-not-allowed uppercase text-purple-100 tracking-widest border-b-[6px] border-purple-950 active:scale-95 shadow-[0_0_40px_rgba(147,51,234,0.4)] relative z-50 pointer-events-auto"
              >
                {players.filter(p => !p.is_host).length < MIN_PLAYERS 
                  ? `ЖДЁМ (${players.filter(p => !p.is_host).length}/${MIN_PLAYERS})` 
                  : 'НАЧАТЬ'}
              </button>
            </div>

            {/* Zombie Hand Animation at the base of the gravestone */}
            {showZombieHand && (
              <div className="absolute bottom-[5vh] left-1/2 -translate-x-1/2 w-64 h-64 zombie-hand-anim pointer-events-none z-40 flex items-end justify-center">
                <div className="text-[12rem] filter hue-rotate-[240deg] contrast-150 saturate-200 drop-shadow-[0_0_40px_rgba(34,197,94,0.4)] leading-none -mb-8">
                  🧟‍♂️
                </div>
              </div>
            )}
            
            {/* The dirt in front of the grave */}
            <div className="absolute bottom-[6vh] w-[450px] h-24 bg-[#080210] rounded-[100%] z-20 shadow-[0_0_80px_rgba(0,0,0,1)] pointer-events-none"></div>
          </div>

          {/* Ghost Spawner Container (Appears behind dirt, flies up) */}
          <div className="absolute inset-0 pointer-events-none z-15 overflow-hidden">
             {players.filter(p => !p.is_host).map(p => (
                <GhostAnim key={p.id} p={p as any} />
             ))}
          </div>

          {/* Top Info Bar */}
          <div className="absolute top-6 left-6 right-6 flex justify-between items-start z-30">
            <div className="flex gap-6 p-4 rounded-3xl bg-black/60 backdrop-blur-md border border-purple-800/40 shadow-[0_0_50px_rgba(88,28,135,0.4)]">
               <div className="bg-white p-2 rounded-xl">
                 <QRCodeCanvas value={joinUrl} size={120} bgColor="#ffffff" fgColor="#3b0764" />
               </div>
               <div className="flex flex-col justify-center pr-4">
                 <p className="text-purple-300/80 text-sm uppercase tracking-[0.3em] font-bold mb-1">Код комнаты</p>
                 <div className="text-6xl font-mono font-black text-purple-100 drop-shadow-[0_0_20px_#9333ea]">
                   {code}
                 </div>
               </div>
            </div>

            <button
              onClick={async () => { if (confirm('Закрыть комнату?')) { await setRoomStatus(room.id, 'finished', {}); } }}
              className="px-6 py-3 bg-black/50 hover:bg-red-950/80 rounded-full border border-red-900/50 text-red-300/80 hover:text-red-200 text-sm transition-colors backdrop-blur-sm uppercase tracking-widest font-black shadow-lg"
            >
              Закрыть ❌
            </button>
          </div>

          {/* Connected players grid */}
          <div className="absolute bottom-8 left-8 p-6 bg-black/50 backdrop-blur-md border border-purple-800/40 rounded-3xl z-30 w-96 shadow-[0_0_40px_rgba(0,0,0,0.8)]">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">🪦</span>
              <p className="text-purple-200 font-black text-sm uppercase tracking-[0.2em] leading-tight">Уже в могиле<br/>
                <span className="text-purple-400/80 text-xs">Жертвы ({players.filter(p => !p.is_host).length})</span>
              </p>
            </div>
            
            <div className="flex flex-wrap gap-2 max-h-[30vh] overflow-y-auto pr-2 custom-scrollbar">
              {players.filter(p => !p.is_host).map(p => (
                <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 bg-purple-900/30 rounded-full border border-purple-700/40 shadow-inner">
                  <img src={getAvatarUrl(p.avatar, 3)} alt={p.name} className="w-8 h-8 rounded-full bg-black/20 p-0.5" />
                  <span className="text-sm font-bold text-purple-100">{p.name}</span>
                </div>
              ))}
              {players.filter(p => !p.is_host).length === 0 && (
                 <span className="text-purple-500/50 italic font-medium px-2">— Тишина —</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── TEST MODE SELECTION ─── */}
      {room.status === 'rules' && testMode === 'select' && (
        <div className="min-h-full h-full flex flex-col items-center justify-center p-8 bg-gradient-to-br from-gray-950 via-blue-950 to-purple-950 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-blue-900/30 via-purple-900/30 to-gray-900/40 z-0"></div>
          
          <div className="z-10 flex flex-col items-center w-full max-w-5xl relative">
            <h2 className="text-5xl font-black mb-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-200 via-purple-200 to-blue-200 drop-shadow-[0_0_20px_rgba(59,130,246,0.5)] uppercase tracking-widest">
              🧪 Тестирование режимов
            </h2>
            <p className="text-gray-400 mb-8 text-center">Выберите режим для тестирования</p>
            
            {/* Question modes */}
            <div className="w-full mb-8">
              <h3 className="text-2xl font-bold text-purple-300 mb-4 text-center">📝 Режимы вопросов</h3>
              {/* Zombie bomb toggle */}
              <div className="flex items-center justify-center gap-3 mb-4">
                <button
                  onClick={() => setTestBomb(v => !v)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${testBomb ? 'bg-green-500' : 'bg-gray-600'}`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${testBomb ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
                <span className={`font-bold text-sm ${testBomb ? 'text-green-300' : 'text-gray-500'}`}>💣 Зомби-бомба</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { mode: 'umnik' as RoundMode, title: '🎓 Умник', desc: 'Выбор из вариантов' },
                  { mode: 'mathematician' as RoundMode, title: '🔢 Математик', desc: 'Арифметические задачи' },
                  { mode: 'art_historian' as RoundMode, title: '🎨 Искусствовед', desc: 'Последовательность цветов' },
                  { mode: 'interpreter' as RoundMode, title: '🗣️ Переводчик', desc: 'Текстовый ответ' },
                  { mode: 'memory_diary' as RoundMode, title: '📔 Дневник памяти', desc: 'Последовательность чисел' },
                  { mode: 'tag_puzzle' as RoundMode, title: '🧩 Пятнашки', desc: 'Собрать пазл' },
                ].map(({ mode, title, desc }) => (
                  <button
                    key={mode}
                    onClick={async () => {
                      setTestMode(mode);
                      await startTestMode(mode, testBomb);
                    }}
                    className="bg-gradient-to-br from-purple-900/40 to-blue-900/40 hover:from-purple-800/60 hover:to-blue-800/60 border border-purple-500/30 rounded-2xl p-6 transition-all hover:scale-[1.02] shadow-lg"
                  >
                    <h4 className="text-xl font-bold text-white mb-2">{title}</h4>
                    <p className="text-sm text-gray-300">{desc}</p>
                  </button>
                ))}
              </div>
            </div>
            
            {/* Special modes */}
            <div className="w-full mb-8">
              <h3 className="text-2xl font-bold text-orange-300 mb-4 text-center">🔥 Специальные режимы</h3>
              <div className="grid grid-cols-1 md:grid-cols-1 gap-4 max-w-md mx-auto">
                <button
                  onClick={async () => {
                    setTestMode('hot_potato');
                    await startTestMode('hot_potato');
                  }}
                  className="bg-gradient-to-br from-orange-900/40 to-red-900/40 hover:from-orange-800/60 hover:to-red-800/60 border border-orange-500/30 rounded-2xl p-6 transition-all hover:scale-[1.02] shadow-lg"
                >
                  <h4 className="text-xl font-bold text-white mb-2">🥔 Горячая картошка</h4>
                  <p className="text-sm text-gray-300">Передача картошки по кругу</p>
                </button>
              </div>
            </div>
            
            {/* Duel modes */}
            <div className="w-full mb-8">
              <h3 className="text-2xl font-bold text-red-300 mb-4 text-center">⚔️ Дуэли</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { mode: 'minesweeper' as DuelMode, title: '💣 Сапёр', desc: 'Найти мины на поле' },
                  { mode: 'arithmetic_mean' as DuelMode, title: '📊 Среднее арифметическое', desc: 'Угадать среднее значение' },
                  { mode: 'crowd_forecast' as DuelMode, title: '🎯 Прогноз толпы', desc: 'Предсказать ответ толпы' },
                ].map(({ mode, title, desc }) => (
                  <button
                    key={mode}
                    onClick={async () => {
                      setTestMode(mode);
                      await startTestMode(mode);
                    }}
                    className="bg-gradient-to-br from-red-900/40 to-pink-900/40 hover:from-red-800/60 hover:to-pink-800/60 border border-red-500/30 rounded-2xl p-6 transition-all hover:scale-[1.02] shadow-lg"
                  >
                    <h4 className="text-xl font-bold text-white mb-2">{title}</h4>
                    <p className="text-sm text-gray-300">{desc}</p>
                  </button>
                ))}
              </div>
            </div>
            
            <button
              onClick={() => setTestMode(null)}
              className="px-8 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-full text-gray-300 transition-all uppercase tracking-widest text-sm font-bold active:scale-95"
            >
              ← Назад к правилам
            </button>

            {/* Leaderboard */}
            {ranked.length > 0 && (
              <div className="w-full max-w-2xl mt-6">
                <h3 className="text-lg font-bold text-gray-300 mb-3 text-center">🏆 Рейтинг игроков</h3>
                <div className="flex flex-col gap-2">
                  {ranked.map((p, i) => (
                    <div key={p.id} className={`flex items-center gap-3 px-4 py-2 rounded-xl border text-sm ${
                      i === 0 ? 'border-yellow-500/60 bg-yellow-900/20' :
                      p.is_zombie ? 'border-green-500/40 bg-green-900/20' :
                      'border-gray-700 bg-gray-800/60'
                    }`}>
                      <span className="w-6 text-center font-mono text-gray-400">#{i + 1}</span>
                      <img src={getAvatarUrl(p.avatar, p.lives)} alt="" className="w-8 h-8 object-contain" />
                      <span className="font-bold flex-1 truncate">{p.name}</span>
                      <span className="text-gray-400">📍{p.position}</span>
                      <span className="text-red-400">{'❤️'.repeat(p.lives)}{'🖤'.repeat(Math.max(0, 3 - p.lives))}</span>
                      <span className={p.karma >= 3 ? 'text-yellow-300 font-bold' : 'text-gray-500'}>✨{p.karma}</span>
                      <span className="text-gray-500">✅{p.total_correct}</span>
                      {p.is_zombie && <span className="text-green-400">🧟</span>}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-600 text-center mt-2">Ранж: позиция → жизни → карма → правильных ответов → время</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── RULES ─── */}
      {room.status === 'rules' && !testMode && (
        <div className="min-h-full h-full flex flex-col items-center justify-center p-8 bg-[url('/img/lava-bg.jpg')] bg-cover bg-center bg-gray-950 relative overflow-hidden transition-all duration-1000">
          <div className="absolute inset-0 bg-gradient-to-b from-[#0c0418]/90 via-[#2e1065]/70 to-[#3b0764]/90 z-0"></div>
          
          <div className="z-10 flex flex-col items-center w-full max-w-4xl relative">
            <h2 className="text-5xl font-black mb-8 text-transparent bg-clip-text bg-gradient-to-r from-purple-200 via-yellow-100 to-purple-200 drop-shadow-[0_0_20px_rgba(168,85,247,0.5)] uppercase tracking-widest animate-pulse">
              📜 Правила выживания
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
              {[
                { id: 'goal', title: '🎯 Цель игры', color: 'border-yellow-500/50', bg: 'bg-yellow-950/20', short: 'Первым добраться до клетки 26, не став зомби.', desc: 'Все стартуют с 1-й клетки. Ваша главная задача — выжить и первым достичь финиша (кл. 26). Игроки борются друг с другом, отвечая на вопросы, зарабатывая уровни, карму и теряя жизни.' },
                { id: 'correct', title: '✅ Правильный ответ', color: 'border-green-500/50', bg: 'bg-green-950/20', short: '+1 клетка вперёд. Первый ответивший — +2 клетки.', desc: 'Каждый правильный ответ передвигает вас на одну клетку вперёд. Но тот, кто ответит правильно БЫСТРЕЕ всех, получит бонус: +2 клетки! Скорость решает.' },
                { id: 'wrong', title: '❌ Неправильный ответ', color: 'border-red-500/50', bg: 'bg-red-950/20', short: 'Остаёшься на месте, −1 жизнь.', desc: 'Неправильный ответ лишает вас одной жизни. С места вы не сдвинетесь. Лишившись всех 3-х жизней, вы превратитесь в зомби.' },
                { id: 'zombie', title: '🧟 Зомби-режим', color: 'border-emerald-500/50', bg: 'bg-emerald-950/20', short: '3 ошибки = зомби. Идёшь +1, заражаешь.', desc: 'Зомби двигаются на 1 клетку вперёд каждый раунд, не отвечая на вопросы. При совпадении с живым игроком на одной клетке (имея зомби-бомбу), зомби кусает и отнимает жизнь у живого!' },
                { id: 'karma', title: '✨ Карма', color: 'border-purple-500/50', bg: 'bg-purple-950/20', short: '3 правильных подряд = 1 карма. 3 кармы = дуэль!', desc: 'Ответьте правильно 3 раза подряд без ошибок, чтобы получить 1 очко кармы. Накопив 3 очка (3 раза по 3 ответа), вы можете вызвать любого игрока на смертельную Дуэль на вылет!' },
                { id: 'blitz', title: '⚡ Блиц (кл. 19+)', color: 'border-cyan-500/50', bg: 'bg-cyan-950/20', short: 'Быстрые вопросы. Последний ответ не считается.', desc: 'Как только лидер ступает на 19-ю клетку или дальше, активируется напряжённый режим Блиц. Вопросы сложнее, а времени меньше. Последний ответивший ничего не получает!' },
              ].map((rule, idx) => (
                <div
                  key={rule.id}
                  onClick={() => setSelectedRule(rule.id)}
                  className={`cursor-pointer ${rule.bg} border ${rule.color} rounded-2xl p-5 hover:scale-[1.02] hover:bg-white/10 transition-all duration-300 backdrop-blur-md shadow-lg flex flex-col justify-center`}
                  style={{ animation: `floating 4s ease-in-out infinite ${idx * 0.2}s` }}
                >
                  <h3 className="text-xl font-bold mb-2 text-white/90">{rule.title}</h3>
                  <p className="text-sm text-gray-300 leading-snug">{rule.short}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2 mt-12">
              <button
                onClick={() => setTestMode('select')}
                className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 border border-blue-400/30 rounded-full text-white transition-all uppercase tracking-widest text-sm font-bold shadow-[0_0_30px_rgba(59,130,246,0.3)] active:scale-95"
              >
                🧪 Тестирование режимов
              </button>
              <button
                onClick={skipRulesFlow}
                className="px-8 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full text-white/80 transition-all uppercase tracking-widest text-sm font-bold shadow-[0_0_30px_rgba(255,255,255,0.1)] active:scale-95"
              >
                Пропустить правила ⏭
              </button>
              <button
                onClick={handleCloseRoom}
                className="px-8 py-3 bg-black/30 hover:bg-red-950/60 border border-red-900/40 rounded-full text-red-300/70 hover:text-red-200 transition-all uppercase tracking-widest text-sm font-bold active:scale-95"
              >
                Закрыть комнату ❌
              </button>
            </div>
          </div>

          {/* Rules Modal */}
          {selectedRule && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedRule(null)}>
              <div className="max-w-lg w-full bg-gray-900 border border-purple-500/50 rounded-3xl p-8 shadow-[0_0_60px_rgba(168,85,247,0.3)] transform scale-100" onClick={e => e.stopPropagation()}>
                {(() => {
                  const rule = [
                    { id: 'goal', title: '🎯 Цель игры', desc: 'Все стартуют с 1-й клетки. Ваша главная задача — выжить и первым достичь финиша (кл. 26). Игроки борются друг с другом, отвечая на вопросы, зарабатывая уровни, карму и теряя жизни.' },
                    { id: 'correct', title: '✅ Правильный ответ', desc: 'Каждый правильный ответ передвигает вас на одну клетку вперёд. Но тот, кто ответит правильно БЫСТРЕЕ всех, получит бонус: +2 клетки! Скорость решает.' },
                    { id: 'wrong', title: '❌ Неправильный ответ', desc: 'Неправильный ответ лишает вас одной жизни. С места вы не сдвинетесь. Будьте осторожны — лишившись всех 3-х жизней, вы превратитесь в зомби.' },
                    { id: 'zombie', title: '🧟 Зомби-режим', desc: 'Зомби всегда двигаются на 1 клетку вперёд каждый раунд, не отвечая на вопросы. При совпадении с живым игроком на одной клетке (разряжая зомби-бомбу), зомби кусает и отнимает жизнь у живого!' },
                    { id: 'karma', title: '✨ Карма', desc: 'За каждый правильный ответ без ошибок 3 раза подряд вы получаете 1 очко кармы. Накопив 3 очка кармы, вы можете вызвать любого на смертельную Дуэль на вылет!' },
                    { id: 'blitz', title: '⚡ Блиц (кл. 19+)', desc: 'Как только лидер ступает на 19-ю клетку или дальше, активируется напряжённый режим Блиц. Вопросы сложнее, а времени на раздумья меньше. Важно: игрок, ответивший последним, ничего не получает даже за правильный ответ!' },
                  ].find(r => r.id === selectedRule);
                  return (
                    <>
                      <h3 className="text-3xl font-black mb-4 text-purple-200">{rule?.title}</h3>
                      <p className="text-lg text-gray-300 leading-relaxed">{rule?.desc}</p>
                      <div className="mt-8 flex justify-center">
                        <button onClick={() => setSelectedRule(null)} className="px-6 py-2 bg-purple-600 hover:bg-purple-500 rounded-xl font-bold uppercase text-sm tracking-widest text-white transition-colors">
                          Понятно
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── MOVING ─── */}
      {room.status === 'moving' && (
        <div className="min-h-full h-full flex flex-col p-6 gap-6 relative z-10">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(76,29,149,0.15),_transparent_70%)] pointer-events-none -z-10" />
          
          <div className="flex flex-wrap items-center gap-4">
            <h2 className="text-3xl md:text-4xl font-black tracking-wide drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)] flex items-center gap-2">
              <span className="animate-pulse">🎲</span> ПЕРЕДВИЖЕНИЕ
            </h2>
            <div className="px-5 py-2 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl text-xl font-mono text-purple-200 shadow-[0_0_15px_rgba(0,0,0,0.5)]">
              ⏳ {moveTimerLeft}s
            </div>
            <div className="px-5 py-2 rounded-xl font-bold tracking-wide border backdrop-blur-md shadow-lg"
              style={{ 
                backgroundColor: MODE_COLORS[getModeForCell(room.leader_position) as RoundMode] + '20',
                borderColor: MODE_COLORS[getModeForCell(room.leader_position) as RoundMode] + '40',
                color: MODE_COLORS[getModeForCell(room.leader_position) as RoundMode],
                textShadow: '0 2px 4px rgba(0,0,0,0.8)'
              }}>
              В ПЕРЕДИ: {MODE_LABELS[getModeForCell(room.leader_position) as RoundMode]}
            </div>
          </div>

          {/* BoardView moved to persistent layout */}

          {moveMessage && (
            <div className="mx-auto max-w-xl w-full bg-indigo-950/40 backdrop-blur-md border border-indigo-400/30 shadow-[0_4px_30px_rgba(99,102,241,0.2)] rounded-2xl p-5 text-center text-indigo-100 font-bold tracking-wide animate-[fadeInUp_0.5s_ease-out] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              {moveMessage}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            {ranked.map((p, i) => <PlayerCard key={p.id} player={p} rank={i + 1} />)}
          </div>
        </div>
      )}

      {/* ─── ROUND INTRO ─── */}
      {room.status === 'round_intro' && (
        <div className="min-h-full h-full flex flex-col items-center justify-center gap-6 relative z-10 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(255,255,255,0.05),_transparent_80%)] pointer-events-none -z-10" />
          
          <div className="text-[10rem] font-black drop-shadow-[0_0_50px_rgba(255,255,255,0.2)] animate-[float_4s_ease-in-out_infinite] leading-none mb-4">
            {MODE_LABELS[room.current_mode as RoundMode]?.split(' ')[0] ?? '🎮'}
          </div>
          
          <h2 
            className="text-5xl md:text-7xl font-black tracking-widest uppercase drop-shadow-[0_4px_10px_rgba(0,0,0,1)] text-center px-4" 
            style={{ 
              color: MODE_COLORS[room.current_mode as RoundMode],
              textShadow: `0 0 30px ${MODE_COLORS[room.current_mode as RoundMode]}60`
            }}
          >
            {MODE_LABELS[room.current_mode as RoundMode]}
          </h2>
          
          <div className="mt-2 bg-black/40 backdrop-blur-md border border-white/10 px-8 py-2 rounded-full shadow-[0_0_20px_rgba(0,0,0,0.5)]">
             <p className="text-white/60 text-xl md:text-2xl font-bold tracking-[0.3em] uppercase">Раунд {room.current_round}</p>
          </div>
          
          {room.zombie_bomb_active && (
            <div className="mt-4 px-10 py-4 bg-green-950/60 backdrop-blur-md border border-green-500/50 rounded-full text-green-300 font-black text-2xl tracking-wide shadow-[0_0_40px_rgba(34,197,94,0.3)] animate-[pulse_1.5s_ease-in-out_infinite]">
              💣 ЗОМБИ-БОМБА АКТИВИРОВАНА!
            </div>
          )}
          
          <p className="text-white/30 text-lg uppercase tracking-widest mt-8 font-bold animate-[pulse_2s_ease-in-out_infinite]">Подготовьтесь...</p>
        </div>
      )}

      {/* ─── ROUND PLAYING ─── */}
      {room.status === 'round_playing' && currentQ && (
        <div className="min-h-full h-full flex flex-col p-6 gap-4">
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

          {room.current_mode === 'interpreter' && (() => {
            const iq = currentQ as unknown as InterpreterQuestion | null;
            const chain = iq?.source_lang_chain?.map(c => LANG_NAMES[c] ?? c).join(' → ');
            return (
              <div className="flex-1 flex flex-col items-center gap-6 justify-center max-w-2xl mx-auto">
                {chain && <p className="text-purple-400 text-sm font-medium">🌐 {chain}</p>}
                <div className="bg-gray-900 border border-purple-500/40 rounded-2xl p-6 text-lg italic text-purple-200">
                  "{iq?.translated_text ?? ''}"
                </div>
                {room.zombie_bomb_active && (
                  <p className="text-red-400 font-bold">💣 Только название песни!</p>
                )}
              </div>
            );
          })()}

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
              <h2 className="text-2xl font-bold text-pink-400">🔴 Дневник памяти</h2>
              <p className="text-gray-400 text-lg">Игроки воспроизводят последовательность...</p>
              <div className="flex gap-3">
                {colorSequence.map((_, i) => (
                  <div key={i} className="w-16 h-16 rounded-full border-4 border-white/10 bg-gray-800" />
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
          
          {/* Test mode controls */}
          {room.current_round === 999 && (
            <div className="bg-blue-900/20 border border-blue-500/40 rounded-xl p-4 text-center flex gap-4 justify-center">
              <button
                onClick={() => processRoundResults()}
                className="px-6 py-3 bg-green-600 hover:bg-green-500 rounded-xl font-bold text-white transition-colors"
              >
                📊 Показать результаты
              </button>
              <button
                onClick={async () => {
                  await resetPlayersAfterTest();
                  await setRoomStatus(room.id, 'rules');
                  setTestMode('select');
                }}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white transition-colors"
              >
                🔄 Выбрать другой режим
              </button>
              <button
                onClick={async () => {
                  await resetPlayersAfterTest();
                  await setRoomStatus(room.id, 'rules');
                  setTestMode(null);
                }}
                className="px-6 py-3 bg-gray-600 hover:bg-gray-500 rounded-xl font-bold text-white transition-colors"
              >
                ❌ Выход из тестирования
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── ROUND RESULTS ─── */}
      {room.status === 'round_results' && (
        <div className="min-h-full h-full flex flex-col p-6 gap-4">
          <h2 className="text-3xl font-black text-center">
            {(room.round_results_data as { blitz_mode?: boolean } | null)?.blitz_mode
              ? '⚡ Результаты блица'
              : '📊 Результаты раунда'}
          </h2>

          {/* Blitz: show slow player + auto-advance notice */}
          {(room.round_results_data as { blitz_mode?: boolean } | null)?.blitz_mode && (() => {
            const rd = room.round_results_data as { blitz_slow_player_id?: string } | null;
            const slowP = rd?.blitz_slow_player_id ? players.find(p => p.id === rd.blitz_slow_player_id) : null;
            return (
              <div className="flex flex-col items-center gap-2">
                {slowP && (
                  <div className="bg-red-900/30 border border-red-500/50 rounded-xl px-4 py-2 text-center">
                    <span className="text-red-400 font-bold">🐌 Слишком медленно: {slowP.name}</span>
                  </div>
                )}
                <p className="text-gray-400 text-sm animate-pulse">Следующий вопрос через 2 сек…</p>
              </div>
            );
          })()}

          {room.round_results_data && (
            <div className="max-w-3xl mx-auto w-full flex flex-col gap-4">
              {room.current_mode !== 'mathematician' && (
                <div className="text-center bg-gray-900 border border-gray-700 rounded-xl p-3">
                  <span className="text-gray-400 text-sm">Правильный ответ: </span>
                  <span className="font-bold text-green-400">{room.round_results_data.correct_answer}</span>
                </div>
              )}

              {room.current_mode === 'interpreter' && (() => {
                const iq = room.question_data as unknown as InterpreterQuestion | null;
                if (!iq) return null;
                return (
                  <div className="bg-gray-900 border border-purple-500/30 rounded-xl p-4 flex flex-col gap-1 text-sm">
                    <p className="text-purple-200 italic">«{iq.original_text}»</p>
                    {iq.artist && <p className="text-gray-400">🎤 Исполнитель: <span className="text-white font-bold">{iq.artist}{iq.aka ? ` (${iq.aka})` : ''}</span></p>}
                    {iq.composer && <p className="text-gray-400">🎵 Композитор: <span className="text-white font-bold">{iq.composer}</span></p>}
                    {iq.lyricist && <p className="text-gray-400">✍️ Автор текста: <span className="text-white font-bold">{iq.lyricist}</span></p>}
                    {iq.author && <p className="text-gray-400">✍️ Автор: <span className="text-white font-bold">{iq.author}</span></p>}
                    {iq.authors && <p className="text-gray-400">✍️ Авторы: <span className="text-white font-bold">{iq.authors.join(', ')}</span></p>}
                  </div>
                );
              })()}

              {/* ─── Full leaderboard ─── */}
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-2 text-center">Общий рейтинг</p>
                <div className="grid gap-1">
                  {rankPlayers(players.filter(p => !p.is_host)).map((p, i) => {
                    const r = roundResultsData.find(x => x.player_id === p.id);
                    const newLives = r?.new_lives ?? p.lives;
                    const newPos = r?.new_position ?? p.position;
                    const newKarma = r?.new_karma ?? p.karma;
                    const newZombie = r?.is_zombie_now ?? p.is_zombie;
                    return (
                      <div key={p.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm ${
                        r?.is_correct ? 'border-green-600/40 bg-green-900/10' : 'border-red-600/20 bg-red-900/10'
                      }`}>
                        <span className={`font-black w-5 text-center text-sm ${i === 0 ? 'text-yellow-400' : 'text-gray-500'}`}>#{i + 1}</span>
                        <img src={getAvatarUrl(p.avatar, newLives)} alt="" className="w-7 h-7 object-contain" />
                        <span className="font-medium flex-1">{p.name}</span>
                        {/* Result this round */}
                        {r && (r.is_correct
                          ? <span className="text-green-400 font-bold">{r.was_first ? '⚡+2' : '✅+1'}</span>
                          : <span className="text-red-400 font-bold">❌−♥</span>
                        )}
                        {/* Board position */}
                        <span className="text-gray-300 font-mono text-xs w-12 text-right">кл.{newPos}</span>
                        {/* Lives */}
                        <span className="text-red-400 text-xs w-12 text-center">
                          {newZombie ? '🧟' : '❤️'.repeat(newLives) + '🖤'.repeat(Math.max(0, 3 - newLives))}
                        </span>
                        {/* Karma */}
                        {newKarma > 0 && (
                          <span className={`text-xs font-bold w-8 text-right ${newKarma >= 3 ? 'text-yellow-300' : 'text-gray-400'}`}>
                            {newKarma}✨
                          </span>
                        )}
                        {/* Round events */}
                        {(r?.karma_change ?? 0) > 0 && <span className="text-yellow-400 text-xs">+{r!.karma_change}✨</span>}
                        {r?.is_zombie_now && !p.is_zombie && <span className="text-green-300 text-xs font-bold">🧟NEW</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          
          {/* Test mode return buttons */}
          {room.current_round === 999 && (
            <div className="max-w-3xl mx-auto w-full mt-6 flex justify-center">
              <button
                onClick={async () => {
                  await resetPlayersAfterTest();
                  await setRoomStatus(room.id, 'rules');
                  setTestMode('select');
                }}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white transition-colors"
              >
                🔄 Выбрать другой режим
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── BET REVEAL ─── */}
      {room.status === 'bet_reveal' && betResultsData && (
        <div className="min-h-full h-full flex flex-col items-center justify-center gap-6 p-6">
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
        <div className="min-h-full h-full flex flex-col items-center justify-center gap-8">
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
        <div className="min-h-full h-full flex flex-col items-center justify-center gap-6 p-6">
          <h2 className="text-3xl font-black">
            {duel.mode === 'minesweeper' ? '💣 Сапёр' :
             duel.mode === 'arithmetic_mean' ? '📊 Среднее арифметическое' :
             '🗳️ Прогноз толпы'}
          </h2>

          {duel.mode === 'minesweeper' && (
            <div className="text-center max-w-lg">
              <p className="text-gray-300 mb-4">Остальные игроки расставляют мины на плитках.</p>
              <p className="text-gray-400 text-sm">Дуэлянты будут выбирать плитки по очереди.</p>
              <div className="mt-4 grid grid-cols-3 gap-2 max-w-xs mx-auto">
                {Array.from({ length: (duel.duel_data as { tile_count?: number })?.tile_count ?? 9 }).map((_, i) => (
                  <div key={i} className="h-16 bg-gray-800 border border-gray-600 rounded-lg flex items-center justify-center text-gray-500 text-2xl">?</div>
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
        <div className="min-h-full h-full flex flex-col items-center justify-center gap-8 p-6">
          <h2 className="text-3xl font-black">⚔️ Дуэлянты отвечают</h2>

          {duel.mode === 'minesweeper' && (() => {
            const dd = duel.duel_data as { tile_count?: number; mined_tiles?: Record<string, number[]>; challenger_picks?: number[]; challenged_picks?: number[]; exploded_challenger?: boolean; exploded_challenged?: boolean } | null;
            const challengerPicks = dd?.challenger_picks ?? [];
            const challengedPicks = dd?.challenged_picks ?? [];
            const allMines = Object.values(dd?.mined_tiles ?? {}).flat();
            const tileCount = dd?.tile_count ?? 9;
            
            const challenger = players.find(p => p.id === duel.challenger_id);
            const challenged = players.find(p => p.id === duel.challenged_id);

            return (
              <div className="flex flex-col items-center gap-6">
                <div className="flex items-center gap-8 mb-4">
                  {[{ p: challenger, picks: challengerPicks, id: duel.challenger_id }, { p: challenged, picks: challengedPicks, id: duel.challenged_id }].map(({ p, picks, id }) => (
                    <div key={id} className={`flex flex-col items-center gap-2 p-4 rounded-2xl border ${picks.length > 0 ? 'border-green-500 bg-green-900/20' : 'border-gray-600 bg-gray-900'}`}>
                      {p && <img src={getAvatarUrl(p.avatar, p.lives)} alt="" className="w-16 h-16 object-contain" />}
                      <span className="font-bold">{p?.name}</span>
                      {picks.length > 0 ? <span className="text-green-400">✅ Выбрал</span> : <span className="text-gray-400 animate-pulse">Выбирает...</span>}
                    </div>
                  ))}
                </div>

                <div
                  className="grid gap-2"
                  style={{ gridTemplateColumns: `repeat(${Math.ceil(Math.sqrt(tileCount))}, 1fr)`, width: `${Math.ceil(Math.sqrt(tileCount)) * 84}px` }}
                >
                  {Array.from({ length: tileCount }).map((_, i) => {
                    const isMined = allMines.includes(i);
                    const challengerPicked = challengerPicks.includes(i);
                    const challengedPicked = challengedPicks.includes(i);
                    const explodedHere = (challengerPicked && isMined) || (challengedPicked && isMined);
                    
                    return (
                      <div key={i} className={`aspect-square rounded-xl font-bold text-3xl flex items-center justify-center border-2 transition-all ${
                        explodedHere ? 'bg-red-900 border-red-500 animate-pulse' :
                        challengerPicked ? 'bg-blue-800 border-blue-500' :
                        challengedPicked ? 'bg-purple-800 border-purple-500' :
                        'bg-gray-800 border-gray-600'
                      }`}>
                        {explodedHere ? '💥' : challengerPicked ? '🔵' : challengedPicked ? '🟣' : '?'}
                      </div>
                    );
                  })}
                </div>


              </div>
            );
          })()}

          {duel.mode !== 'minesweeper' && (
            <>
              <div className="flex items-center gap-8">
                {[duel.challenger_id, duel.challenged_id].map(pid => {
                  const p = players.find(x => x.id === pid);
                  const dd = duel.duel_data as { challenger_answer?: unknown; challenged_answer?: unknown; challenger_prediction?: unknown; challenged_prediction?: unknown } | null;
                  const hasAnswered = pid === duel.challenger_id
                    ? dd?.challenger_answer != null || dd?.challenger_prediction != null
                    : dd?.challenged_answer != null || dd?.challenged_prediction != null;
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


            </>
          )}
        </div>
      )}

      {/* ─── DUEL RESULT ─── */}
      {room.status === 'duel_result' && (
        <div className="min-h-full h-full flex flex-col items-center justify-center gap-6">
          <h2 className="text-4xl font-black">⚔️ Итог дуэли</h2>
          {(() => {
            const winnerId = duel?.winner_id ?? (room.duel_data as { winner_id?: string } | null)?.winner_id ?? null;
            const w = winnerId ? players.find(p => p.id === winnerId) : null;
            return w ? (
              <div className="flex flex-col items-center gap-2">
                <img src={getAvatarUrl(w.avatar, w.lives)} alt="" className="w-24 h-24 object-contain" />
                <span className="text-2xl font-black text-yellow-400">🏆 {w.name} победил!</span>
              </div>
            ) : (
              <span className="text-2xl font-bold text-gray-400">🤝 Ничья — все остаются</span>
            );
          })()}

          {/* Duel answer summary */}
          {duel && (() => {
            const ch = players.find(p => p.id === duel.challenger_id);
            const cd = players.find(p => p.id === duel.challenged_id);
            if (duel.mode === 'arithmetic_mean') {
              const dd = duel.duel_data as { average?: number | null; challenger_answer?: number | null; challenged_answer?: number | null } | null;
              if (!dd) return null;
              return (
                <div className="flex flex-col items-center gap-3 bg-gray-900/60 border border-gray-700 rounded-2xl px-8 py-4">
                  <p className="text-blue-400 font-bold text-xl">📊 Среднее: {dd.average != null ? dd.average.toFixed(2) : '—'}</p>
                  <div className="flex gap-8">
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-gray-400 text-sm">{ch?.name ?? '—'}</span>
                      <span className="text-white font-bold text-lg">{dd.challenger_answer ?? '—'}</span>
                    </div>
                    <div className="text-gray-600 self-center">vs</div>
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-gray-400 text-sm">{cd?.name ?? '—'}</span>
                      <span className="text-white font-bold text-lg">{dd.challenged_answer ?? '—'}</span>
                    </div>
                  </div>
                </div>
              );
            }
            if (duel.mode === 'crowd_forecast') {
              const dd = duel.duel_data as { options?: string[]; player_votes?: Record<string, number>; majority_index?: number | null; challenger_prediction?: number | null; challenged_prediction?: number | null } | null;
              if (!dd || !dd.options) return null;
              const voteValues = Object.values(dd.player_votes ?? {});
              const totalVotes = voteValues.length;
              const isTie = dd.majority_index === -1;
              return (
                <div className="flex flex-col items-center gap-3 bg-gray-900/60 border border-gray-700 rounded-2xl px-6 py-4 max-w-sm w-full">
                  <p className="text-gray-300 text-sm font-semibold">
                    Голоса толпы:{isTie && <span className="text-yellow-400 ml-2">(ничья голосов)</span>}
                  </p>
                  <div className="flex flex-col gap-1 w-full">
                    {dd.options.map((opt, i) => {
                      const count = voteValues.filter(v => v === i).length;
                      const isMaj = !isTie && dd.majority_index === i;
                      return (
                        <div key={i} className={`flex items-center gap-2 px-3 py-1 rounded-lg text-sm ${isMaj ? 'bg-yellow-600/30 border border-yellow-500/60' : 'bg-gray-800/50'}`}>
                          <span className="text-gray-500 w-4 shrink-0">{i + 1}.</span>
                          <span className="flex-1 text-left truncate">{opt}</span>
                          <span className="font-bold shrink-0">{count}/{totalVotes}</span>
                          {isMaj && <span className="text-yellow-400">✓</span>}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-6 mt-1">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-gray-500 text-xs">{ch?.name}</span>
                      <span className="text-white text-sm font-bold">{dd.challenger_prediction != null ? (dd.options[dd.challenger_prediction] ?? `#${dd.challenger_prediction}`) : '—'}</span>
                    </div>
                    <div className="text-gray-600 self-center text-xs">vs</div>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-gray-500 text-xs">{cd?.name}</span>
                      <span className="text-white text-sm font-bold">{dd.challenged_prediction != null ? (dd.options[dd.challenged_prediction] ?? `#${dd.challenged_prediction}`) : '—'}</span>
                    </div>
                  </div>
                </div>
              );
            }
            return null;
          })()}

          {/* Test mode return buttons */}
          {room.current_round === 999 && (
            <div className="flex justify-center mt-8">
              <button
                onClick={async () => {
                  await resetPlayersAfterTest();
                  await setRoomStatus(room.id, 'rules');
                  setTestMode('select');
                }}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white transition-colors"
              >
                🔄 Выбрать другой режим
              </button>
            </div>
          )}
          
          {room.current_round !== 999 && <p className="text-gray-500 animate-pulse">Переход к следующему ходу...</p>}
        </div>
      )}

      {/* ─── HOT POTATO ─── */}
      {room.status === 'potato_intro' && (
        <div className="min-h-full h-full flex flex-col items-center justify-center gap-8 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-600 via-red-950 to-black p-8 relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-orange-600/20 blur-[120px] rounded-full pointer-events-none"></div>

          <h2 className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-br from-yellow-300 via-orange-500 to-red-600 drop-shadow-[0_0_30px_rgba(234,88,12,0.8)] animate-pulse tracking-tighter uppercase relative z-10">
            ГОРЯЧАЯ КАРТОШКА
          </h2>
          <div className="text-3xl text-gray-200 text-center max-w-4xl leading-relaxed flex flex-col gap-4 relative z-10 border border-orange-500/30 bg-black/40 backdrop-blur-md p-10 rounded-[2rem] shadow-2xl">
            <p>Вы слишком умные! Все выжившие ответили верно.</p>
            <p>Случайный игрок получает бомбу-картошку 💣</p>
            <p className="text-4xl text-orange-400 font-black mt-4 drop-shadow-[0_0_15px_rgba(234,88,12,0.6)]">
              ВЫПОЛНИ ЗАДАЧУ
            </p>
            <p className="text-xl text-gray-400">чтобы перекинуть её другому!</p>
            <p className="text-red-400 font-bold mt-2 border-t border-red-500/20 pt-6">У кого бомба взорвётся — теряет жизнь!</p>
          </div>
          <p className="text-2xl text-orange-300/70 animate-pulse relative z-10 tracking-wide uppercase">Подготовка передачи...</p>
        </div>
      )}

      {room.status === 'potato_playing' && (
        <div className="min-h-full h-full flex flex-col items-center justify-center p-8 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-red-950 via-black to-black relative overflow-hidden">
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
        <div className="min-h-full h-full flex flex-col items-center justify-center gap-12 bg-black bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-900/50 via-black to-black p-8 text-center relative overflow-hidden">
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
          
          {/* Test mode return buttons */}
          {room.current_round === 999 && (
            <div className="flex justify-center mt-8 relative z-10">
              <button
                onClick={async () => {
                  await resetPlayersAfterTest();
                  await setRoomStatus(room.id, 'rules');
                  setTestMode('select');
                }}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white transition-colors"
              >
                🔄 Выбрать другой режим
              </button>
            </div>
          )}
          
          {room.current_round !== 999 && <p className="text-gray-500 animate-pulse relative z-10 mt-4">Переход к следующему ходу...</p>}
        </div>
      )}

      {/* ─── BLITZ INTRO ─── */}
      {room.status === 'blitz_intro' && (
        <div className="min-h-full h-full flex flex-col items-center justify-center gap-6 bg-gradient-to-b from-gray-950 to-red-950">
          <h2 className="text-6xl font-black text-red-400 animate-pulse">⚡ БЛИЦ!</h2>
          <p className="text-xl text-gray-300 text-center max-w-lg">
            Забег на выживание! Правильный ответ → +1 клетка. Последний ответивший — штраф!<br />
            🧟 Зомби преследуют — каждый вопрос они идут вперёд.
          </p>
          <button onClick={async () => {
            // Play random start audio
            new Audio(randomFromPool(BLITZ_START_POOL, 5)).play().catch(() => {});
            // Start looped blitz BGM
            bgAudio.current.play(BLITZ_THEME, true);

            // Load blitz questions
            let qBank = blitzQBankRef.current;
            if (!qBank) {
              qBank = await loadPackQuestions(
                'https://storage.yandexcloud.net/vecherinkach/json/survivach', 'blitz'
              ) as Array<{ id: number; question: string; options: string[]; correct_index: number }>;
              blitzQBankRef.current = qBank;
            }
            const available = qBank.filter(q => !usedBlitzQIds.current.has(q.id));
            const pool = available.length > 0 ? available : qBank;
            const q = pool[Math.floor(Math.random() * pool.length)];
            if (!q) return;
            usedBlitzQIds.current.add(q.id);

            const gamePlayers = await fetchPlayers(room.id);
            const nonHostPlayers = gamePlayers.filter(p => !p.is_host);
            const leaderPlayer = rankPlayers(nonHostPlayers)[0] ?? null;
            const leaderPos = getLeaderPosition(nonHostPlayers);

            // Leader sees 3 options (remove last wrong option)
            const removeIdx = q.correct_index === 3 ? 2 : 3;
            const leaderOptions = q.options.filter((_, i) => i !== removeIdx);
            const leaderCorrectIndex = q.correct_index > removeIdx ? q.correct_index - 1 : q.correct_index;

            const questionData = {
              mode: 'blitz',
              id: q.id,
              question: q.question,
              options: q.options,
              correct_index: q.correct_index,
              leader_options: leaderOptions,
              leader_correct_index: leaderCorrectIndex,
              leader_player_id: leaderPlayer?.id ?? null,
            };
            setCurrentQ(questionData);
            await setRoomStatus(room.id, 'round_playing', {
              current_round: room.current_round,
              leader_position: leaderPos,
              current_mode: 'blitz',
              question_data: questionData,
              timer_started_at: new Date().toISOString(),
              timer_duration_sec: 30,
            });
          }} className="px-12 py-5 bg-red-600 hover:bg-red-500 rounded-2xl text-2xl font-black">
            ⚡ ПОГНАЛИ!
          </button>
        </div>
      )}

      {/* ─── FINISHED ─── */}
      {room.status === 'finished' && (
        <div className="min-h-full h-full flex flex-col items-center justify-center gap-8 p-6">
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

      </div>

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

      {/* ─── Persistent host controls (all active game screens) ─── */}
      {!['lobby', 'finished'].includes(room.status) && (
        <div className="fixed bottom-4 left-4 z-[100] flex gap-2">
          {/* "Далее" – force-advance to next phase */}
          {['moving','round_intro','round_playing','round_results','bet_reveal','duel_intro','duel_setup','duel_result','potato_intro','potato_playing','potato_result'].includes(room.status) && (
            <button
              onClick={handleForceNext}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 active:scale-95 border border-white/20 rounded-xl text-white/90 text-sm font-black uppercase tracking-widest backdrop-blur-md shadow-lg transition-all"
            >
              Далее ⏭
            </button>
          )}
          {/* "Закрыть комнату" */}
          {room.status !== 'rules' && (
            <button
              onClick={handleCloseRoom}
              className="px-4 py-2 bg-black/40 hover:bg-red-950/80 active:scale-95 border border-red-900/50 rounded-xl text-red-300/80 hover:text-red-200 text-sm font-black uppercase tracking-widest backdrop-blur-md shadow-lg transition-all"
            >
              Закрыть ❌
            </button>
          )}
        </div>
      )}
    </div>
  );
}
