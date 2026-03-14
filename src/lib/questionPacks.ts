// --- Cloud storage base URL for all JSON question data ---
const JSON_CDN_BASE = 'https://storage.yandexcloud.net/vecherinkach/json';

// --- Built-in packs (always available, no DB required) ---
export interface QuestionPack {
  id: string;
  label: string;
  description: string;
  is_public: boolean;
  is_active: boolean;
  json_base_url: string;
  audio_round2_start: number;
  audio_round2_end: number;
  audio_round3_start: number;
  audio_round5_start: number;
}

const BUILTIN_PACKS: QuestionPack[] = [
  {
    id: 'classic',
    label: 'Классический',
    description: 'Оригинальный пакет вопросов',
    is_public: true,
    is_active: true,
    json_base_url: `${JSON_CDN_BASE}/main_questions`,
    audio_round2_start: 1,
    audio_round2_end: 81,
    audio_round3_start: 1,
    audio_round5_start: 1,
  },
  {
    id: '03012026',
    label: 'Пакет от 16.01.2026',
    description: 'Альтернативный пакет вопросов',
    is_public: true,
    is_active: true,
    json_base_url: `${JSON_CDN_BASE}/packs/03012026`,
    audio_round2_start: 82,
    audio_round2_end: 93,
    audio_round3_start: 67,
    audio_round5_start: 68,
  },
];

// Legacy compat
export const PACK_IDS = ['classic', '03012026'] as const;
export type PackId = string;
export const DEFAULT_PACK_ID: PackId = 'classic';

export const QUESTION_PACKS: ReadonlyArray<{ id: string; label: string }> = BUILTIN_PACKS.map(p => ({
  id: p.id,
  label: p.label,
}));

// --- Runtime pack cache (loaded from DB once) ---
let _packsCache: QuestionPack[] | null = null;
let _packsCacheTs = 0;
const PACKS_CACHE_TTL = 3_600_000; // 1 hour — game sessions can last 30–60 min

export const setPacksCache = (packs: QuestionPack[]) => {
  _packsCache = packs.map(p => ({
    ...p,
    json_base_url: p.json_base_url.replace(/\/+$/, ''),
  }));
  _packsCacheTs = Date.now();
};

export const getPacksCache = (): QuestionPack[] | null => {
  if (_packsCache && Date.now() - _packsCacheTs < PACKS_CACHE_TTL) return _packsCache;
  return null;
};

export const getBuiltinPack = (packId: string): QuestionPack | undefined =>
  BUILTIN_PACKS.find((p) => p.id === packId);

export const resolvePackConfig = (packId: string): QuestionPack => {
  // Check runtime cache first (DB-loaded packs) — use raw cache even if TTL expired,
  // because falling back to hardcoded defaults produces wrong audio offsets.
  const cached = _packsCache;
  if (cached) {
    const found = cached.find((p) => p.id === packId);
    if (found) return found;
  }
  // Fallback to built-in
  const builtin = getBuiltinPack(packId);
  if (builtin) return builtin;
  // Unknown pack — assume packs/{id} structure
  return {
    id: packId,
    label: packId,
    description: '',
    is_public: false,
    is_active: true,
    json_base_url: `${JSON_CDN_BASE}/packs/${packId}`,
    audio_round2_start: 1,
    audio_round2_end: 81,
    audio_round3_start: 1,
    audio_round5_start: 1,
  };
};

export const normalizePackId = (value: unknown): PackId => {
  if (typeof value === 'string' && value.length > 0) return value;
  return 'classic';
};

export const getQuestionsBaseUrl = (packId: PackId): string => {
  const pack = resolvePackConfig(packId);
  return pack.json_base_url;
};

export const getRound2QuestionUrls = (packId: PackId): string[] => {
  const base = getQuestionsBaseUrl(packId);
  const classicBase = BUILTIN_PACKS[0].json_base_url;
  const urls: string[] = [];

  urls.push(`${base}/true_false_explanation_new.json`);
  urls.push(`${base}/true_false_explanation.json`);

  // Classic fallbacks
  if (base !== classicBase) {
    urls.push(`${classicBase}/true_false_explanation_new.json`);
    urls.push(`${classicBase}/true_false_explanation.json`);
  }

  return Array.from(new Set(urls));
};

const getAudioPrefix = (packId: PackId): string => {
  const pack = resolvePackConfig(packId);
  if (pack.id === 'classic') return '';
  return `packs/${pack.id}`;
};

export const withAudioPackPrefix = (packId: PackId, relativePath: string): string => {
  const cleaned = String(relativePath || '').replace(/^\/+/, '');
  const prefix = getAudioPrefix(packId);
  return prefix ? `${prefix}/${cleaned}` : cleaned;
};

const PACK_SCOPED_AUDIO_PREFIXES: readonly string[] = [
  'round1/questions/',
  'round2/true/',
  'round2/false/',
  'round2/explanation/',
  'round2/fictionExplanation/',
  'round3/questions3/',
  'round3/questions/',
  'round3/comments/',
  'round4/questions/',
  'round5/questions/',
  'round5/explanation/',
];

export const withAudioPackPrefixIfNeeded = (packId: PackId, relativePath: string): string => {
  const cleaned = String(relativePath || '')
    .replace(/^\/+/, '')
    .replace(/\\/g, '/');

  if (packId === 'classic') {
    return cleaned;
  }

  const needsPackPrefix = PACK_SCOPED_AUDIO_PREFIXES.some((prefix) => cleaned.startsWith(prefix));
  return needsPackPrefix ? withAudioPackPrefix(packId, cleaned) : cleaned;
};
