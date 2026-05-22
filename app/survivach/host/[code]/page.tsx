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
import { getRandomMode } from '@/lib/survivach/gameModes';
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

function hasAdjacentTarget(player: SurvivachPlayer, allPlayers: SurvivachPlayer[]): boolean {
  return allPlayers.some(p => !p.is_host && p.id !== player.id && Math.abs(p.position - player.position) === 1);
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

  const playersByCell = players.reduce((acc, p) => {
    if (!acc[p.position]) acc[p.position] = [];
    acc[p.position].push(p);
    return acc;
  }, {} as Record<number, SurvivachPlayer[]>);

  return (
    <div className="relative w-full bg-[#1c082b] rounded-2xl md:rounded-[2rem] border-4 border-[#ff0055] min-h-[140px] shadow-[8px_8px_0_#4a044e,0_0_50px_rgba(255,0,85,0.4)] overflow-hidden p-3 md:p-8 max-w-[1500px] mx-auto my-4 isolate">
      {/* Comic Book Halftone & Magic Grunge Background */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-20" 
        style={{ 
          backgroundImage: 'radial-gradient(circle, #fuchsia 2px, transparent 2px)', 
          backgroundSize: '12px 12px' 
        }} 
      />
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-[#7e22ce]/50 via-transparent to-[#b91c1c]/50 mix-blend-overlay" />
      <div className="absolute -top-10 -left-10 w-40 h-40 bg-[#c026d3] blur-[80px] pointer-events-none opacity-40" />
      <div className="absolute -bottom-10 -right-10 w-56 h-56 bg-[#059669] blur-[100px] pointer-events-none opacity-30" />

      {/* Grid Container Base */}
      <div className="relative w-full aspect-[4/1] md:aspect-[13/2.2] z-10">
        {/* COMIC CELLS */}
        {cells.map(cell => {
          const pos = getCellPos(cell);
          const isLeader = cell === leaderPosition;
          const isBlitz = cell >= BLITZ_START;
          const isStart = cell === 1;
          
          return (
            <div
              key={`cell-${cell}`}
              className="absolute p-0.5 md:p-1.5 transition-all duration-500 will-change-transform"
              style={{
                left: `${(pos.col / COLS) * 100}%`,
                top: `${(pos.row / ROWS) * 100}%`,
                width: `${100 / COLS}%`,
                height: `${100 / ROWS}%`,
              }}
            >
              <div className={`relative w-full h-full rounded md:rounded-xl border-2 md:border-4 flex flex-col items-center justify-center transition-all overflow-hidden ${
                isLeader 
                  ? 'border-yellow-400 bg-yellow-500/20 shadow-[0_0_20px_#facc15,inset_0_0_15px_#ca8a04] scale-[1.05]' 
                  : isBlitz 
                    ? 'border-red-500 bg-red-950/40 shadow-[4px_4px_0_#991b1b]' 
                    : isStart
                      ? 'border-emerald-500 bg-emerald-950/40 shadow-[4px_4px_0_#065f46]'
                      : 'border-white/20 bg-black/40 shadow-[4px_4px_0_#1e1b4b] hover:border-fuchsia-500 hover:bg-fuchsia-900/40'
              }`}
              >
                {/* Comic style high contrast diagonal stripes */}
                <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, #ffffff 10px, #ffffff 20px)' }} />

                <span className="absolute top-1 left-1 md:top-1.5 md:left-2 text-[8px] md:text-xs font-black text-white/40 z-10 font-[Impact,sans-serif] tracking-wider [text-shadow:1px_1px_0_#000]">{cell}</span>
                
                {isStart ? (
                  <div className="text-emerald-400 text-xl md:text-3xl font-black drop-shadow-[2px_2px_0_#000] z-10 shrink-0">🏠</div>
                ) : isBlitz ? (
                  <div className="text-red-500 text-xl md:text-3xl font-black drop-shadow-[2px_2px_0_#000] animate-[pulse_0.5s_ease-in-out_infinite] z-10 shrink-0">💀</div>
                ) : (
                  <div className="text-fuchsia-400 text-lg md:text-2xl font-black drop-shadow-[2px_2px_0_#000] z-10 opacity-70 shrink-0">🔮</div>
                )}
              </div>
            </div>
          );
        })}

        {/* OVERLAY PLAYERS with smooth path transition */}
        {players.map(p => {
          const pos = getCellPos(p.position);
          
          const siblings = playersByCell[p.position] || [];
          const idx = siblings.findIndex(s => s.id === p.id);
          const total = siblings.length;
          
          const baseX = (pos.col / COLS) * 100 + (100 / COLS / 2);
          const baseY = (pos.row / ROWS) * 100 + (100 / ROWS / 2);
          
          const offsetX = total > 1 ? (idx % 2 === 0 ? -12 : 12) + (Math.floor(idx/2) * 5) : 0;
          const offsetY = total > 1 ? (idx < 2 ? -8 : 12) : 0;

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
                className={`relative group drop-shadow-[2px_6px_0_rgba(0,0,0,0.8)] filter transition-all duration-500 will-change-transform ${p?.is_zombie ? 'animate-[bounce_2s_ease-in-out_infinite]' : 'animate-[float_3s_ease-in-out_infinite]'}`}
                style={{ animationDelay: floatDelay }}
              >
                {/* Comic style magic aura for zombies/high karma */}
                {p.is_zombie && <div className="absolute inset-0 bg-lime-400 blur-xl opacity-60 rounded-full scale-[1.5] pointer-events-none mix-blend-screen animate-pulse" />}
                {!p.is_zombie && p.karma === 1 && <div className="absolute inset-0 bg-cyan-400/30 blur-md rounded-full scale-[1.1] pointer-events-none mix-blend-screen" />}
                {!p.is_zombie && p.karma === 2 && <div className="absolute inset-0 bg-cyan-400/55 blur-lg rounded-full scale-[1.26] pointer-events-none mix-blend-screen animate-pulse" />}
                {!p.is_zombie && p.karma >= 3 && (
                  <>
                    <div className="absolute inset-0 bg-yellow-400/50 blur-xl rounded-full scale-[1.46] pointer-events-none mix-blend-screen animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]" />
                    <div className="absolute inset-0 bg-amber-500/40 blur-xl rounded-full scale-[1.46] pointer-events-none mix-blend-screen animate-pulse" />
                  </>
                )}

                <img
                  src={getAvatarUrl(p.avatar, p.lives)}
                  alt={p.name}
                  className={`w-10 h-10 md:w-16 md:h-16 object-contain pointer-events-none transition-transform duration-300 drop-shadow-[0_0_15px_rgba(255,255,255,0.4)] ${p.is_zombie ? 'saturate-[2] brightness-110 hue-rotate-[100deg]' : ''}`}
                />
                
                {/* Status badges with comic border */}
                {p.is_zombie && <div className="absolute -top-2 -right-2 text-sm md:text-xl drop-shadow-[2px_2px_0_#000]">🧟‍♂️</div>}
                
                {/* Player Name - Comic style */}
                <div className="absolute -bottom-4 md:-bottom-6 left-1/2 -translate-x-1/2 bg-yellow-400 px-2 py-0.5 rounded-sm border-2 border-black text-[8px] md:text-[11px] font-black text-black whitespace-nowrap shadow-[2px_2px_0_rgba(0,0,0,1)] uppercase tracking-wider font-[Impact,sans-serif]">
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
function PlayerCard({ player, rank, showKarma = true, hasAnswered = false }: {
  player: SurvivachPlayer;
  rank: number;
  showKarma?: boolean;
  hasAnswered?: boolean;
}) {
  return (
    <div className={`group flex items-center gap-3 rounded-xl p-2.5 border transition-all duration-300 backdrop-blur-md ${
      player.is_zombie 
        ? 'border-green-400/30 bg-green-950/30 shadow-[0_0_15px_rgba(74,222,128,0.1)] hover:shadow-[0_0_20px_rgba(74,222,128,0.2)] hover:border-green-400/50' 
        : hasAnswered
          ? 'border-emerald-500/50 bg-emerald-950/40 shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:bg-emerald-950/50 hover:border-emerald-400/60'
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
        {!player.is_zombie && player.karma === 1 && <div className="absolute inset-0 bg-cyan-400/20 blur-sm rounded-full -z-10 mix-blend-screen" />}
        {!player.is_zombie && player.karma === 2 && <div className="absolute inset-0 bg-cyan-400/40 blur-md rounded-full -z-10 mix-blend-screen animate-pulse" />}
        {!player.is_zombie && player.karma >= 3 && <div className="absolute inset-0 bg-yellow-400/50 blur-lg rounded-full -z-10 mix-blend-screen animate-pulse" />}
        {hasAnswered && (
          <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-black text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-black border-2 border-emerald-950 z-20 shadow-lg animate-in zoom-in spin-in rotate-12 duration-300">
            ✓
          </div>
        )}
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
   FinishedView — cinematic end-game screen
   ══════════════════════════════════════════ */
function FinishedView({ ranked, onExit }: { ranked: ReturnType<typeof rankPlayers>; onExit: () => void }) {
  const [phase, setPhase] = useState<'intro' | 'podium' | 'credits'>('intro');

  useEffect(() => {
    const finalAudio = new Audio('https://storage.yandexcloud.net/vecherinkach/json/survivach/final_track/last_theme.mp3');
    finalAudio.volume = 0.8;
    finalAudio.play().catch(() => {});
    const t1 = setTimeout(() => setPhase('podium'), 4000);
    const t2 = setTimeout(() => setPhase('credits'), 14000);
    return () => {
      finalAudio.pause();
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const top3 = ranked.slice(0, 3);

  return (
    <div className="min-h-screen w-full bg-black text-white relative overflow-hidden flex flex-col">
      <style>{`
        @keyframes scrollCredits { 0% { transform: translateY(0); } 100% { transform: translateY(-100%); } }
      `}</style>

      {/* Ambient glows */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-purple-900/30 blur-[150px] animate-pulse" style={{ animationDuration: '6s' }} />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-blue-900/30 blur-[150px] animate-pulse" style={{ animationDuration: '8s' }} />
      </div>

      {/* Phase: INTRO */}
      {phase === 'intro' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center animate-[fadeIn_1s_ease-in-out]">
          <h1 className="text-[120px] font-black uppercase tracking-[0.15em] text-transparent bg-clip-text bg-gradient-to-br from-yellow-300 via-yellow-500 to-yellow-600 drop-shadow-[0_0_80px_rgba(234,179,8,0.6)] animate-[epicReveal_2s_ease-out_both] text-center leading-none">
            ИГРА<br />ОКОНЧЕНА
          </h1>
        </div>
      )}

      {/* Phase: PODIUM */}
      {phase === 'podium' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-8 animate-[fadeIn_1.5s_ease-out]">
          <h2 className="text-5xl font-black mb-12 text-yellow-400 tracking-widest drop-shadow-[0_0_20px_rgba(234,179,8,0.5)]">
            ВЕЛИКОЛЕПНАЯ ТРОЙКА
          </h2>
          <div className="flex items-end justify-center gap-10 h-[50vh]">
            {/* 2nd */}
            {top3[1] && (
              <div className="flex flex-col items-center animate-[slideUp_1s_ease-out_both] justify-end" style={{ animationDelay: '0.8s' }}>
                <div className="relative mb-4 drop-shadow-[0_0_30px_rgba(192,192,192,0.6)]">
                  <img src={getAvatarUrl(top3[1].avatar, top3[1].lives)} alt={top3[1].name} className="w-36 h-36 object-contain" />
                </div>
                <div className="bg-gradient-to-t from-gray-500 to-gray-300 w-52 h-44 rounded-t-3xl flex flex-col items-center pt-5 shadow-[0_-10px_40px_rgba(192,192,192,0.4)] border-t-4 border-gray-200">
                  <span className="text-5xl font-black text-gray-900">2</span>
                  <span className="mt-3 font-bold text-lg uppercase tracking-widest text-gray-900 truncate px-2 w-full text-center">{top3[1].name}</span>
                </div>
              </div>
            )}
            {/* 1st */}
            {top3[0] && (
              <div className="flex flex-col items-center animate-[slideUp_1s_ease-out_both] justify-end z-20" style={{ animationDelay: '2s' }}>
                <div className="relative mb-4 drop-shadow-[0_0_60px_rgba(250,204,21,0.9)]">
                  <div className="absolute -top-14 left-1/2 -translate-x-1/2 text-8xl animate-bounce">👑</div>
                  <img src={getAvatarUrl(top3[0].avatar, top3[0].lives)} alt={top3[0].name} className="w-52 h-52 object-contain" />
                </div>
                <div className="bg-gradient-to-t from-yellow-700 via-yellow-500 to-yellow-400 w-64 h-60 rounded-t-3xl flex flex-col items-center pt-5 shadow-[0_-20px_80px_rgba(250,204,21,0.6)] border-t-8 border-yellow-200">
                  <span className="text-8xl font-black text-yellow-950">1</span>
                  <span className="mt-3 font-bold text-2xl uppercase tracking-widest text-yellow-950 truncate px-2 w-full text-center">{top3[0].name}</span>
                </div>
              </div>
            )}
            {/* 3rd */}
            {top3[2] && (
              <div className="flex flex-col items-center animate-[slideUp_1s_ease-out_both] justify-end" style={{ animationDelay: '1.2s' }}>
                <div className="relative mb-4 drop-shadow-[0_0_30px_rgba(180,83,9,0.6)]">
                  <img src={getAvatarUrl(top3[2].avatar, top3[2].lives)} alt={top3[2].name} className="w-36 h-36 object-contain" />
                </div>
                <div className="bg-gradient-to-t from-amber-900 to-amber-700 w-52 h-32 rounded-t-3xl flex flex-col items-center pt-5 shadow-[0_-10px_40px_rgba(180,83,9,0.4)] border-t-4 border-amber-600">
                  <span className="text-5xl font-black text-amber-200">3</span>
                  <span className="mt-3 font-bold text-lg uppercase tracking-widest text-amber-200 truncate px-2 w-full text-center">{top3[2].name}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Phase: CREDITS (scrolling stats) */}
      {phase === 'credits' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center animate-[fadeIn_2s_ease-in-out]">
          {/* Top/bottom fade masks */}
          <div className="w-full h-32 bg-gradient-to-b from-black to-transparent absolute top-0 z-20 pointer-events-none" />
          <div className="w-full h-32 bg-gradient-to-t from-black to-transparent absolute bottom-0 z-20 pointer-events-none" />

          <div className="w-full max-w-5xl flex-1 overflow-hidden relative">
            <div className="absolute top-full left-0 w-full flex flex-col gap-10 px-4 pb-[100vh]" style={{ animation: 'scrollCredits 50s linear forwards' }}>
              <div className="text-center mb-12 mt-8">
                <h2 className="text-6xl font-black text-white tracking-[0.3em] uppercase drop-shadow-[0_0_20px_rgba(255,255,255,0.5)]">
                  ИТОГОВЫЙ РЕЙТИНГ
                </h2>
                <div className="w-32 h-1 bg-yellow-500 mx-auto mt-6 rounded-full" />
              </div>

              {ranked.map((p, i) => (
                <div key={p.id} className="flex items-center gap-6 bg-gray-900/60 backdrop-blur-xl border border-gray-700/80 rounded-3xl p-5 shadow-2xl">
                  <div className="w-20 text-center shrink-0">
                    <span className="text-5xl font-black text-gray-500">#{i + 1}</span>
                  </div>
                  <img src={getAvatarUrl(p.avatar, p.lives)} alt={p.name} className="w-24 h-24 object-contain shrink-0 drop-shadow-lg" />
                  <div className="flex-1 min-w-0">
                    <div className="text-3xl font-black text-white uppercase tracking-wider truncate">{p.name}</div>
                    <div className="flex gap-4 mt-3 flex-wrap">
                      <div className="bg-blue-950/80 border border-blue-700/50 px-4 py-2 rounded-xl flex flex-col items-center min-w-[100px]">
                        <span className="text-[10px] text-blue-400 uppercase font-bold tracking-widest">Клетка</span>
                        <span className="text-3xl font-black text-blue-300">{p.position}</span>
                      </div>
                      <div className="bg-red-950/80 border border-red-700/50 px-4 py-2 rounded-xl flex flex-col items-center min-w-[100px]">
                        <span className="text-[10px] text-red-400 uppercase font-bold tracking-widest">Жизни</span>
                        <span className="text-3xl font-black text-red-300">{p.lives}</span>
                      </div>
                      <div className="bg-yellow-950/80 border border-yellow-700/50 px-4 py-2 rounded-xl flex flex-col items-center min-w-[100px]">
                        <span className="text-[10px] text-yellow-400 uppercase font-bold tracking-widest">Карма</span>
                        <span className="text-3xl font-black text-yellow-300">{p.karma}</span>
                      </div>
                      <div className="bg-green-950/80 border border-green-700/50 px-4 py-2 rounded-xl flex flex-col items-center min-w-[100px]">
                        <span className="text-[10px] text-green-400 uppercase font-bold tracking-widest">Правильно</span>
                        <span className="text-3xl font-black text-green-300">{p.total_correct}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <div className="text-center mt-24">
                <p className="text-3xl font-black text-gray-500 uppercase tracking-[0.5em]">СПАСИБО ЗА ИГРУ</p>
                <p className="text-gray-700 mt-4 font-mono text-lg">VECHERINKACH © 2026</p>
              </div>
            </div>
          </div>

          <button
            onClick={onExit}
            className="absolute bottom-8 right-8 z-30 px-8 py-4 bg-white/10 hover:bg-white/20 active:scale-95 transition-all backdrop-blur-md rounded-2xl border border-white/20 text-white font-bold tracking-widest uppercase shadow-2xl"
          >
            Выход в панель
          </button>
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
  const [selectedRule, setSelectedRule] = useState<string | null>(null);
  const [roundResultsData, setRoundResultsData] = useState<PlayerRoundResult[]>([]);
  const [betResultsData, setBetResultsData] = useState<BetResultsData | null>(null);
  const [duelQ, setDuelQ] = useState<Record<string, unknown> | null>(null);
  const [pendingRoundData, setPendingRoundData] = useState<{
    current_mode: RoundMode | null;
    question_data: Record<string, unknown> | null;
    timer_duration_sec?: number | null;
  } | null>(null);
  const [duelEligibleCallers, setDuelEligibleCallers] = useState<SurvivachPlayer[]>([]);
  
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
  const duelResolvingRef = useRef(false);

  /* ─── Mode history (anti-repeat random selection) ─── */
  // Tracks the sequence of pre-blitz modes played this session.
  // getRandomMode() uses this to avoid back-to-back repeats.
  const usedModesHistoryRef = useRef<RoundMode[]>([]);

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
  const roomStatusRef = useRef<SurvivachRoom['status'] | null>(null);

  useEffect(() => {
    roomStatusRef.current = room?.status ?? null;
  }, [room?.status]);

  /* ─── Pre-selected round mode (set when moving starts, read by handleMoveAnimDone) ─── */
  // Storing it in a ref avoids stale-closure issues with setInterval;
  // the state counterpart drives the UI so players can see the upcoming mode.
  const nextModeRef = useRef<RoundMode | null>(null);
  const [nextModeDisplay, setNextModeDisplay] = useState<RoundMode | null>(null);

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

      // Pre-select the round mode NOW (before animation ends) so it can be shown on screen
      // and so handleMoveAnimDone never needs to re-roll (avoiding stale-closure issues).
      const leaderPos = room.leader_position ?? 1;
      const isPreBlitz = leaderPos < BLITZ_START;
      const preSelectedMode: RoundMode = isPreBlitz
        ? getRandomMode(usedModesHistoryRef.current)
        : getModeForCell(leaderPos, pack?.cell_sequence ?? []) as RoundMode;
      if (isPreBlitz) usedModesHistoryRef.current.push(preSelectedMode);
      nextModeRef.current = preSelectedMode;
      setNextModeDisplay(preSelectedMode);

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
        const pool = randomFromPool(TIMER_POOL, 6);
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

    if (st === 'duel_setup') {
      // Stage 1 duel_setup background music looping
      bgAudio.current.play(randomFromPool(PLAYER_ACTIONS_POOL, 3), true);
      // Mode-specific crowd/setup music plays once on top
      const duelMode = duel?.mode;
      if (duelMode === 'minesweeper') {
        fxAudio.current.play(randomFromPool(DUEL_AUDIO.minesweeper.setup, 5), false);
      } else if (duelMode === 'arithmetic_mean') {
        fxAudio.current.play(randomFromPool(DUEL_AUDIO.arithmetic_mean.crowd, 5), false);
      } else if (duelMode === 'crowd_forecast') {
        fxAudio.current.play(randomFromPool(DUEL_AUDIO.crowd_forecast.crowd, 5), false);
      }
    }

    if (st === 'duel_playing') {
      // Stage 2 duel_playing background music looping
      bgAudio.current.play(randomFromPool(DUELISTS_ACTIONS_POOL, 2), true);
      // Mode-specific duelists music plays once
      const duelMode = duel?.mode;
      if (duelMode === 'minesweeper') {
        fxAudio.current.play(randomFromPool(DUEL_AUDIO.minesweeper.duelists, 5), false);
      } else if (duelMode === 'arithmetic_mean') {
        fxAudio.current.play(randomFromPool(DUEL_AUDIO.arithmetic_mean.duelists, 5), false);
      } else if (duelMode === 'crowd_forecast') {
        fxAudio.current.play(randomFromPool(DUEL_AUDIO.crowd_forecast.duelists, 5), false);
      }
    }

    return () => {
      clearInterval(timerRef.current!);
      clearInterval(moveTimerRef.current!);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.status]);

  /* ─── duel_intro: eagerly fetch duel if not yet loaded (with retry) ─── */
  useEffect(() => {
    if (room?.status !== 'duel_intro' || duel || !room) return;
    let cancelled = false;
    const poll = async () => {
      for (let i = 0; i < 10 && !cancelled; i++) {
        const d = await fetchActiveDuel(room.id, room.current_round);
        if (d && !cancelled) { setDuel(d); return; }
        if (i < 9 && !cancelled) await new Promise<void>(r => setTimeout(r, 300));
      }
    };
    poll();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.status, duel]);

  useEffect(() => {
    if (room?.status !== 'duel_playing') {
      duelResolvingRef.current = false;
    }
  }, [room?.status, room?.current_round, duel?.id]);

  useEffect(() => {
    if (!room) {
      setDuelEligibleCallers([]);
      return;
    }
    if (!['moving', 'round_intro', 'round_playing'].includes(room.status)) {
      setDuelEligibleCallers([]);
      return;
    }
    if (duel || (room as unknown as { duel_initiated_in_round?: number | null }).duel_initiated_in_round === room.current_round) {
      setDuelEligibleCallers([]);
      return;
    }
    const gamePlayers = players.filter(p => !p.is_host);
    setDuelEligibleCallers(
      gamePlayers.filter(p => p.karma >= 3 && !p.is_zombie && hasAdjacentTarget(p, gamePlayers))
    );
  }, [room?.status, players, room?.current_round, duel?.id]);

  /* ─── duel_intro: show VS screen for 8s (audio plays, fixed timeout advances) ─── */
  useEffect(() => {
    if (room?.status !== 'duel_intro' || !duel || !room) return;
    bgAudio.current.stop();
    bgAudio.current.play(randomFromPool(DUEL_POOL, 8), false); // no callback — use fixed timer
    const timeoutId = setTimeout(async () => {
      const freshRoom = await fetchRoomById(room.id);
      if (freshRoom?.status !== 'duel_intro') return;
      await setRoomStatus(room.id, 'duel_setup', {});
    }, 8000);
    return () => {
      clearTimeout(timeoutId);
      bgAudio.current.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.status, duel?.id]);

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
      if (nonDuelists.length > 0 && dd?.mined_tiles && Object.keys(dd.mined_tiles).length >= nonDuelists.length) {
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
        const votes = Object.values(dd!.player_votes!).map(v => Number(v)).filter(v => Number.isInteger(v));
        if (votes.length === 0) return;
        const tally: Record<number, number> = {};
        votes.forEach(v => { tally[v] = (tally[v] ?? 0) + 1; });
        const sortedEntries = Object.entries(tally).sort((a, b) => b[1] - a[1]);
        const maxVoteCount = sortedEntries[0][1];
        const tiedOptions = sortedEntries.filter(e => e[1] === maxVoteCount);
        // -1 means a tie in votes (no clear majority) → will result in a draw
        const majorityIndex = tiedOptions.length === 1 ? Number(sortedEntries[0][0]) : -1;
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
    if (duelResolvingRef.current) return;
    const dd = duel.duel_data as {
      mined_tiles?: Record<string, number[]>;
      challenger_picks?: number[];
      challenged_picks?: number[];
      challenger_pick_at?: number | null;
      challenged_pick_at?: number | null;
      exploded_challenger?: boolean;
      exploded_challenged?: boolean;
    } | null;
    const challengerPicks = dd?.challenger_picks ?? [];
    const challengedPicks = dd?.challenged_picks ?? [];
    
    // Wait for both to pick
    if (challengerPicks.length === 0 || challengedPicks.length === 0) return;
    
    const allMines = Object.values(dd?.mined_tiles ?? {}).flat();
    const challengerHitMine = challengerPicks.some(pick => allMines.includes(pick));
    const challengedHitMine = challengedPicks.some(pick => allMines.includes(pick));
    const challengerPickAt = Number(dd?.challenger_pick_at ?? Infinity);
    const challengedPickAt = Number(dd?.challenged_pick_at ?? Infinity);
    
    // Determine winner
    let winnerId: string | null = null;
    if (challengerHitMine && challengedHitMine) {
      if (challengerPickAt < challengedPickAt) winnerId = duel.challenged_id;
      else if (challengedPickAt < challengerPickAt) winnerId = duel.challenger_id;
      else winnerId = null;
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

    duelResolvingRef.current = true;
    setTimeout(() => {
      handleDuelResult(winnerId);
    }, 2000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel?.duel_data, room?.status]);

  /* ─── Auto-determine arithmetic_mean winner ─── */
  useEffect(() => {
    if (room?.status !== 'duel_playing' || !duel || duel.mode !== 'arithmetic_mean') return;
    if (duelResolvingRef.current) return;
    const dd = duel.duel_data as { average?: number | null; challenger_answer?: number | string | null; challenged_answer?: number | string | null } | null;
    if (dd?.challenger_answer == null || dd?.challenged_answer == null || dd?.average == null) return;
    const avg = Number(dd.average);
    const challengerAnswer = Number(dd.challenger_answer);
    const challengedAnswer = Number(dd.challenged_answer);
    if (!Number.isFinite(avg) || !Number.isFinite(challengerAnswer) || !Number.isFinite(challengedAnswer)) return;
    const challengerDiff = Math.abs(challengerAnswer - avg);
    const challengedDiff = Math.abs(challengedAnswer - avg);
    let winnerId: string | null = null;
    if (challengerDiff < challengedDiff) winnerId = duel.challenger_id;
    else if (challengedDiff < challengerDiff) winnerId = duel.challenged_id;
    // else draw
    duelResolvingRef.current = true;
    setTimeout(() => {
      handleDuelResult(winnerId);
    }, 2000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel?.duel_data, room?.status]);

  /* ─── Auto-determine crowd_forecast winner ─── */
  useEffect(() => {
    if (room?.status !== 'duel_playing' || !duel || duel.mode !== 'crowd_forecast') return;
    if (duelResolvingRef.current) return;
    const dd = duel.duel_data as { majority_index?: number | null; challenger_prediction?: number | string | null; challenged_prediction?: number | string | null } | null;
    if (dd?.challenger_prediction == null || dd?.challenged_prediction == null) return;
    const maj = Number(dd.majority_index ?? -1);
    if (!Number.isFinite(maj) || maj < 0) {
      duelResolvingRef.current = true;
      setTimeout(() => {
        handleDuelResult(null);
      }, 2000);
      return;
    }
    const challengerPrediction = Number(dd.challenger_prediction);
    const challengedPrediction = Number(dd.challenged_prediction);
    if (!Number.isFinite(challengerPrediction) || !Number.isFinite(challengedPrediction)) return;
    const challRight = challengerPrediction === maj;
    const chaledRight = challengedPrediction === maj;
    let winnerId: string | null = null;
    if (challRight && !chaledRight) winnerId = duel.challenger_id;
    else if (chaledRight && !challRight) winnerId = duel.challenged_id;
    // else draw (both right or both wrong)
    duelResolvingRef.current = true;
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
          tile_count: 9,
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
      
      const newDuel = await createDuel(
        room.id,
        room.current_round, // Real round so subscription can find it
        mode,
        caller.id,
        summoned.id,
        duelData
      );
      setDuel(newDuel);
      
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

    // Use the mode that was pre-selected (and added to history) when the moving phase started.
    // Fallback selects fresh only if the ref was somehow null (should never happen in practice).
    const mode: RoundMode = nextModeRef.current ?? getModeForCell(leaderPos, pack.cell_sequence);

    // Fetch fresh room data so we pick up any zombie_bomb_active change that happened
    // DURING the 7-second movement animation (stale closure in setInterval otherwise).
    const freshRoom = await fetchRoomById(room.id);
    // Guard: if status changed during animation (e.g. player initiated a duel), abort.
    if (freshRoom?.status !== 'moving') return;
    const zombieBombActive = freshRoom?.zombie_bomb_active ?? false;

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
          const rawOpts = zombieBombActive && typedQ.extra_options
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
        if (zombieBombActive) {
          const bombAccept = (qRecord.zombie_bomb_mode as { accept_only?: string[] })?.accept_only ?? [qRecord.primary_answer as string];
          questionData = { ...qRecord, mode: 'interpreter', accept_answer: bombAccept };
        } else {
          questionData = { ...qRecord, mode: 'interpreter' };
        }
      }
    } else if (mode === 'mathematician') {
      const problems = generateMathProblems(zombieBombActive);
      setMathProblems(problems);
      questionData = { mode: 'mathematician', problems, timer_sec: 60 };
    } else if (mode === 'memory_diary') {
      const seqLen = zombieBombActive ? 7 : 5;
      const seq = generateColorSequence(seqLen);
      setColorSequence(seq);
      questionData = { mode: 'memory_diary', sequence: seq, show_duration_ms: 10000 };
    } else if (mode === 'tag_puzzle') {
      const size = zombieBombActive ? 4 : 3;
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
    const freshRoom = await fetchRoomById(room.id);
    if (freshRoom?.status !== 'round_intro') return;
    // Clear stale answers from previous games that used the same room + round number.
    // Without this, old is_correct=true answers contaminate current round results.
    await clearAnswers(room.id, freshRoom.current_round);
    await setRoomStatus(room.id, 'round_playing', {
      timer_started_at: new Date().toISOString(),
    });
  };

  const handleTimerExpired = useCallback(async () => {
    if (!room) return;
    if (roomStatusRef.current !== 'round_playing') return;
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
        // Tiebreaker: higher board position wins (closer to finish = advantage)
        // answer_time_ms is always NULL (never sent by clients), so we use position instead.
        return b.position - a.position;
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
        
        // BUG FIX: In blitz, wrong answer = stay in place only. No life loss.
        // Rule: "correct → +1, wrong → stay (even zombies)" — zero lives change.
        const livesChange = 0;
        let newStreak = isCorrect ? p.correct_streak + 1 : 0;
        let karmaGain = 0;
        if (!p.is_zombie && newStreak >= 3) karmaGain = 1;
        
        const newKarma = p.karma + karmaGain;
        // Lives are unchanged in blitz (livesChange = 0 for everyone)
        const newLives = p.is_zombie ? 0 : p.lives;
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
          is_zombie_now: p.is_zombie, // no new zombies from blitz itself
          new_streak: p.is_zombie ? 0 : newStreak,
          new_total_correct: p.total_correct + (isCorrect ? 1 : 0),
          new_total_time_ms: p.total_answer_time_ms + (blitzDirectAns?.answer_time_ms ?? 0),
        });
      }
    } else {
      // ─── Standard scoring ────────────────────────────────────────────────────
      //
      // Movement rules:
      //   First correct (by submission time) → +2 positions
      //   Any other correct                  → +1 position
      //   Wrong answer                       → stay (+0), −1 life
      //   Zombie (any answer)                → always +1 (exception: blitz handled above)
      //
      // BUG FIX: Previously, "first correct" was determined by player array order
      // (whichever player appeared first in nonHostPlayers), not by actual submission
      // timestamp. This caused wrong players to receive the +2 bonus.
      // Fix: sort finalAnswers by submitted_at (server-side timestamp, always present)
      // because answer_time_ms is never populated by clients and is always NULL.
      const firstCorrectPlayerId = [...finalAnswers]
        .filter(a => a.is_correct)
        .sort((a, b) => new Date(a.submitted_at || 0).getTime() - new Date(b.submitted_at || 0).getTime())[0]?.player_id ?? null;

      for (const p of nonHostPlayers) {
        const ans = finalAnswers.find(x => x.player_id === p.id);
        const isCorrect = ans?.is_correct ?? false;

        // ── Zombie: always moves +1 regardless of answer ──────────────────────
        if (p.is_zombie) {
          const newStreak = isCorrect ? p.correct_streak + 1 : 0;
          const karmaGain = newStreak >= 3 ? 1 : 0; // zombies earn karma for duel / resurrection
          results.push({
            player_id: p.id,
            is_correct: isCorrect,
            was_first: false,
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

        // ── Alive player ──────────────────────────────────────────────────────
        const isFirst = isCorrect && p.id === firstCorrectPlayerId;
        const posChange = isCorrect ? (isFirst ? 2 : 1) : 0;
        const livesChange = isCorrect ? 0 : -1;

        const newStreak = isCorrect ? p.correct_streak + 1 : 0;
        const karmaGain = newStreak >= 3 ? 1 : 0;
        const newLives = Math.max(0, p.lives + livesChange);
        const newPos = Math.min(TOTAL_CELLS, p.position + posChange);
        const becomesZombie = newLives === 0;

        results.push({
          player_id: p.id,
          is_correct: isCorrect,
          was_first: isFirst,
          position_change: posChange,
          lives_change: livesChange,
          karma_change: karmaGain,
          new_position: newPos,
          new_lives: newLives,
          new_karma: p.karma + karmaGain,
          is_zombie_now: becomesZombie,
          new_streak: becomesZombie ? 0 : newStreak,
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
    // Use ALL players (alive + zombies) so counts reflect actual round results.
    // e.g. 1 alive correct + 3 zombies wrong → NOT "all_correct", but "only_one_answered".
    const ma = MODE_AUDIO[mode as keyof typeof MODE_AUDIO] as Record<string, string | undefined>;
    const allResults = results.filter(r => !nonHostPlayers.find(p => p.id === r.player_id && p.is_host));
    const allCorrect = allResults.length > 0 && allResults.every(r => r.is_correct);
    const noneCorrect = allResults.length > 0 && allResults.every(r => !r.is_correct);
    const correctCount = allResults.filter(r => r.is_correct).length;
    const incorrectCount = allResults.filter(r => !r.is_correct).length;
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
    // perfectRound = ALL players (alive + zombies) answered correctly.
    // If even one zombie gave a wrong answer — no hot potato.
    const perfectRound = nonHostPlayers.length > 0 && nonHostPlayers.every(p => {
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
    const freshRoom = await fetchRoomById(room.id);
    if (!freshRoom) return;
    if (freshRoom.current_round === 999) return;
    if (freshRoom.status !== 'round_results' && freshRoom.status !== 'bet_reveal') return;
    
    // TEST MODE: In test mode (round 999), don't advance - stay on results screen
    if (room.current_round === 999) return;
    
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
    const newRound = freshRoom.current_round + 1;

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
      roundResults.every((r) => r.is_correct);

    const isPerfect = perfectRound || !!roundData?.perfect_round || perfectFromResults;
    const isCurrentRoundData = latestRoom && roundData?.round === latestRoom.current_round;
    const isAlreadyPotatoFlow = false;

    // Debug logging for hot potato trigger
    console.log('[HOT POTATO DEBUG]', {
      perfectRound,
      'roundData?.perfect_round': roundData?.perfect_round,
      perfectFromResults,
      isPerfect,
      'roundData?.round': roundData?.round,
      'latestRoom?.current_round': latestRoom?.current_round,
      isCurrentRoundData,
      'room.status': freshRoom.status,
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

    if (newLeaderPos >= BLITZ_START && freshRoom.current_mode !== 'blitz') {
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
    const freshRoom = await fetchRoomById(room.id);
    if (!freshRoom) return;
    if ((freshRoom as unknown as { duel_initiated_in_round?: number | null }).duel_initiated_in_round === freshRoom.current_round) return;
    const freshPlayers = await fetchPlayers(room.id);
    const gamePlayers = freshPlayers.filter(p => !p.is_host);
    const challenger = gamePlayers.find(p => p.id === challengerId);
    const challenged = gamePlayers.find(p => p.id === challengedId);
    if (!challenger || !challenged) return;
    if (challenger.karma < 3 || challenger.is_zombie) return;
    if (Math.abs(challenger.position - challenged.position) !== 1) return;
    if (!hasAdjacentTarget(challenger, gamePlayers)) return;

    clearInterval(timerRef.current!);
    clearInterval(moveTimerRef.current!);
    if (blitzTimerRef.current) {
      clearTimeout(blitzTimerRef.current);
      blitzTimerRef.current = null;
    }

    if (freshRoom.status === 'round_intro' || freshRoom.status === 'round_playing') {
      setPendingRoundData({
        current_mode: freshRoom.current_mode,
        question_data: (freshRoom.question_data as Record<string, unknown> | null) ?? null,
        timer_duration_sec: freshRoom.timer_duration_sec ?? null,
      });
    } else {
      setPendingRoundData(null);
    }

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
      duel_initiated_in_round: freshRoom.current_round,
    });
    setDuel(newDuel);
  };

  const handleDuelResult = async (winnerId: string | null) => {
    if (!room || !duel) return;
    await updateDuel(duel.id, {
      winner_id: winnerId,
      duel_data: { ...((duel.duel_data ?? {}) as unknown as Record<string, unknown>), winner_id: winnerId } as unknown as import('@/lib/survivach/types').DuelData,
    });
    const challenger = players.find(p => p.id === duel.challenger_id);
    const challenged = players.find(p => p.id === duel.challenged_id);
    if (!challenger || !challenged) return;

    // Cache the duel payload so it can be passed temporarily or maintained
    // We do NOT update the Duel DB status to 'done' here, to prevent realtime from clearing the UI immediately.
    // Instead we will update the Duel to 'done' at the very END of advanceAfterDuel.

    // IMPORTANT: Set status to 'duel_result' BEFORE playing audio
    // This ensures the result screen is shown even if audio fails to load
    await setRoomStatus(room.id, 'duel_result', { duel_data: { ...room.duel_data, winner_id: winnerId } as unknown as import('@/lib/survivach/types').DuelData });

    // Apply player stat changes and determine winner audio pool
    let winnerPool: string;
    if (winnerId === null) {
      // Draw - no one changes position or stats
      winnerPool = DRAW_POOL;
    } else if (winnerId === duel.challenged_id) {
      // Challenged (summoned) won
      if (challenged.is_zombie) {
        // Zombie summoned won! Resurrects (gets 1 life). Challenger loses 1 life (and might become zombie).
        const newChallengerLives = Math.max(0, challenger.lives - 1);
        const zombiesAtChallengedPos = players.filter(
          p => !p.is_host && p.is_zombie && p.id !== challenged.id && p.position === challenged.position
        );
        const newChallengerIsZombie = newChallengerLives === 0 || challenger.is_zombie || zombiesAtChallengedPos.length > 0;
        const finalChallengerLives = newChallengerIsZombie ? 0 : newChallengerLives;
        await updatePlayers([
          { id: challenged.id, position: challenger.position, is_zombie: false, lives: 1 },
          { id: challenger.id, position: challenged.position, is_zombie: newChallengerIsZombie, lives: finalChallengerLives },
        ]);
        winnerPool = ZOMBIE_WON_POOL;
      } else if (challenger.is_zombie) {
        // Zombie challenger lost duel. Nothing happens.
        winnerPool = SUMMONED_WON_POOL;
      } else {
        // Both alive: challenged takes 3 karma from challenger, positions stay same
        await updatePlayers([
          { id: challenger.id, karma: Math.max(0, challenger.karma - 3) },
          { id: challenged.id, karma: challenged.karma + 3 },
        ]);
        winnerPool = SUMMONED_WON_POOL;
      }
    } else {
      // Challenger (caller) won
      if (challenger.is_zombie) {
        // Zombie challenger won! Resurrects (gets 1 life). Challenged loses 1 life (and might become zombie).
        const newChallengedLives = Math.max(0, challenged.lives - 1);
        const zombiesAtChallengerPos = players.filter(
          p => !p.is_host && p.is_zombie && p.id !== challenger.id && p.position === challenger.position
        );
        const newChallengedIsZombie = newChallengedLives === 0 || challenged.is_zombie || zombiesAtChallengerPos.length > 0;
        const finalChallengedLives = newChallengedIsZombie ? 0 : newChallengedLives;
        await updatePlayers([
          { id: challenger.id, position: challenged.position, is_zombie: false, lives: 1 },
          { id: challenged.id, position: challenger.position, is_zombie: newChallengedIsZombie, lives: finalChallengedLives },
        ]);
        winnerPool = ZOMBIE_WON_POOL;
      } else {
        // Normal swap positions (both alive)
        await updatePlayers([
          { id: challenger.id, position: challenged.position },
          { id: challenged.id, position: challenger.position },
        ]);
        winnerPool = CALLER_WON_POOL;
      }
    }

    // For arithmetic_mean and crowd_forecast: show ratings with duelists_actions first, then winner fanfare
    // For minesweeper: go straight to winner fanfare (no ratings screen)
    if (duel.mode === 'minesweeper') {
      bgAudio.current.play(randomFromPool(winnerPool, 3), false, () => advanceAfterDuel());
    } else {
      const startTime = Date.now();
      bgAudio.current.play(randomFromPool(DUELISTS_ACTIONS_POOL, 2), false, () => {
        bgAudio.current.play(randomFromPool(winnerPool, 3), false, () => {
          const elapsed = Date.now() - startTime;
          const minDelay = 7000; // Гарантируем, что карточки и ответ будут висеть минимум 7 секунд
          const remaining = minDelay - elapsed;
          if (remaining > 0) {
            setTimeout(advanceAfterDuel, remaining);
          } else {
            advanceAfterDuel();
          }
        });
      });
    }
  };

  const advanceAfterDuel = async () => {
    if (!room) return;
    
    // TEST MODE: In test mode (round 999), don't advance - stay on duel_result screen
    if (room.current_round === 999) {
      if (duel) {
        await updateDuel(duel.id, { status: 'done' });
      }
      return;
    }
    
    // Now that the UI has finished presenting, mark the duel as 'done' in the DB.
    if (duel) {
      await updateDuel(duel.id, { status: 'done' });
    }

    if (pendingRoundData) {
      const resume = pendingRoundData;
      setPendingRoundData(null);
      setDuel(null);
      setDuelQ(null);
      await setRoomStatus(room.id, 'round_intro', {
        current_mode: resume.current_mode,
        question_data: resume.question_data,
        timer_duration_sec: resume.timer_duration_sec ?? room.timer_duration_sec,
        duel_initiated_in_round: room.current_round,
      });
      return;
    }

    const updatedPlayers = await fetchPlayers(room.id);
    const newLeaderPos = getLeaderPosition(updatedPlayers.filter(p => !p.is_host));
    const newRound = room.current_round + 1;
    
    // FIX STAGE 3: Clear local duel states to prevent phantom renders
    setDuel(null);
    setDuelQ(null);

    await setRoomStatus(room.id, 'moving', { current_round: newRound, leader_position: newLeaderPos, duel_initiated_in_round: null });
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
      case 'duel_playing':
        await setRoomStatus(room.id, 'duel_result', {});
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
            {(() => {
              // Show the pre-selected mode (set at the start of the moving phase).
              // Falls back to the old blitz-cell display while the state update is still in flight.
              const m = nextModeDisplay
                ?? (room.leader_position >= BLITZ_START ? getModeForCell(room.leader_position) as RoundMode : null);
              return m ? (
                <div className="px-5 py-2 rounded-xl font-bold tracking-wide border backdrop-blur-md shadow-lg"
                  style={{
                    backgroundColor: MODE_COLORS[m] + '20',
                    borderColor: MODE_COLORS[m] + '40',
                    color: MODE_COLORS[m],
                    textShadow: '0 2px 4px rgba(0,0,0,0.8)'
                  }}>
                  ВПЕРЕДИ: {MODE_LABELS[m]}
                </div>
              ) : (
                <div className="px-5 py-2 rounded-xl font-bold tracking-wide border backdrop-blur-md shadow-lg"
                  style={{
                    backgroundColor: 'rgba(168,85,247,0.1)',
                    borderColor: 'rgba(168,85,247,0.3)',
                    color: '#c084fc',
                    textShadow: '0 2px 4px rgba(0,0,0,0.8)'
                  }}>
                  ВПЕРЕДИ: 🎲 ...
                </div>
              );
            })()}
          </div>

          {/* BoardView moved to persistent layout */}

          {moveMessage && (
            <div className="mx-auto max-w-xl w-full bg-indigo-950/40 backdrop-blur-md border border-indigo-400/30 shadow-[0_4px_30px_rgba(99,102,241,0.2)] rounded-2xl p-5 text-center text-indigo-100 font-bold tracking-wide animate-[fadeInUp_0.5s_ease-out] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              {moveMessage}
            </div>
          )}

          {duelEligibleCallers.length > 0 && (room as unknown as { duel_initiated_in_round?: number | null }).duel_initiated_in_round !== room.current_round && (
            <div className="bg-yellow-900/20 border border-yellow-500/40 rounded-xl p-3">
              <p className="text-yellow-400 font-bold text-sm mb-2">⚔️ Дуэль доступна сейчас</p>
              <div className="flex flex-wrap gap-2">
                {duelEligibleCallers.map(caller => {
                  const targets = players.filter(p => !p.is_host && p.id !== caller.id && Math.abs(p.position - caller.position) === 1);
                  return targets.map(target => (
                    <button
                      key={`${caller.id}-${target.id}`}
                      onClick={() => {
                        const modes: Array<'minesweeper' | 'arithmetic_mean' | 'crowd_forecast'> = ['minesweeper', 'arithmetic_mean', 'crowd_forecast'];
                        const duelMode = modes[Math.floor(Math.random() * modes.length)];
                        handleInitiateDuel(caller.id, target.id, duelMode);
                      }}
                      className="px-3 py-2 rounded-lg bg-yellow-700 hover:bg-yellow-600 text-white text-xs font-bold"
                    >
                      {caller.name} → {target.name}
                    </button>
                  ));
                })}
              </div>
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

          {duelEligibleCallers.length > 0 && (room as unknown as { duel_initiated_in_round?: number | null }).duel_initiated_in_round !== room.current_round && (
            <div className="mt-4 bg-yellow-900/20 border border-yellow-500/40 rounded-xl p-3 w-full max-w-3xl">
              <p className="text-yellow-400 font-bold text-sm mb-2 text-center">⚔️ Можно прервать раунд и запустить дуэль</p>
              <div className="flex flex-wrap justify-center gap-2">
                {duelEligibleCallers.map(caller => {
                  const targets = players.filter(p => !p.is_host && p.id !== caller.id && Math.abs(p.position - caller.position) === 1);
                  return targets.map(target => (
                    <button
                      key={`${caller.id}-${target.id}`}
                      onClick={() => {
                        const modes: Array<'minesweeper' | 'arithmetic_mean' | 'crowd_forecast'> = ['minesweeper', 'arithmetic_mean', 'crowd_forecast'];
                        const duelMode = modes[Math.floor(Math.random() * modes.length)];
                        handleInitiateDuel(caller.id, target.id, duelMode);
                      }}
                      className="px-3 py-2 rounded-lg bg-yellow-700 hover:bg-yellow-600 text-white text-xs font-bold"
                    >
                      {caller.name} → {target.name}
                    </button>
                  ));
                })}
              </div>
            </div>
          )}
          
          <p className="text-white/30 text-lg uppercase tracking-widest mt-8 font-bold animate-[pulse_2s_ease-in-out_infinite]">Подготовьтесь...</p>
        </div>
      )}

      {/* ─── ROUND PLAYING ─── */}
      {room.status === 'round_playing' && currentQ && (
        <div className="flex-1 h-full min-h-0 flex flex-col p-6 gap-4 overflow-hidden">
          <div className="flex items-center gap-4 flex-nowrap shrink-0 bg-white/5 backdrop-blur-md border border-white/10 px-6 py-3 rounded-2xl shadow-md w-full">
            <span className="text-lg font-bold shrink-0 whitespace-nowrap" style={{ color: MODE_COLORS[room.current_mode as RoundMode] }}>
              {MODE_LABELS[room.current_mode as RoundMode]}
            </span>
            <span className="shrink-0 font-bold opacity-70 whitespace-nowrap">Раунд {room.current_round}</span>
            
            {/* ВОПРОС в шапке */}
            {(room.current_mode === 'umnik' || room.current_mode === 'blitz') && (
              <div className="flex-1 min-w-0 flex items-center justify-center px-4">
                <h2 className={`text-xl md:text-2xl font-black tracking-wide truncate ${room.current_mode === 'blitz' ? 'text-red-400 animate-pulse' : 'text-white'}`} title={(currentQ as { question: string }).question}>
                  {(currentQ as { question: string }).question}
                </h2>
                {room.zombie_bomb_active && (
                  <span className="text-rose-400 text-[10px] font-bold uppercase tracking-wider ml-3 animate-pulse border border-rose-500/50 bg-rose-950/30 px-2 py-0.5 rounded-full shrink-0">
                    ☣️ Аномалия!
                  </span>
                )}
              </div>
            )}
            {/* Для других режимов просто пустое место */}
            {!(room.current_mode === 'umnik' || room.current_mode === 'blitz') && <div className="flex-1" />}

            <div className={`shrink-0 text-2xl font-mono font-black px-4 py-1 rounded-lg ${
              timerLeft <= 10 ? 'text-red-400 bg-red-900/30 animate-pulse' : 'text-white bg-gray-800'
            }`}>
              ⏱ {timerLeft}s
            </div>
          </div>

          {duelEligibleCallers.length > 0 && (room as unknown as { duel_initiated_in_round?: number | null }).duel_initiated_in_round !== room.current_round && (
            <div className="bg-yellow-900/20 border border-yellow-500/40 rounded-xl p-3 shrink-0">
              <p className="text-yellow-400 font-bold text-sm mb-2">⚔️ Дуэль может прервать текущий вопрос</p>
              <div className="flex flex-wrap gap-2">
                {duelEligibleCallers.map(caller => {
                  const targets = players.filter(p => !p.is_host && p.id !== caller.id && Math.abs(p.position - caller.position) === 1);
                  return targets.map(target => (
                    <button
                      key={`${caller.id}-${target.id}`}
                      onClick={() => {
                        const modes: Array<'minesweeper' | 'arithmetic_mean' | 'crowd_forecast'> = ['minesweeper', 'arithmetic_mean', 'crowd_forecast'];
                        const duelMode = modes[Math.floor(Math.random() * modes.length)];
                        handleInitiateDuel(caller.id, target.id, duelMode);
                      }}
                      className="px-3 py-2 rounded-lg bg-yellow-700 hover:bg-yellow-600 text-white text-xs font-bold"
                    >
                      {caller.name} → {target.name}
                    </button>
                  ));
                })}
              </div>
            </div>
          )}

          {/* Question display by mode */}
          {(room.current_mode === 'umnik' || room.current_mode === 'blitz') && (
            <div className="flex-1 flex flex-col gap-4 w-full px-2 lg:px-8 max-w-[1600px] mx-auto min-h-0">
              
              {/* КОНТЕЙНЕР ДЛЯ ОПЦИЙ И РЕЙТИНГОВ */}
              <div className="flex-1 flex flex-row gap-4 lg:gap-6 min-h-0 w-full">
                
                {/* ВАРИАНТЫ ОТВЕТА (Левая колонка) */}
                <div className="flex-1 bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-4 flex flex-col shadow-[inset_0_4px_30px_rgba(255,255,255,0.02)] relative overflow-hidden min-h-0">
                  <span className="text-white/40 uppercase tracking-widest text-xs font-bold mb-3 px-2">Варианты ответа</span>
                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                    <div className="grid grid-cols-2 gap-3 content-start">
                      {((currentQ as { options: string[] }).options ?? []).map((opt, i) => (
                        <div key={i} className={`relative group px-4 py-2 bg-black/40 backdrop-blur-md border ${room.current_mode === 'blitz' ? 'border-red-500/30 hover:border-red-400' : 'border-white/10 hover:border-indigo-400/50'} rounded-xl flex items-center shadow-[0_4px_24px_rgba(0,0,0,0.2)] overflow-hidden transition-all duration-300`}>
                          <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                          <span className={`text-xl font-black mr-3 drop-shadow-md flex-shrink-0 ${room.current_mode === 'blitz' ? 'text-red-500/50 group-hover:text-red-400' : 'text-white/30 group-hover:text-indigo-300'} transition-colors duration-300`}>
                            {String.fromCharCode(65 + i)}
                          </span>
                          <span className="text-base font-semibold text-white/90 drop-shadow-md tracking-wide line-clamp-2 leading-snug [text-wrap:balance]">
                            {opt}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* РЕЙТИНГ И ИГРОКИ (Правая колонка) */}
                <div className="flex-1 bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-4 flex flex-col shadow-[inset_0_4px_30px_rgba(255,255,255,0.02)] relative overflow-hidden min-h-0">
                  <div className="flex items-center justify-between mb-3 px-2">
                    <span className="text-white/40 uppercase tracking-widest text-xs font-bold shrink-0">Рейтинг / Ответили</span>
                    <span className="text-indigo-300 font-black text-xs bg-indigo-900/40 border border-indigo-500/30 px-3 py-1 rounded-full shrink-0 shadow-[0_0_10px_rgba(79,70,229,0.3)]">
                      {answers.length} / {players.filter(p => !p.is_host).length}
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 content-start">
                      {ranked.map((p, i) => <PlayerCard key={p.id} player={p} rank={i + 1} hasAnswered={!!answers.find(a => a.player_id === p.id)} />)}
                    </div>
                  </div>
                </div>

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
            <div className="flex-1 flex min-h-0 w-full max-w-[1800px] mx-auto gap-4 md:gap-6 px-2 md:px-6">
              
              {/* PRIMARY TERMINAL: Mathematical Data Stream */}
              <div className="flex-[2] md:flex-[2.5] bg-[#050b06]/90 backdrop-blur-xl border border-emerald-500/30 rounded-3xl p-4 md:p-6 relative overflow-hidden shadow-[inset_0_0_80px_rgba(16,185,129,0.05),0_0_30px_rgba(0,0,0,0.5)] flex flex-col min-h-0">
                
                {/* Cyberpunk corner markers */}
                <div className="absolute top-0 left-0 w-6 h-6 md:w-8 md:h-8 border-t-2 border-l-2 border-emerald-500/50 rounded-tl-3xl z-10 opacity-50" />
                <div className="absolute top-0 right-0 w-6 h-6 md:w-8 md:h-8 border-t-2 border-r-2 border-emerald-500/50 rounded-tr-3xl z-10 opacity-50" />
                <div className="absolute bottom-0 left-0 w-6 h-6 md:w-8 md:h-8 border-b-2 border-l-2 border-emerald-500/50 rounded-bl-3xl z-10 opacity-50" />
                <div className="absolute bottom-0 right-0 w-6 h-6 md:w-8 md:h-8 border-b-2 border-r-2 border-emerald-500/50 rounded-br-3xl z-10 opacity-50" />

                {/* Scanline overlay */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.02)_1px,transparent_1px)] bg-[size:100%_4px] pointer-events-none z-0" />

                {/* Terminal Header */}
                <div className="flex items-center justify-between mb-4 flex-none border-b border-emerald-500/20 pb-3 md:pb-4 relative z-10">
                  <div className="flex flex-col">
                    <span className="text-emerald-600 font-mono text-[9px] md:text-[11px] font-black tracking-[0.3em] uppercase opacity-80">Bio-Terminal // Module: Arithmetic</span>
                    <span className="text-emerald-300 text-xl md:text-3xl font-black uppercase tracking-widest drop-shadow-[0_0_10px_rgba(16,185,129,0.6)]">
                      Вычислительный процесс
                    </span>
                  </div>
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="flex flex-col items-end">
                      <span className="text-[9px] md:text-[10px] text-emerald-700 font-mono uppercase">Status</span>
                      <span className="text-emerald-400 font-mono font-bold animate-pulse text-xs md:text-sm">PROCESSING</span>
                    </div>
                    <div className="h-8 w-8 md:h-12 md:w-12 flex items-center justify-center border border-emerald-500/30 rounded bg-emerald-950/40 relative overflow-hidden">
                      <div className="absolute inset-0 bg-emerald-500/10 animate-[pulse_2s_infinite]" />
                      <span className="text-emerald-400 animate-spin text-lg md:text-xl drop-shadow-[0_0_5px_rgba(52,211,153,0.8)]">☣️</span>
                    </div>
                  </div>
                </div>

                {/* Expressions Grid */}
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 relative z-10 min-h-0">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3 content-start">
                    {mathProblems.map((p, i) => (
                      <div key={i} className="flex relative items-center bg-[#030704] border border-emerald-900/60 rounded-lg p-2 md:p-3 overflow-hidden group hover:bg-[#061208] transition-colors">
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-800/40 group-hover:bg-emerald-400 transition-colors" />
                        <span className="text-emerald-800 font-mono text-[9px] md:text-xs w-5 md:w-7 opacity-50 pl-1">{(i+1).toString().padStart(2, '0')}</span>
                        <span className="text-emerald-300 font-mono font-medium text-[13px] md:text-lg tracking-widest flex-1 text-center group-hover:text-emerald-100 transition-colors drop-shadow-[0_0_5px_rgba(16,185,129,0.2)]">
                          {p.expression} = ?
                        </span>
                      </div>
                    ))}
                  </div>
                  {/* Fade out bottom overlay */}
                  <div className="sticky bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#050b06]/90 to-transparent pointer-events-none" />
                </div>
              </div>

               {/* SECONDARY TERMINAL: Subject Monitoring */}
               <div className="flex-1 md:flex-[1.2] bg-[#0a0505]/90 backdrop-blur-xl rounded-3xl border border-rose-900/40 p-4 md:p-6 flex flex-col shadow-[inset_0_0_80px_rgba(225,29,72,0.03),0_0_30px_rgba(0,0,0,0.5)] relative overflow-hidden min-h-0">
                  
                  {/* Scanline overlay */}
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(225,29,72,0.02)_1px,transparent_1px)] bg-[size:100%_4px] pointer-events-none z-0" />

                  {/* Warning Header */}
                  <div className="flex items-center justify-between mb-3 md:mb-4 flex-none border-b border-rose-900/30 pb-3 md:pb-4 relative z-10">
                    <div className="flex flex-col">
                      <span className="text-rose-700 font-mono text-[9px] md:text-[11px] font-black tracking-[0.3em] uppercase opacity-80">Vital Signs // Telemetry</span>
                      <span className="text-rose-400 text-lg md:text-2xl font-black uppercase tracking-widest drop-shadow-[0_0_10px_rgba(225,29,72,0.6)]">
                        Субъекты
                      </span>
                    </div>
                    <div className="bg-rose-950/60 border border-rose-500/30 px-2 md:px-3 py-1 rounded-md shadow-[0_0_15px_rgba(225,29,72,0.2)] flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                      <span className="text-rose-300 font-black text-[10px] md:text-sm font-mono tracking-widest">
                        {answers.length} / {players.filter(p => !p.is_host).length}
                      </span>
                    </div>
                  </div>
                  
                  {/* Agents List */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 min-h-0 relative z-10">
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2 gap-2 md:gap-3 content-start">
                      {players.filter(p => !p.is_host).map((p) => {
                        const ans = answers.find(a => a.player_id === p.id);
                        return (
                          <div key={p.id} className={`flex items-center gap-3 px-3 py-2 md:px-4 md:py-3 rounded-lg border backdrop-blur-md transition-all relative overflow-hidden ${
                            ans 
                              ? 'border-emerald-500/40 bg-emerald-950/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]' 
                              : 'border-rose-900/40 bg-rose-950/10'
                          }`}>
                            {ans && <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500/80 shadow-[0_0_10px_rgba(16,185,129,0.8)]" />}
                            
                            <div className="relative shrink-0">
                              <img src={getAvatarUrl(p.avatar, p.lives)} alt="" className={`w-8 h-8 md:w-10 md:h-10 object-contain relative z-10 filter ${ans ? 'contrast-125' : 'grayscale-[50%] brightness-75'}`} />
                              {ans && <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-md" />}
                            </div>
                            
                            <div className="flex-[2] min-w-0 flex flex-col justify-center">
                              <span className={`font-black text-sm md:text-base tracking-wide truncate ${ans ? 'text-emerald-300 drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]' : 'text-slate-400'}`}>{p.name}</span>
                              <span className={`text-[8px] md:text-[10px] uppercase font-mono tracking-[0.2em] mt-0.5 ${ans ? 'text-emerald-500' : 'text-rose-700 animate-pulse'}`}>
                                {ans ? 'ДАННЫЕ ПОЛУЧЕНЫ' : 'ОЖИДАНИЕ...'}
                              </span>
                            </div>
                            
                            {ans && (
                              <div className="text-emerald-400 font-bold ml-auto pr-1 animate-in zoom-in shrink-0">
                                <svg className="w-5 h-5 drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]" fill="none" stroke="currentColor" viewBox="0 2 24 24" xmlns="http://www.w3.org/2000/svg">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
               </div>
            </div>
          )}

          {room.current_mode === 'memory_diary' && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 relative min-h-full">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-pink-900/30 via-transparent to-transparent pointer-events-none" />

              <div className="bg-black/60 border border-pink-500/30 p-8 md:p-12 rounded-[2rem] shadow-[0_0_100px_rgba(236,72,153,0.15)] flex flex-col items-center gap-8 backdrop-blur-xl relative z-10 w-full max-w-4xl">
                <h2 className="text-5xl md:text-7xl font-black bg-gradient-to-r from-pink-400 via-purple-400 to-pink-400 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(236,72,153,0.6)] uppercase tracking-tight text-center">
                  Дневник Памяти
                </h2>
                
                <div className="text-pink-300/80 font-bold text-xl uppercase tracking-[0.3em] text-center px-8 py-3 border-y border-pink-500/20 w-full">
                  Воспроизведите секретную последовательность
                </div>

                {room.zombie_bomb_active && (
                  <div className="absolute -top-6 px-8 py-2 bg-green-950 border border-green-500 rounded-full text-green-400 font-bold text-lg animate-pulse shadow-[0_0_30px_rgba(34,197,94,0.4)]">
                    💣 Усложнённая последовательность!
                  </div>
                )}

                <div className="w-full flex justify-center py-4 px-4 overflow-hidden">
                  <div className="relative bg-slate-900/80 p-6 md:p-8 rounded-3xl border-4 border-slate-800 shadow-[inset_0_0_50px_rgba(0,0,0,0.8)] w-full w-max-[90%]">
                    <div className="absolute top-1/2 left-4 right-4 h-1.5 bg-white/5 -translate-y-1/2 rounded-full hidden md:block" />
                    <div className="flex flex-wrap justify-center gap-4 md:gap-6 relative z-10 w-full">
                      {colorSequence.map((_, i) => (
                        <div 
                          key={i} 
                          className="relative z-10 w-16 h-16 md:w-24 md:h-24 rounded-2xl flex items-center justify-center bg-black/60 border-2 border-dashed border-white/20 shadow-inner"
                        >
                          <span className="text-white/10 font-black text-2xl md:text-4xl">{i + 1}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex gap-4 text-sm font-bold text-slate-500 uppercase tracking-widest">
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-pink-500 animate-[pulse_1s_ease-in-out_infinite]" /> 
                    Ожидание ввода...
                  </span>
                </div>
              </div>
            </div>
          )}

          {room.current_mode === 'tag_puzzle' && (
            <div className="flex-1 flex w-full min-h-0 relative items-center justify-center bg-[#0a0c10]">
              {/* Tactical Background Elements */}
              <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden flex items-center justify-center">
                <div className={`w-[800px] h-[800px] border ${room.zombie_bomb_active ? 'border-green-900/40' : 'border-blue-900/20'} rounded-full opacity-30 absolute mix-blend-screen transition-colors duration-700`} />
                <div className={`w-[600px] h-[600px] border ${room.zombie_bomb_active ? 'border-emerald-900/30' : 'border-cyan-900/10'} rounded-full opacity-20 absolute mix-blend-screen transition-colors duration-700`} />
                {/* Thin glowing neon corner accents */}
                <div className={`absolute top-4 left-4 w-12 h-12 border-t border-l ${room.zombie_bomb_active ? 'border-green-500/50' : 'border-cyan-500/50'} transition-colors duration-700`} />
                <div className={`absolute top-4 right-4 w-12 h-12 border-t border-r ${room.zombie_bomb_active ? 'border-green-500/50' : 'border-cyan-500/50'} transition-colors duration-700`} />
                <div className={`absolute bottom-4 left-4 w-12 h-12 border-b border-l ${room.zombie_bomb_active ? 'border-green-500/50' : 'border-cyan-500/50'} transition-colors duration-700`} />
                <div className={`absolute bottom-4 right-4 w-12 h-12 border-b border-r ${room.zombie_bomb_active ? 'border-green-500/50' : 'border-cyan-500/50'} transition-colors duration-700`} />
              </div>

              {/* Two Column Grid within flex-1 (fills available h-[70vh] minus padding) */}
              <div className="relative z-10 w-full h-full max-w-[1700px] mx-auto grid grid-cols-[1fr_1.2fr] gap-8 p-6 lg:p-10 min-h-0">
                
                {/* Left Column: Info & Action HUD */}
                <div className="flex flex-col justify-center h-full min-h-0 relative items-start pl-8 xl:pl-16">
                  {/* Decorative Scanline / Status Text */}
                  <div className={`mb-4 inline-flex items-center gap-2 border px-3 py-1 rounded-sm transition-colors duration-700 ${room.zombie_bomb_active ? 'border-green-900/50 bg-green-950/30' : 'border-cyan-900/50 bg-cyan-950/20'}`}>
                    <div className={`w-1.5 h-1.5 ${room.zombie_bomb_active ? 'bg-green-500' : 'bg-cyan-500'} animate-pulse`} />
                    <span className={`text-[10px] uppercase font-mono tracking-[0.2em] ${room.zombie_bomb_active ? 'text-green-400' : 'text-cyan-400'}`}>Tactical HUD Active </span>
                  </div>
                  
                  <h2 className={`text-5xl md:text-7xl font-black bg-gradient-to-r bg-clip-text text-transparent uppercase tracking-tighter mb-4 transition-all duration-700 ${
                    room.zombie_bomb_active 
                      ? 'from-green-400 to-emerald-300 drop-shadow-[0_0_20px_rgba(52,211,153,0.4)]' 
                      : 'from-blue-400 to-cyan-300 drop-shadow-[0_0_20px_rgba(34,211,238,0.3)]'
                  }`}>
                    Пятнашки
                  </h2>

                  {room.zombie_bomb_active && (
                    <div className="mb-6 px-6 py-2 bg-green-950/60 border border-green-500/60 shadow-[0_0_20px_rgba(34,197,94,0.3)] rounded-lg backdrop-blur-md flex items-center gap-3 animate-pulse">
                      <span className="text-2xl">☣️</span>
                      <div className="flex flex-col">
                        <span className="text-green-400 text-xs font-mono uppercase tracking-[0.2em]">Аномалия</span>
                        <span className="text-green-300 font-bold text-lg leading-none">ЗОМБИ БОМБА (4x4)</span>
                      </div>
                    </div>
                  )}
                  
                  <p className={`text-xl md:text-2xl text-slate-400 font-mono tracking-wide leading-relaxed max-w-xl border-l-[3px] pl-5 py-2 transition-all duration-700 ${
                    room.zombie_bomb_active 
                      ? 'border-green-500/50 bg-gradient-to-r from-green-950/20 to-transparent' 
                      : 'border-cyan-500/50 bg-gradient-to-r from-cyan-950/10 to-transparent'
                  }`}>
                    Кто первым соберет конфигурацию на устройстве? <br />
                    <span className={`text-sm mt-3 block ${room.zombie_bomb_active ? 'text-green-500/70' : 'text-cyan-500/70'}`}>
                      Ожидание инициализации протокола сборки...
                    </span>
                  </p>
                </div>

                {/* Right Column: Demo Puzzle Board */}
                <div className="flex flex-col items-center justify-center p-4 min-h-0 h-full w-full relative">
                  <div className={`h-full aspect-square max-h-full bg-[#05070a] border rounded-2xl p-2 relative flex flex-col justify-center transition-all duration-700 ${
                    room.zombie_bomb_active 
                      ? 'border-green-900/60 shadow-[inset_0_0_60px_rgba(6,78,59,0.8),0_0_40px_rgba(16,185,129,0.2)]' 
                      : 'border-white/10 shadow-[inset_0_0_50px_rgba(0,0,0,0.8),0_0_30px_rgba(8,145,178,0.1)]'
                  }`}>
                    
                    {/* Corner Tech Marks */}
                    <div className={`absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 ${room.zombie_bomb_active ? 'border-green-500/80' : 'border-cyan-500/80'}`} />
                    <div className={`absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 ${room.zombie_bomb_active ? 'border-green-500/80' : 'border-cyan-500/80'}`} />
                    <div className={`absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 ${room.zombie_bomb_active ? 'border-green-500/80' : 'border-cyan-500/80'}`} />
                    <div className={`absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 ${room.zombie_bomb_active ? 'border-green-500/80' : 'border-cyan-500/80'}`} />

                    <div className={`grid ${puzzleState.length === 16 ? 'grid-cols-4' : 'grid-cols-3'} gap-2 md:gap-3 w-full h-full`}>
                      {puzzleState.map((n, i) => (
                        <div 
                          key={i} 
                          className={`
                            rounded-xl flex items-center justify-center font-mono font-black relative overflow-hidden transition-all duration-300
                            ${puzzleState.length === 16 ? 'text-3xl sm:text-4xl lg:text-5xl border-2' : 'text-4xl sm:text-5xl lg:text-7xl border'}
                            ${n !== 0 
                              ? room.zombie_bomb_active 
                                  ? 'bg-[#102418] border-green-700/50 text-green-300 shadow-[0_4px_20px_rgba(0,0,0,0.6)]' 
                                  : 'bg-[#1a1f2e] border-cyan-900/40 text-cyan-200 shadow-[0_4px_20px_rgba(0,0,0,0.6)]' 
                              : room.zombie_bomb_active
                                  ? 'bg-black/80 border-dashed border-green-900/40'
                                  : 'bg-black/60 border-dashed border-cyan-900/30'
                            }
                          `}
                        >
                          {n !== 0 && (
                            <>
                              <div className={`absolute inset-0 bg-gradient-to-b ${room.zombie_bomb_active ? 'from-green-500/5' : 'from-cyan-500/5'} to-transparent pointer-events-none`} />
                              <div className="absolute top-1 left-2 w-1/3 h-1 bg-white/10 rounded-full blur-[1px]" />
                              {n}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* Answers progress */}
          {room.current_mode !== 'umnik' && room.current_mode !== 'blitz' && (
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 flex-none mt-auto">
              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-sm text-gray-400 font-bold px-1">
                  <span>Ответили</span>
                  <span>{answers.length} / {players.filter(p => !p.is_host).length}</span>
                </div>
                <div className="flex gap-2 flex-wrap max-h-32 overflow-y-auto custom-scrollbar content-start">
                  {players.filter(p => !p.is_host).map(p => {
                    const ans = answers.find(a => a.player_id === p.id);
                    return (
                      <div key={p.id} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        ans ? 'bg-green-500/20 text-green-300 border border-green-500/30 shadow-[0_0_10px_rgba(34,197,94,0.1)]' : 'bg-gray-800 text-gray-400 border border-gray-700 opacity-60 grayscale'
                      }`}>
                        <img src={getAvatarUrl(p.avatar, p.lives)} alt="" className="w-5 h-5 object-contain" />
                        <span className="truncate max-w-[80px]">{p.name}</span>
                        {ans && <span className="text-green-400 drop-shadow-[0_0_5px_#22c55e]">✓</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Bets indicator */}
          {bets.length > 0 && (
            <div className="text-center text-yellow-400 text-sm font-bold">
              🎰 Сделали ставку: {bets.length} чел.
            </div>
          )}

          {/* Karma/duel eligible players */}
          {room.current_mode !== 'umnik' && room.current_mode !== 'blitz' && ranked.filter(p => p.karma >= 3 && !p.is_zombie).length > 0 && (
            <div className="bg-yellow-900/20 border border-yellow-500/40 rounded-xl p-3 flex-none mt-auto">
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
        <div className="flex-1 w-full min-h-0 flex flex-col p-4 md:p-6 gap-4 items-center relative overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-indigo-600/20 blur-[150px] pointer-events-none rounded-full" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-fuchsia-600/10 blur-[120px] pointer-events-none rounded-full" />

          <h2 className="text-4xl md:text-5xl font-black text-center bg-gradient-to-r from-blue-300 via-indigo-400 to-purple-400 bg-clip-text text-transparent drop-shadow-[0_0_25px_rgba(99,102,241,0.6)] uppercase tracking-tighter relative z-10 flex-none py-2">
            {(room.round_results_data as { blitz_mode?: boolean } | null)?.blitz_mode
              ? '⚡ ИТОГИ БЛИЦА'
              : 'СТАТИСТИКА РАУНДА'}
          </h2>

          {/* Blitz: show slow player + auto-advance notice */}
          {(room.round_results_data as { blitz_mode?: boolean } | null)?.blitz_mode && (() => {
            const rd = room.round_results_data as { blitz_slow_player_id?: string } | null;
            const slowP = rd?.blitz_slow_player_id ? players.find(p => p.id === rd.blitz_slow_player_id) : null;
            return (
              <div className="flex flex-col items-center gap-2 relative z-10 flex-none">
                {slowP && (
                  <div className="bg-rose-950/50 border-2 border-rose-500/50 rounded-2xl px-4 py-2 text-center shadow-[0_0_30px_rgba(225,29,72,0.3)] backdrop-blur-md">
                    <span className="text-rose-400 font-extrabold text-sm md:text-base uppercase tracking-widest shrink-0 gap-2 flex items-center">
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                      Слишком медленно: {slowP.name}
                    </span>
                  </div>
                )}
                <p className="text-indigo-300/60 font-bold uppercase tracking-widest text-xs animate-pulse">Следующий вопрос через 2 сек…</p>
              </div>
            );
          })()}

          {room.round_results_data && (
            <div className="max-w-6xl mx-auto w-full flex-1 flex flex-col gap-4 relative z-10 min-h-0">
              <style dangerouslySetInnerHTML={{ __html: `
                @keyframes hideOverlay {
                  0%, 80% { opacity: 1; transform: scale(1); pointer-events: auto; }
                  100% { opacity: 0; transform: scale(0.9); visibility: hidden; pointer-events: none; }
                }
              `}} />

              {/* OVERLAY: Правильный ответ (shows for 3 seconds) */}
              {(room.current_mode !== 'mathematician' && room.round_results_data.correct_answer) && (
                <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none" style={{ animation: 'hideOverlay 3.5s forwards' }}>
                  <div className="bg-slate-900/95 border-2 border-emerald-500/50 rounded-[3rem] p-10 shadow-[0_0_100px_rgba(52,211,153,0.4)] flex flex-col items-center gap-4 backdrop-blur-3xl animate-[zoomIn_0.5s_ease-out] w-[90%] max-w-4xl text-center">
                    <span className="text-emerald-400 uppercase tracking-widest text-lg font-bold font-mono">Правильный ответ</span>
                    <span className="font-black text-5xl md:text-6xl text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.5)] leading-tight">
                      {room.round_results_data.correct_answer}
                    </span>
                    
                    {room.current_mode === 'interpreter' && (() => {
                      const iq = room.question_data as unknown as InterpreterQuestion | null;
                      if (!iq) return null;
                      return (
                        <div className="mt-4 flex flex-col gap-2">
                          <p className="text-purple-200 text-xl italic font-medium opacity-90">
                            «{iq.original_text}»
                          </p>
                          <div className="flex flex-wrap justify-center gap-4 mt-2">
                            {iq.artist && <span className="text-indigo-300 text-sm">🎤 <span className="text-white font-bold">{iq.artist}{iq.aka ? ` (${iq.aka})` : ''}</span></span>}
                            {iq.composer && <span className="text-indigo-300 text-sm">🎵 <span className="text-white font-bold">{iq.composer}</span></span>}
                            {iq.lyricist && <span className="text-indigo-300 text-sm">✍️ Текст: <span className="text-white font-bold">{iq.lyricist}</span></span>}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* ─── Full leaderboard ─── */}
              <div className="bg-black/40 border border-white/5 rounded-3xl p-4 backdrop-blur-md shadow-2xl flex-1 flex flex-col overflow-hidden min-h-0 max-h-full">
                <div className="flex items-center gap-4 mb-3 flex-none ml-2">
                  <p className="text-sm text-indigo-300 uppercase tracking-widest font-bold">Таблица лидеров</p>
                  <div className="h-px flex-1 bg-gradient-to-r from-indigo-500/50 to-transparent" />
                </div>
                
                <div className="flex-1 min-h-0">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pb-2 h-full content-start overflow-y-auto custom-scrollbar pr-2">
                    {rankPlayers(players.filter(p => !p.is_host)).map((p, i) => {
                      const r = roundResultsData.find(x => x.player_id === p.id);
                      const newLives = r?.new_lives ?? p.lives;
                      const newPos = r?.new_position ?? p.position;
                      const newKarma = r?.new_karma ?? p.karma;
                      const newZombie = r?.is_zombie_now ?? p.is_zombie;
                      
                      const isCorrect = r?.is_correct;
                      const isTop = i === 0;

                      return (
                        <div 
                          key={p.id} 
                          className={`flex flex-col gap-2 p-3 rounded-2xl border backdrop-blur-sm transition-all relative overflow-hidden ${
                            isCorrect 
                              ? 'border-emerald-500/30 bg-emerald-950/20' 
                              : 'border-rose-500/20 bg-rose-950/10'
                          } ${isTop ? 'outline outline-2 outline-amber-500/30' : ''}`}
                        >
                          {isTop && <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500 to-transparent opacity-50" />}
                          
                          {/* TOP ROW: Rank, Avatar, Name */}
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-6 md:w-8 shrink-0">
                              <span className={`font-black text-sm md:text-xl drop-shadow-md ${isTop ? 'text-amber-400 scale-110 drop-shadow-[0_0_10px_rgba(251,191,36,0.8)]' : 'text-slate-500'}`}>
                                #{i + 1}
                              </span>
                            </div>
                            <div className="relative shrink-0">
                              {isTop && <div className="absolute -inset-1.5 bg-amber-500/20 blur-lg rounded-full pointer-events-none" />}
                              <img src={getAvatarUrl(p.avatar, newLives)} alt="" className="w-8 h-8 md:w-10 md:h-10 object-contain relative z-10" />
                            </div>
                            <span className="font-black text-sm md:text-base text-white tracking-wide truncate flex-1">{p.name}</span>

                            {/* Lives / Zombie Status */}
                            <div className="flex flex-col items-end gap-1 shrink-0">
                               {newZombie ? (
                                 <span className="text-emerald-400 text-xs md:text-sm font-black drop-shadow-[0_0_5px_rgba(52,211,153,0.5)]">🧟 ЗОМБИ</span>
                               ) : (
                                 <div className="flex gap-0.5">
                                   {Array.from({ length: 3 }).map((_, idx) => (
                                     <span key={idx} className={`text-sm ${idx < newLives ? 'drop-shadow-[0_0_5px_rgba(220,38,38,0.8)] opacity-100' : 'opacity-20 grayscale brightness-50'}`}>❤️</span>
                                   ))}
                                 </div>
                               )}
                            </div>
                          </div>

                          {/* BOTTOM ROW: Result Tag and Cell */}
                          <div className="flex items-center justify-between bg-black/40 rounded-xl px-3 py-1.5 border border-white/5">
                            {/* Answer Result */}
                            {r && (r.is_correct
                              ? <span className="text-emerald-400 font-black text-[10px] md:text-xs uppercase tracking-wider flex items-center gap-1"><span className="text-emerald-500">✓</span> {r.was_first ? 'ПЕРВЫЙ' : 'ВЕРНО'}</span>
                              : <span className="text-rose-400 font-bold text-[10px] md:text-xs uppercase tracking-wider flex items-center gap-1"><span className="text-rose-500">✗</span> ПРОМАХ</span>
                            )}
                            
                            <div className="w-px h-4 bg-white/10 mx-2" />
                            
                            {/* Cell Position */}
                            <div className="flex items-center gap-1.5 text-slate-300">
                              <span className="text-[9px] md:text-[10px] uppercase font-bold text-slate-500 tracking-wider">Клетка</span>
                              <span className="font-mono font-black text-sm md:text-base">{newPos}</span>
                            </div>
                          </div>
                          
                          {/* Event Tags (Karma) */}
                          <div className="absolute top-0 right-2 flex gap-1 items-start translate-y-1">
                             {(r?.karma_change ?? 0) > 0 && (
                              <span className="px-1.5 py-0.5 bg-amber-900 border border-amber-500/50 rounded text-amber-300 text-[8px] md:text-[9px] font-black uppercase shadow-[0_0_10px_rgba(245,158,11,0.3)] animate-pulse">
                                +{r!.karma_change} Карма
                              </span>
                            )}
                            {newKarma > 0 && newKarma < 3 && (
                              <span className="px-1.5 py-0.5 bg-slate-900 border border-indigo-500/50 rounded text-indigo-300 text-[8px] md:text-[9px] font-black uppercase shadow-[0_0_10px_rgba(99,102,241,0.3)]">
                                {newKarma}✨
                              </span>
                            )}
                            {newKarma >= 3 && (
                              <span className="px-1.5 py-0.5 bg-yellow-950 border border-amber-500/80 rounded text-amber-400 text-[8px] md:text-[9px] font-black uppercase shadow-[0_0_15px_rgba(251,191,36,0.6)] animate-in zoom-in">
                                🔥 ДУЭЛЯНТ ({newKarma}✨)
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Test mode return buttons */}
          {room.current_round === 999 && (
            <div className="max-w-3xl mx-auto w-full mt-2 flex justify-center flex-none">
              <button
                onClick={async () => {
                  await resetPlayersAfterTest();
                  await setRoomStatus(room.id, 'rules');
                  setTestMode('select');
                }}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white transition-colors text-sm"
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
        <div className="min-h-full h-full flex flex-col items-center justify-center gap-12 relative overflow-hidden">
          {/* Epic cinematic background */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(255,0,0,0.15),_transparent_80%)] pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] blur-[150px] rounded-full pointer-events-none bg-red-600/10 animate-pulse" />

          <h2 className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-red-400 to-red-800 drop-shadow-[0_0_40px_rgba(220,38,38,0.8)] tracking-widest uppercase animate-[epicReveal_1s_ease-out_both] z-10">
            ⚔️ Смертельная схватка
          </h2>

          <div className="flex items-center justify-center w-full gap-8 md:gap-24 relative z-10">
            {[duel.challenger_id, duel.challenged_id].map((pid, idx) => {
              const p = players.find(x => x.id === pid);
              if (!p) return null;
              
              const isChallenger = idx === 0;
              const glowColor = isChallenger ? 'rgba(59,130,246,0.6)' : 'rgba(168,85,247,0.6)';
              const borderColor = isChallenger ? 'border-blue-500' : 'border-purple-500';
              const nameColor = isChallenger ? 'text-blue-300' : 'text-purple-300';
              const roleText = isChallenger ? 'Вызывающий' : 'Вызванный';

              return (
                <div key={pid} className={`flex flex-col items-center gap-6 relative group animate-[fadeInUp_0.8s_ease-out_both]`} style={{ animationDelay: isChallenger ? '0.2s' : '0.6s' }}>
                  <div className={`absolute inset-0 blur-[60px] rounded-full opacity-60 mix-blend-screen pointer-events-none`} style={{ backgroundColor: isChallenger ? 'rgba(59,130,246,0.3)' : 'rgba(168,85,247,0.3)' }} />
                  <div className={`relative flex flex-col items-center p-8 rounded-[3rem] border-4 ${borderColor} bg-gray-900/80 backdrop-blur-xl shadow-2xl overflow-hidden`}>
                    {/* Inner highlight */}
                    <div className="absolute top-0 inset-x-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
                    
                    <img src={getAvatarUrl(p.avatar, p.lives)} alt="" className="w-36 h-36 object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)] relative z-10" />
                    <span className={`font-black text-3xl uppercase tracking-widest mt-6 drop-shadow-md ${nameColor}`}>{p.name}</span>
                    <span className="text-gray-400 text-sm font-bold tracking-[0.2em] mt-2 uppercase">{roleText}</span>
                  </div>
                </div>
              );
            })}
            
            {/* The VS Splash */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none z-20 animate-[zoomIn_0.5s_ease-out_1s_both]">
               <div className="text-8xl md:text-[10rem] italic font-black text-white drop-shadow-[0_0_60px_rgba(255,255,255,0.8)]" style={{ textShadow: '0 0 40px #fff, 0 0 80px #facc15, 0 0 120px #ef4444' }}>
                 VS
               </div>
            </div>
          </div>
          
          <p className="text-red-300 text-xl font-bold uppercase tracking-widest mt-8 animatePulse drop-shadow-[0_0_10px_rgba(220,38,38,0.5)] z-10 animate-[fadeIn_2s_ease-in-out_infinite]">
            Подготовка арены...
          </p>
        </div>
      )}

      {/* ─── DUEL SETUP ─── */}
      {room.status === 'duel_setup' && duel && (
        <div className="min-h-full h-full flex flex-col items-center justify-center gap-6 p-6 relative overflow-hidden">
          {duel.mode === 'arithmetic_mean' ? (
            /* Arithmetic Mean Custom Setup */
            <div className="relative z-10 w-full max-w-5xl flex flex-col items-center gap-12 mt-4">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] blur-[150px] rounded-full pointer-events-none bg-blue-600/10" />
              
              <div className="text-center w-full flex flex-col items-center gap-6">
                <div className="px-6 py-2 rounded-full border border-blue-500/30 bg-blue-900/30 text-blue-300 font-bold uppercase tracking-widest text-sm shadow-[0_0_15px_rgba(59,130,246,0.2)]">
                  Среднее арифметическое
                </div>
                <div className="relative w-full">
                  <div className="absolute inset-0 bg-blue-500/20 blur-[50px] rounded-full pointer-events-none" />
                  <div className={`relative bg-gray-900/80 backdrop-blur-md border-y-4 border-blue-500/60 shadow-[0_0_50px_rgba(59,130,246,0.3)] py-12 px-8 ${duelQ ? 'animate-[epicReveal_0.6s_ease-out_both]' : ''}`}>
                    <p className="text-4xl md:text-6xl font-black bg-gradient-to-r from-blue-200 via-white to-blue-200 bg-clip-text text-transparent drop-shadow-sm !leading-tight text-center">
                      {duelQ ? (duelQ as { question: string }).question : 'Загрузка...'}
                    </p>
                  </div>
                </div>
                <p className="text-blue-300/70 font-semibold text-xl animate-pulse">
                  Игроки из толпы вводят свои числа...
                </p>
              </div>

              {/* Progress of crowd */}
              <div className="flex gap-4 flex-wrap justify-center w-full max-w-4xl relative z-20">
                {players.filter(p => !p.is_host && p.id !== duel.challenger_id && p.id !== duel.challenged_id).map((p, i) => {
                  const dd = duel.duel_data as { player_guesses?: Record<string, number> } | null;
                  const hasActed = p.id in (dd?.player_guesses ?? {});
                  return (
                    <div key={p.id} style={{ animationDelay: `${i * 0.1}s` }} className={`flex flex-col items-center gap-2 p-3 rounded-2xl w-28 transition-all duration-300 ease-out ${
                      hasActed 
                        ? 'bg-blue-900/40 border-2 border-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.5)] scale-110' 
                        : 'bg-gray-800/50 border-2 border-gray-700 opacity-60 grayscale'
                    }`}>
                      <img src={getAvatarUrl(p.avatar, p.lives)} alt="" className="w-12 h-12 object-contain drop-shadow-lg" />
                      <span className="text-sm font-bold truncate w-full text-center text-gray-200">{p.name}</span>
                      {hasActed ? (
                        <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-black shadow-[0_0_10px_#3b82f6]">✓</div>
                      ) : (
                        <div className="w-6 h-6 flex items-center justify-center text-gray-500"><svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => setRoomStatus(room.id, 'duel_playing', {})}
                className="mt-6 px-10 py-5 bg-gradient-to-t from-blue-700 to-blue-500 hover:from-blue-600 hover:to-blue-400 rounded-2xl font-black text-2xl shadow-[0_0_30px_rgba(59,130,246,0.5)] hover:scale-105 transition-transform"
              >
                ПЕРЕЙТИ К ДУЭЛЯНТАМ ▶
              </button>
            </div>
          ) : (
            /* Common Setup (Minesweeper, Crowd Forecast) */
            <>
              <h2 className="text-3xl font-black relative z-10">
                {duel.mode === 'minesweeper' ? '' : '🗳️ Прогноз толпы'}
              </h2>

              {duel.mode === 'minesweeper' && (
                <div className="w-full text-center flex flex-col items-center gap-6 relative z-10">
                  <div className="px-6 py-2 rounded-full border border-red-500/30 bg-red-900/30 text-red-300 font-bold uppercase tracking-widest text-sm shadow-[0_0_15px_rgba(220,38,38,0.2)]">
                    ☢️ Минное поле
                  </div>
                  <h2 className="text-4xl md:text-5xl font-black bg-gradient-to-r from-red-400 to-orange-500 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(239,68,68,0.5)] uppercase tracking-wide">
                    Толпа минирует арену
                  </h2>
                  <p className="text-red-300/70 font-semibold text-xl animate-pulse max-w-lg mx-auto">
                    Остальные игроки расставляют скрытые бомбы. Дуэлянтам придётся ступать вслепую.
                  </p>
                  
                  {/* Visual decorative grid */}
                  <div className="mt-8 grid gap-4 p-6 bg-gray-900/80 border-[3px] border-red-900/60 rounded-3xl shadow-[inset_0_0_50px_rgba(0,0,0,0.9),_0_0_40px_rgba(220,38,38,0.2)] backdrop-blur-md relative overflow-hidden"
                       style={{ gridTemplateColumns: `repeat(${Math.ceil(Math.sqrt((duel.duel_data as { tile_count?: number })?.tile_count ?? 9))}, 1fr)` }}>
                     {/* Scanning laser effect */}
                     <div className="absolute top-0 left-0 w-full h-[3px] bg-red-500 shadow-[0_0_20px_rgba(239,68,68,1)] animate-[scanDown_3s_linear_infinite]" />
                    {Array.from({ length: (duel.duel_data as { tile_count?: number })?.tile_count ?? 9 }).map((_, i) => (
                      <div key={i} className="w-16 h-16 md:w-20 md:h-20 bg-gray-800 border-2 border-gray-700/80 rounded-2xl flex items-center justify-center text-red-900/40 text-4xl shadow-inner relative group isolate">
                        <div className="absolute inset-0 bg-red-500/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl mix-blend-screen" />
                        <span className="animate-[pulse_3s_ease-in-out_infinite]" style={{ animationDelay: `${i * -0.4}s` }}>❖</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {duel.mode === 'crowd_forecast' && duelQ && (
                <div className="w-full text-center flex flex-col items-center gap-6 relative z-10">
                  <div className="px-6 py-2 rounded-full border border-purple-500/30 bg-purple-900/30 text-purple-300 font-bold uppercase tracking-widest text-sm shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                    🗳️ Прогноз толпы
                  </div>
                  
                  <div className="relative w-full max-w-4xl">
                    <div className="absolute inset-0 bg-purple-500/20 blur-[50px] rounded-full pointer-events-none" />
                    <div className="relative bg-gray-900/80 backdrop-blur-xl border-y-4 border-purple-500/60 shadow-[0_0_50px_rgba(168,85,247,0.3)] py-10 px-8 rounded-[2rem] animate-[epicReveal_0.6s_ease-out_both]">
                      <p className="text-3xl md:text-5xl font-black bg-gradient-to-r from-purple-300 via-white to-purple-300 bg-clip-text text-transparent drop-shadow-sm !leading-tight text-center">
                        {(duelQ as { question: string }).question}
                      </p>
                    </div>
                  </div>

                  <p className="text-purple-300/70 font-semibold text-xl animate-pulse mt-2">
                    Избиратели делают свой выбор...
                  </p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-5xl mt-4">
                    {((duelQ as { options: string[] }).options ?? []).map((opt, i) => (
                      <div key={i} className="bg-gray-800/80 border-2 border-gray-600/50 rounded-2xl p-4 text-center font-bold text-lg text-gray-200 shadow-lg relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-tr from-purple-600/10 to-transparent opacity-50" />
                        <span className="text-purple-400 mr-2 text-xl font-black">{i + 1}.</span> {opt}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-4 flex-wrap justify-center relative z-10 w-full max-w-4xl mt-6">
                {players.filter(p => !p.is_host && p.id !== duel.challenger_id && p.id !== duel.challenged_id).map(p => {
                  const dd = duel.duel_data as { mined_tiles?: Record<string, number[]>; player_votes?: Record<string, number>; player_guesses?: Record<string, number> } | null;
                  const hasActed = duel.mode === 'minesweeper'
                    ? !!(dd?.mined_tiles?.[p.id])
                    : duel.mode === 'arithmetic_mean' 
                      ? p.id in (dd?.player_guesses ?? {})
                      : p.id in (dd?.player_votes ?? {});
                  
                  const isMinesweeper = duel.mode === 'minesweeper';

                  return (
                    <div key={p.id} className={`flex flex-col items-center gap-2 p-3 rounded-2xl w-28 transition-all duration-300 ease-out ${
                      hasActed 
                        ? (isMinesweeper ? 'bg-red-900/40 border-2 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)] scale-110' : 'bg-green-900/40 border-2 border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.5)] scale-110')
                        : 'bg-gray-800/50 border-2 border-gray-700 opacity-60 grayscale'
                    }`}>
                      <img src={getAvatarUrl(p.avatar, p.lives)} alt="" className="w-12 h-12 object-contain drop-shadow-lg" />
                      <span className="text-sm font-bold truncate w-full text-center text-gray-200">{p.name}</span>
                      {hasActed ? (
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-black ${isMinesweeper ? 'bg-red-600 shadow-[0_0_10px_#ef4444]' : 'bg-green-600 shadow-[0_0_10px_#22c55e]'}`}>
                           {isMinesweeper ? '💣' : '✓'}
                        </div>
                      ) : (
                        <div className="w-6 h-6 flex items-center justify-center text-gray-500"><svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => setRoomStatus(room.id, 'duel_playing', {})}
                className={`mt-10 px-10 py-5 rounded-2xl font-black text-2xl shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:scale-105 transition-transform relative z-10 ${duel.mode === 'minesweeper' ? 'bg-gradient-to-t from-red-800 to-red-500 hover:from-red-700 hover:to-red-400' : 'bg-gradient-to-t from-blue-700 to-blue-500 hover:from-blue-600 hover:to-blue-400'}`}
              >
                ПЕРЕЙТИ К ДУЭЛЯНТАМ ▶
              </button>
            </>
          )}
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
              <div className="flex flex-col items-center gap-12 w-full max-w-5xl relative z-10">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] blur-[150px] rounded-full pointer-events-none bg-red-900/10" />

                <div className="flex items-center justify-between w-full px-8 md:px-20 mt-8">
                  {([
                    { p: challenger, picks: challengerPicks, isChallenger: true }, 
                    { p: challenged, picks: challengedPicks, isChallenger: false }
                  ]).map(({ p, picks, isChallenger }) => {
                    if (!p) return null;
                    const glowColor = isChallenger ? 'rgba(59,130,246,0.6)' : 'rgba(168,85,247,0.6)';
                    const borderColor = isChallenger ? 'border-blue-500' : 'border-purple-500';
                    const textColor = isChallenger ? 'text-blue-300' : 'text-purple-300';
                    return (
                      <div key={p.id} className={`flex flex-col items-center gap-4 relative group animate-[fadeIn_0.5s_ease-out]`}>
                        <div className={`absolute inset-0 blur-[50px] rounded-full mix-blend-screen opacity-50`} style={{ backgroundColor: glowColor }} />
                        <div className={`relative flex flex-col items-center justify-center p-6 rounded-[2rem] border-4 ${borderColor} bg-gray-900/90 shadow-2xl`}>
                          <img src={getAvatarUrl(p.avatar, p.lives)} alt="" className="w-28 h-28 object-contain drop-shadow-xl z-10" />
                          <span className={`mt-4 font-black uppercase text-2xl tracking-widest ${textColor}`}>{p.name}</span>
                          
                          <div className={`mt-3 px-6 py-2 rounded-xl text-sm font-bold uppercase tracking-widest bg-gray-950 border border-gray-700 ${picks.length > 0 ? (isChallenger ? 'text-blue-400' : 'text-purple-400') : 'text-gray-500 animate-pulse'}`}>
                            {picks.length > 0 ? `Шагов: ${picks.length}` : 'Думает...'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="relative p-6 md:p-8 bg-gray-950/80 backdrop-blur-xl rounded-[3rem] border-2 border-red-900/40 shadow-[0_0_80px_rgba(0,0,0,0.8)]">
                  {/* Danger border pulse */}
                  <div className="absolute inset-0 rounded-inherit border-[3px] border-red-500/30 animate-[laserPulse_3s_ease-in-out_infinite] pointer-events-none" />
                  
                  <div
                    className="grid gap-3 relative z-10"
                    style={{ gridTemplateColumns: `repeat(${Math.ceil(Math.sqrt(tileCount))}, 1fr)` }}
                  >
                    {Array.from({ length: tileCount }).map((_, i) => {
                      const isMined = allMines.includes(i);
                      const challengerPicked = challengerPicks.includes(i);
                      const challengedPicked = challengedPicks.includes(i);
                      const explodedHere = (challengerPicked && isMined) || (challengedPicked && isMined);
                      
                      const bgColor = explodedHere ? 'bg-red-900' :
                                      challengerPicked ? 'bg-blue-900' :
                                      challengedPicked ? 'bg-purple-900' :
                                      'bg-gray-800';
                      
                      const bColor = explodedHere ? 'border-red-400' :
                                      challengerPicked ? 'border-blue-400' :
                                      challengedPicked ? 'border-purple-400' :
                                      'border-gray-600';

                      const glow = explodedHere ? 'shadow-[0_0_40px_rgba(239,68,68,1)]' :
                                   challengerPicked ? 'shadow-[0_0_20px_rgba(59,130,246,0.8)]' :
                                   challengedPicked ? 'shadow-[0_0_20px_rgba(168,85,247,0.8)]' :
                                   'shadow-[inset_0_0_15px_rgba(0,0,0,1)]';

                      return (
                        <div key={i} className={`w-20 h-20 md:w-32 md:h-32 rounded-2xl font-black text-5xl flex items-center justify-center border-4 transition-all duration-300 ${bgColor} ${bColor} ${glow} ${explodedHere ? 'animate-[shakeBoard_0.5s_ease-out_both]' : 'hover:scale-105'}`}>
                          {explodedHere 
                            ? <span className="animate-[epicReveal_0.5s_ease-out_both] drop-shadow-[0_0_20px_#ef4444] filter brightness-150">💥</span> 
                            : challengerPicked ? <span className="text-blue-300 drop-shadow-[0_0_10px_#3b82f6] animate-[flipInY_0.5s_ease-out]">✅</span> 
                            : challengedPicked ? <span className="text-purple-300 drop-shadow-[0_0_10px_#a855f7] animate-[flipInY_0.5s_ease-out]">✅</span> 
                            : <span className="text-gray-600 font-mono text-3xl opacity-30 select-none">{i + 1}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}

          {duel.mode === 'arithmetic_mean' && (() => {
            const challenger = players.find(p => p.id === duel.challenger_id);
            const challenged = players.find(p => p.id === duel.challenged_id);
            
            return (
              <div className="flex flex-col items-center gap-12 w-full max-w-5xl relative z-10 mt-8">
                {duelQ && (
                  <div className="bg-gray-900/60 backdrop-blur-sm border-y-2 border-blue-500/40 w-full text-center py-6 shadow-[0_0_30px_rgba(59,130,246,0.15)]">
                    <p className="text-2xl md:text-3xl font-black bg-gradient-to-r from-blue-300 to-blue-100 bg-clip-text text-transparent">
                      {(duelQ as { question: string }).question}
                    </p>
                  </div>
                )}
                
                <div className="flex items-center justify-center gap-12 lg:gap-24 w-full">
                  {([
                    { player: challenger, isChallenger: true },
                    { player: challenged, isChallenger: false },
                  ]).map(({ player: p, isChallenger }) => {
                    const dd = duel.duel_data as { challenger_answer?: unknown; challenged_answer?: unknown } | null;
                    const hasAnswered = isChallenger ? dd?.challenger_answer != null : dd?.challenged_answer != null;
                    if (!p) return null;
                    
                    return (
                      <div key={p.id} className="relative group">
                        {/* Glow background */}
                        <div className={`absolute inset-0 blur-2xl rounded-full transition-all duration-700 ${
                          hasAnswered ? 'bg-blue-500/50 scale-110' : 'bg-gray-500/10 scale-90'
                        }`} />
                        
                        {/* Card */}
                        <div className={`relative flex flex-col items-center justify-center w-64 h-80 rounded-3xl border-4 transition-all duration-500 bg-gray-900/90 overflow-hidden ${
                          hasAnswered 
                            ? 'border-blue-400 shadow-[0_0_40px_rgba(59,130,246,0.6)] animate-[lockIn_0.5s_ease-out_both]' 
                            : 'border-gray-700 animate-[neonPulse_2s_infinite]'
                        }`}>
                          <img 
                            src={getAvatarUrl(p.avatar, p.lives)} 
                            alt="" 
                            className={`w-32 h-32 object-contain transition-all duration-300 drop-shadow-xl ${hasAnswered ? 'scale-110' : ''}`} 
                          />
                          <span className="mt-4 font-black text-2xl text-gray-200 uppercase tracking-wide text-center px-4 leading-tight">{p.name}</span>
                          
                          <div className={`mt-4 px-6 py-2 rounded-xl text-sm font-bold uppercase tracking-widest transition-all ${
                            hasAnswered ? 'bg-blue-500 text-white shadow-[0_0_15px_#3b82f6]' : 'bg-gray-800 text-gray-400'
                          }`}>
                            {hasAnswered ? 'Ответил' : 'Ожидание...'}
                          </div>
                          
                          {/* Inner glow on answered */}
                          {hasAnswered && <div className="absolute inset-0 box-shadow-[inset_0_0_50px_rgba(59,130,246,0.3)] pointer-events-none" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {duel.mode === 'crowd_forecast' && (() => {
            const challenger = players.find(p => p.id === duel.challenger_id);
            const challenged = players.find(p => p.id === duel.challenged_id);

            return (
              <div className="flex flex-col items-center gap-12 w-full max-w-5xl relative z-10 mt-8">
                {duelQ && (
                  <div className="flex flex-col items-center gap-4 w-full">
                    <div className="px-6 py-2 rounded-full border border-purple-500/30 bg-purple-900/30 text-purple-300 font-bold uppercase tracking-widest text-sm shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                      🤔 Угадай мнение толпы
                    </div>
                    <div className="bg-gray-900/80 backdrop-blur-md border-y-2 border-purple-500/50 w-full text-center py-6 shadow-[0_0_30px_rgba(168,85,247,0.2)]">
                      <p className="text-2xl md:text-3xl font-black bg-gradient-to-r from-purple-300 to-white bg-clip-text text-transparent drop-shadow-md">
                        {(duelQ as { question: string }).question}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-4xl px-4 mt-2">
                       {((duelQ as { options: string[] }).options ?? []).map((opt, i) => (
                        <div key={i} className="bg-gray-800/80 border border-purple-500/30 rounded-xl p-3 text-center font-bold text-sm text-purple-200 opacity-80">
                          {i + 1}. {opt}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="flex items-center justify-center gap-12 lg:gap-24 w-full mt-4">
                  {([
                    { player: challenger, isChallenger: true },
                    { player: challenged, isChallenger: false },
                  ]).map(({ player: p, isChallenger }) => {
                    const dd = duel.duel_data as { challenger_prediction?: unknown; challenged_prediction?: unknown } | null;
                    const hasAnswered = isChallenger ? dd?.challenger_prediction != null : dd?.challenged_prediction != null;
                    if (!p) return null;
                    
                    const borderColor = hasAnswered ? 'border-purple-400' : 'border-gray-700';
                    const glowScale = hasAnswered ? 'bg-purple-500/50 scale-110' : 'bg-gray-500/10 scale-90';
                    const textBadge = hasAnswered ? 'bg-purple-500 text-white shadow-[0_0_15px_#a855f7]' : 'bg-gray-800 text-gray-400';
                    
                    return (
                      <div key={p.id} className="relative group">
                        {/* Glow background */}
                        <div className={`absolute inset-0 blur-2xl rounded-full transition-all duration-700 ${glowScale}`} />
                        
                        {/* Card */}
                        <div className={`relative flex flex-col items-center justify-center w-64 h-80 rounded-3xl border-4 transition-all duration-500 bg-gray-900/90 overflow-hidden ${
                          hasAnswered 
                            ? `${borderColor} shadow-[0_0_40px_rgba(168,85,247,0.6)] animate-[lockIn_0.5s_ease-out_both]` 
                            : `${borderColor} animate-[neonPulse_2s_infinite]`
                        }`}>
                          <img 
                            src={getAvatarUrl(p.avatar, p.lives)} 
                            alt="" 
                            className={`w-32 h-32 object-contain transition-all duration-300 drop-shadow-xl ${hasAnswered ? 'scale-110 drop-shadow-[0_0_15px_#a855f7]' : ''}`} 
                          />
                          <span className="mt-4 font-black text-2xl text-gray-200 uppercase tracking-wide text-center px-4 leading-tight">{p.name}</span>
                          
                          <div className={`mt-4 px-6 py-2 rounded-xl text-sm font-bold uppercase tracking-widest transition-all ${textBadge}`}>
                            {hasAnswered ? 'Выбрал' : 'Думает...'}
                          </div>
                          
                          {/* Inner glow on answered */}
                          {hasAnswered && <div className="absolute inset-0 box-shadow-[inset_0_0_50px_rgba(168,85,247,0.3)] pointer-events-none" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ─── DUEL RESULT ─── */}
      {room.status === 'duel_result' && (() => {
        const winnerId = duel?.winner_id ?? (room.duel_data as { winner_id?: string } | null)?.winner_id ?? null;
        const winner = winnerId ? players.find(p => p.id === winnerId) : null;
        const challenger = duel ? players.find(p => p.id === duel.challenger_id) : null;
        const challenged = duel ? players.find(p => p.id === duel.challenged_id) : null;
        const nonDuelists = duel
          ? players.filter(p => !p.is_host && p.id !== duel.challenger_id && p.id !== duel.challenged_id)
          : [];

        const isDraw = winnerId === null;

        return (
          <div className="min-h-full h-full flex flex-col items-center justify-center gap-6 px-6 py-8 relative overflow-hidden">
            {/* Background glow */}
            <div className={`absolute inset-0 pointer-events-none ${isDraw ? 'bg-gray-800/20' : 'bg-yellow-600/5'}`} />
            <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] blur-[100px] rounded-full pointer-events-none ${isDraw ? 'bg-gray-600/20' : 'bg-yellow-500/10'}`} />

            {/* ─── Result headline ─── */}
            <div className="relative z-10 flex flex-col items-center gap-3">
              <h2 className="text-3xl font-black tracking-tight text-gray-400 uppercase">⚔️ Итог дуэли</h2>
              {winner ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="relative">
                    <div className="absolute inset-0 bg-yellow-400/30 blur-2xl rounded-full" />
                    <img src={getAvatarUrl(winner.avatar, winner.lives)} alt="" className="w-28 h-28 object-contain relative z-10 drop-shadow-[0_0_20px_rgba(250,204,21,0.6)]" />
                  </div>
                  <span className="text-4xl font-black text-yellow-400 drop-shadow-[0_0_12px_rgba(250,204,21,0.5)]">🏆 {winner.name} победил!</span>
                </div>
              ) : (
                <span className="text-3xl font-black text-gray-300">🤝 Ничья — все остаются</span>
              )}
            </div>

            {/* ─── Duel data panel ─── */}
            {duel && (() => {
              /* ══════════ ARITHMETIC MEAN ══════════ */
              if (duel.mode === 'arithmetic_mean') {
                const dd = duel.duel_data as {
                  question?: string;
                  player_guesses?: Record<string, number>;
                  average?: number | null;
                  challenger_answer?: number | null;
                  challenged_answer?: number | null;
                } | null;
                if (!dd) return null;
                const avg = dd.average ?? 0;
                const chDiff = dd.challenger_answer != null ? Math.abs(dd.challenger_answer - avg) : null;
                const cdDiff = dd.challenged_answer != null ? Math.abs(dd.challenged_answer - avg) : null;
                const chWon = winnerId === duel.challenger_id;
                const cdWon = winnerId === duel.challenged_id;

                // Deterministic pseudo-random for stable positions across re-renders
                const seededRand = (seed: number, min: number, max: number) => {
                  const x = Math.sin(seed * 9301 + 49297) * 233280;
                  return min + ((x - Math.floor(x)) * (max - min));
                };
                const rawGuesses = Object.values(dd.player_guesses ?? {});
                // Always show at least 6 flying cards; fill with '?' if no player guesses yet
                const flyingCards: (number | string)[] = rawGuesses.length > 0
                  ? rawGuesses
                  : Array.from({ length: 12 }, () => '?');

                return (
                  <>
                    {/* Flying anonymous player answer cards — infinite loop */}
                    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden opacity-90 perspective-[800px]">
                      {flyingCards.map((val, i) => {
                        const total = flyingCards.length;
                        const topPct = seededRand(i * 5 + 1, 5, 85);
                        const duration = seededRand(i * 5 + 2, 4.0, 9.0);
                        // Stagger by offsetting the phase within one cycle using a negative delay
                        const negDelay = -((i / total) * duration);
                        const scale = seededRand(i * 5 + 3, 0.6, 1.4);
                        const isPrimary = i % 3 === 0;

                        return (
                          <div
                            key={i}
                            style={{
                              position: 'absolute',
                              top: `${topPct.toFixed(1)}%`,
                              left: 0,
                              animation: `amFlyCard ${duration.toFixed(2)}s linear ${negDelay.toFixed(2)}s infinite`,
                              // Z-index based on scale to keep bigger things in front
                              zIndex: Math.round(scale * 10)
                            }}
                          >
                            <div 
                              style={{ transform: `scale(${scale.toFixed(2)})` }}
                              className={`flex items-center justify-center min-w-[130px] px-8 py-4 rounded-3xl backdrop-blur-md shadow-2xl border-[3px] ${
                                isPrimary 
                                  ? 'bg-blue-600/50 border-cyan-300 shadow-[0_0_35px_rgba(6,182,212,0.8)]' 
                                  : 'bg-purple-900/60 border-purple-400/70 shadow-[0_0_20px_rgba(168,85,247,0.5)]'
                              }`}
                            >
                              <span className="text-white font-black text-5xl tabular-nums drop-shadow-[0_5px_15px_rgba(0,0,0,0.9)]">
                                {val}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Main content panel */}
                    <div className="relative z-10 w-full max-w-5xl flex flex-col gap-10 mt-8">
                      {/* Question */}
                      {dd.question && (
                        <div className="bg-gray-900/80 backdrop-blur-md border-y-2 border-blue-500/40 w-full text-center py-4 shadow-[0_0_40px_rgba(59,130,246,0.2)]">
                          <p className="text-xl md:text-2xl font-black bg-gradient-to-r from-blue-200 to-white bg-clip-text text-transparent drop-shadow-lg uppercase tracking-wide">
                            {dd.question}
                          </p>
                        </div>
                      )}

                      {/* Duelists Cards (FLIPPING) */}
                      <div className="flex gap-16 justify-center mt-4">
                        {([
                          { player: challenger, answer: dd.challenger_answer, diff: chDiff, won: chWon },
                          { player: challenged, answer: dd.challenged_answer, diff: cdDiff, won: cdWon },
                        ] as { player: typeof challenger; answer: number | null | undefined; diff: number | null; won: boolean }[]).map(({ player, answer, diff, won }, idx) => (
                          <div key={idx} style={{ perspective: '1000px', animationDelay: `${idx * 0.3}s` }} className={`w-72 h-80 relative group animate-[flipInY_1.2s_ease-out_both]`}>
                            {/* Inner Flip Container */}
                            <div className={`relative w-full h-full duration-700 [transform-style:preserve-3d]`}>
                              
                              {/* Card Front (Actual visual) */}
                              <div className={`absolute w-full h-full flex flex-col items-center justify-between py-6 rounded-3xl border-4 [backface-visibility:hidden] outline-none shadow-2xl ${
                                won
                                  ? 'bg-gradient-to-b from-yellow-900/90 to-yellow-800/90 border-yellow-400 shadow-[0_0_50px_rgba(250,204,21,0.5)] z-20 scale-105'
                                  : 'bg-gray-900/90 border-gray-600 grayscale brightness-50 z-10'
                              }`}>
                                {won && (
                                  <div className="absolute -top-6 -right-6 text-5xl drop-shadow-[0_0_15px_rgba(250,204,21,0.8)] animate-bounce">👑</div>
                                )}
                                
                                <img src={player ? getAvatarUrl(player.avatar, player.lives) : ''} alt="" className="w-24 h-24 object-contain drop-shadow-xl" />
                                <span className={`font-black text-2xl uppercase tracking-widest text-center px-2 line-clamp-1 ${won ? 'text-yellow-100' : 'text-gray-300'}`}>{player?.name ?? '—'}</span>
                                
                                <div className={`w-full text-center py-2 ${won ? 'bg-yellow-500/20' : 'bg-gray-800/50 border-t border-gray-700'}`}>
                                  <span className={`font-black text-5xl tabular-nums ${won ? 'text-yellow-300 drop-shadow-[0_0_10px_rgba(250,204,21,0.8)]' : 'text-white'}`}>{answer ?? '—'}</span>
                                </div>
                                
                                {diff != null && (
                                  <div className={`text-sm tracking-wider font-bold ${won ? 'text-yellow-500' : 'text-gray-500'}`}>
                                    ПРОМАХ: <span className={won ? 'text-yellow-200' : 'text-gray-300'}>{diff.toFixed(2)}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Average - Massive Reveal */}
                      <div className="flex justify-center -mt-6 z-30">
                        <div className="bg-gray-900 border-4 border-blue-500 rounded-3xl px-16 py-6 flex flex-col items-center gap-2 shadow-[0_0_80px_rgba(59,130,246,0.6)] animate-[epicReveal_1s_ease-out_1s_both]">
                          <span className="text-blue-400/90 text-sm font-black uppercase tracking-[0.3em]">Среднее толпы</span>
                          <span className="text-white font-black text-7xl tabular-nums drop-shadow-[0_0_30px_rgba(255,255,255,0.7)]">
                            {/* Wait 1s and then animate a pseudo count up (handled by CSS or just display instantly but scale up) */}
                            <span className="animate-[numberSpinIn_1.5s_ease-out_both] inline-block">{avg.toFixed(2)}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                );
              }

              /* ══════════ MINESWEEPER ══════════ */
              if (duel.mode === 'minesweeper') {
                const dd = duel.duel_data as { tile_count?: number; mined_tiles?: Record<string, number[]>; challenger_picks?: number[]; challenged_picks?: number[]; exploded_challenger?: boolean; exploded_challenged?: boolean } | null;
                const challengerPicks = dd?.challenger_picks ?? [];
                const challengedPicks = dd?.challenged_picks ?? [];
                const allMines = Object.values(dd?.mined_tiles ?? {}).flat();
                const tileCount = dd?.tile_count ?? 9;

                return (
                  <div className="relative z-10 w-full max-w-5xl flex flex-col items-center gap-10 mt-8">
                    {/* The Full Exposed Board */}
                    <div className="relative p-6 md:p-8 bg-gray-900 border-4 border-red-500/50 shadow-[0_0_80px_rgba(239,68,68,0.3)] rounded-[3rem] animate-[epicReveal_1s_ease-out_both] overflow-hidden">
                      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(239,68,68,0.2),_transparent_70%)] pointer-events-none" />
                      
                      <div className="mb-6 text-center">
                        <span className="bg-red-950/80 border border-red-500/50 text-red-300 font-bold uppercase tracking-widest px-6 py-2 rounded-full shadow-[0_0_15px_rgba(220,38,38,0.5)]">
                          Карта минного поля
                        </span>
                      </div>

                      <div
                        className="grid gap-3 relative z-10"
                        style={{ gridTemplateColumns: `repeat(${Math.ceil(Math.sqrt(tileCount))}, 1fr)` }}
                      >
                        {Array.from({ length: tileCount }).map((_, i) => {
                          const isMined = allMines.includes(i);
                          const challengerPicked = challengerPicks.includes(i);
                          const challengedPicked = challengedPicks.includes(i);
                          const explodedHere = (challengerPicked && isMined) || (challengedPicked && isMined);
                          
                          // Look differs slightly here: we want to reveal ALL mines now
                          const bgColor = explodedHere ? 'bg-red-700' :
                                          isMined ? 'bg-red-950/80' : 
                                          challengerPicked ? 'bg-blue-900/80' :
                                          challengedPicked ? 'bg-purple-900/80' :
                                          'bg-gray-800';
                          
                          const bColor = explodedHere ? 'border-red-400' :
                                          isMined ? 'border-red-800' :
                                          challengerPicked ? 'border-blue-400' :
                                          challengedPicked ? 'border-purple-400' :
                                          'border-gray-600';

                          return (
                            <div key={i} style={{ animationDelay: `${i * 0.05}s` }} className={`w-20 h-20 md:w-28 md:h-28 rounded-2xl font-black text-5xl flex items-center justify-center border-4 transition-all ${bgColor} ${bColor} animate-[flipInY_0.6s_ease-out_both]`}>
                              {explodedHere 
                                ? <span className="animate-pulse drop-shadow-[0_0_15px_#ef4444]">💥</span> 
                                : isMined ? <span className="text-red-900/80 opacity-60">💣</span> 
                                : challengerPicked ? <span className="text-blue-300">✅</span> 
                                : challengedPicked ? <span className="text-purple-300">✅</span> 
                                : <span className="text-gray-700 font-mono text-2xl opacity-20">ПУСТО</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              }

              /* ══════════ CROWD FORECAST ══════════ */
              if (duel.mode === 'crowd_forecast') {
                const dd = duel.duel_data as {
                  question?: string;
                  options?: string[];
                  player_votes?: Record<string, number>;
                  majority_index?: number | null;
                  challenger_prediction?: number | null;
                  challenged_prediction?: number | null;
                } | null;
                if (!dd || !dd.options) return null;
                const voteEntries = Object.entries(dd.player_votes ?? {});
                const totalVotes = voteEntries.length;
                const isTie = dd.majority_index === -1;
                const majIdx = isTie ? null : (dd.majority_index ?? null);

                return (
                  <div className="relative z-10 w-full max-w-6xl flex flex-col items-center gap-8 mt-4">
                    {/* Duelists' predictions */}
                    <div className="flex gap-16 justify-center w-full px-8">
                      {([
                        { player: challenger, pred: dd.challenger_prediction, won: winnerId === duel.challenger_id, left: true },
                        { player: challenged, pred: dd.challenged_prediction, won: winnerId === duel.challenged_id, left: false },
                      ] as { player: typeof challenger; pred: number | null | undefined; won: boolean; left: boolean }[]).map(({ player, pred, won, left }, idx) => {
                        const predLabel = pred != null && dd.options ? (dd.options[pred] ?? `#${pred + 1}`) : '—';
                        const isCorrect = pred != null && pred === majIdx;
                        
                        return (
                          <div key={idx} className={`relative flex flex-col items-center group animate-[fadeIn_0.5s_ease-out]`}>
                            {/* Inner Flip Container */}
                            <div className={`relative w-64 h-72 flex flex-col items-center justify-center p-6 rounded-[2rem] border-4 shadow-2xl transition-all duration-700
                              ${won
                                ? 'bg-gradient-to-b from-purple-900/90 to-purple-800/90 border-purple-400 shadow-[0_0_50px_rgba(168,85,247,0.5)] z-20 scale-110 animate-[lockIn_1s_ease-out_both]'
                                : 'bg-gray-900/90 border-gray-600 grayscale brightness-50 z-10'
                              }`}>
                              
                              {won && (
                                <div className="absolute -top-6 -right-6 text-5xl drop-shadow-[0_0_15px_rgba(168,85,247,0.8)] animate-bounce">👑</div>
                              )}
                              
                              <img src={player ? getAvatarUrl(player.avatar, player.lives) : ''} alt="" className="w-24 h-24 object-contain drop-shadow-xl z-10" />
                              <span className={`mt-3 font-black uppercase text-xl md:text-2xl tracking-widest text-center px-2 line-clamp-1 ${won ? 'text-purple-100' : 'text-gray-300'}`}>{player?.name ?? '—'}</span>
                              
                              <div className={`mt-3 w-full text-center py-2 px-1 rounded-xl border ${isCorrect ? 'bg-green-500/20 border-green-500/50' : won ? 'bg-purple-500/20 border-purple-500/50' : 'bg-red-500/10 border-red-500/30'}`}>
                                <p className="text-xs uppercase font-bold text-gray-400 mb-1">Выбор:</p>
                                <span className={`font-black text-lg md:text-xl leading-tight ${isCorrect ? 'text-green-400 drop-shadow-[0_0_10px_#4ade80]' : won ? 'text-purple-300' : 'text-red-400 opacity-50'}`}>{predLabel}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Grand Poll Results */}
                    <div className="bg-gray-900/80 backdrop-blur-xl border-4 border-purple-500/60 shadow-[0_0_80px_rgba(168,85,247,0.3)] w-full max-w-4xl p-8 rounded-[3rem] mt-4 flex flex-col gap-6 animate-[epicReveal_1.2s_ease-out_both]">
                      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(168,85,247,0.2),_transparent_70%)] pointer-events-none rounded-[3rem]" />
                      
                      {dd.question && (
                        <p className="text-center font-black text-2xl md:text-3xl bg-gradient-to-r from-purple-300 to-white bg-clip-text text-transparent drop-shadow-md">
                          {dd.question}
                        </p>
                      )}

                      <div className="flex flex-col gap-4 mt-2">
                        {dd.options.map((opt, i) => {
                          const count = voteEntries.filter(([, v]) => v === i).length;
                          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                          const isMaj = majIdx === i;
                          const isPickedByWinner = winnerId === duel.challenger_id && dd.challenger_prediction === i || winnerId === duel.challenged_id && dd.challenged_prediction === i;
                          const voterIds = voteEntries.filter(([, v]) => v === i).map(([id]) => id);
                          const voters = voterIds.map(id => nonDuelists.find(p => p.id === id)).filter(Boolean) as typeof nonDuelists;

                          return (
                            <div key={i} className={`relative flex flex-col gap-1 w-full bg-gray-950/60 rounded-2xl p-4 border-2 transition-all duration-700 ${isMaj ? 'border-purple-400 scale-[1.02] shadow-[0_0_30px_rgba(168,85,247,0.4)]' : 'border-gray-800'}`}>
                              <div className="flex justify-between items-end relative z-10 mb-1">
                                <span className={`font-bold text-lg ${isMaj ? 'text-purple-300' : 'text-gray-400'}`}>
                                  {i + 1}. {opt} {isMaj && <span className="ml-2 text-purple-400 font-black animate-pulse">✓ МАЖОРИТАРЯ</span>}
                                </span>
                                <span className={`font-black tracking-tighter text-2xl ${isMaj ? 'text-purple-300 drop-shadow-[0_0_10px_#a855f7]' : 'text-gray-500'}`}>
                                  {count} <span className="text-sm">({pct}%)</span>
                                </span>
                              </div>

                              {/* Cinematic Progress Bar */}
                              <div className="h-4 w-full bg-gray-900 rounded-full overflow-hidden border border-gray-800 relative z-10">
                                <div
                                  className={`h-full rounded-full transition-all duration-[1500ms] ease-out ${isMaj ? 'bg-gradient-to-r from-purple-600 to-purple-400 shadow-[0_0_15px_#a855f7]' : 'bg-gray-600'}`}
                                  style={{ width: `${pct}%`, animation: `slideRight 1.5s ease-out` }}
                                />
                              </div>

                              {voters.length > 0 && (
                                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-800">
                                  <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mr-1">Голосовали:</span>
                                  {voters.map(p => (
                                    <img key={p.id} src={getAvatarUrl(p.avatar, p.lives)} alt={p.name} title={p.name} className="w-8 h-8 object-contain drop-shadow-md hover:scale-125 transition-transform" />
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              }

              /* ══════════ MINESWEEPER (no non-duelist answers) ══════════ */
              return null;
            })()}

            {/* Test mode return buttons */}
            {room.current_round === 999 && (
              <div className="flex justify-center mt-4 relative z-10">
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

            {room.current_round !== 999 && <p className="text-gray-500 animate-pulse relative z-10">Переход к следующему ходу...</p>}
          </div>
        );
      })()}

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
        <FinishedView ranked={ranked} onExit={() => router.push('/ctrl-8f2q9z')} />
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
          {['moving','round_intro','round_playing','round_results','bet_reveal','duel_intro','duel_setup','duel_playing','duel_result','potato_intro','potato_playing','potato_result'].includes(room.status) && (
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
