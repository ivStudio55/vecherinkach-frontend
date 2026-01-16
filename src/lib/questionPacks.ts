export const PACK_IDS = ['classic', '03012026'] as const;

export type PackId = (typeof PACK_IDS)[number];

export const DEFAULT_PACK_ID: PackId = 'classic';

export const QUESTION_PACKS: ReadonlyArray<{ id: PackId; label: string }> = [
  { id: 'classic', label: 'Классический' },
  { id: '03012026', label: 'Пакет от 16.01.2026' },
] as const;

export const normalizePackId = (value: unknown): PackId => {
  if (value === '03012026') {
    return '03012026';
  }
  return 'classic';
};

export const getQuestionsBaseUrl = (packId: PackId): string => {
  return packId === '03012026' ? '/packs/03012026/questions' : '/questions';
};

const getAudioPrefix = (packId: PackId): string => {
  return packId === '03012026' ? 'packs/03012026' : '';
};

export const withAudioPackPrefix = (packId: PackId, relativePath: string): string => {
  const cleaned = String(relativePath || '').replace(/^\/+/, '');
  const prefix = getAudioPrefix(packId);
  return prefix ? `${prefix}/${cleaned}` : cleaned;
};

const PACK_SCOPED_AUDIO_PREFIXES: readonly string[] = [
  'round1/',
  'round1/questions/',
  'round2/true/',
  'round2/false/',
  'round2/explanation/',
  'round2/fictionExplanation/',
  'round3/questions3/',
  'round3/questions/',
  'round3/comments/',
  'round4/questions/',
  'round4/category/',
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
