export const PACK_IDS = ['classic', '03012026'] as const;

export type PackId = (typeof PACK_IDS)[number];

export const DEFAULT_PACK_ID: PackId = 'classic';

export const QUESTION_PACKS: ReadonlyArray<{ id: PackId; label: string }> = [
  { id: 'classic', label: 'Классический' },
  { id: '03012026', label: 'Новогодний 2026' },
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
