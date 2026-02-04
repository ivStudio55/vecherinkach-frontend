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

export const getRound2QuestionUrls = (packId: PackId): string[] => {
  const base = getQuestionsBaseUrl(packId);
  const urls: string[] = [];

  if (packId === '03012026') {
    urls.push(`${base}/true_false_explanation_new.json`);
    urls.push(`${base}/true_false_explanation.json`);
  } else {
    urls.push(`${base}/true_false_explanation.json`);
  }

  if (!urls.includes('/questions/true_false_explanation.json')) {
    urls.push('/questions/true_false_explanation.json');
  }

  return urls;
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
