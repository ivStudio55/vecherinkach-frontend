import { resolvePackConfig, type PackId } from './questionPacks';

export type TrueFalseItem = {
  fact: string;
  fiction: string;
  explanation: string;
  fictionExplanation: string;
  factId?: number;
  fictionId?: number;
};

type AudioBounds = { min: number; max: number; start: number };

export const getRound2AudioBounds = (packId: PackId): AudioBounds => {
  const cfg = resolvePackConfig(packId);
  return {
    min: cfg.audio_round2_start,
    max: cfg.audio_round2_end,
    start: cfg.audio_round2_start,
  };
};

export const resolveRound2AudioOrdinal = (
  item: TrueFalseItem | undefined,
  index: number,
  packId: PackId,
  isFact: boolean
): number => {
  const bounds = getRound2AudioBounds(packId);
  const candidateId = isFact ? item?.factId : item?.fictionId;
  const ordinal = typeof candidateId === 'number' && Number.isFinite(candidateId) ? candidateId : bounds.start + index;
  return Math.max(bounds.min, Math.min(bounds.max, ordinal));
};

export const filterTrueFalseItemsForPack = (items: TrueFalseItem[], packId: PackId): TrueFalseItem[] => {
  const bounds = getRound2AudioBounds(packId);

  const filtered = items.filter((item, idx) => {
    const factIdRaw = item.factId;
    const fictionIdRaw = item.fictionId;

    if (typeof factIdRaw === 'number' && (!Number.isFinite(factIdRaw) || factIdRaw < bounds.min || factIdRaw > bounds.max)) {
      return false;
    }
    if (
      typeof fictionIdRaw === 'number' &&
      (!Number.isFinite(fictionIdRaw) || fictionIdRaw < bounds.min || fictionIdRaw > bounds.max)
    ) {
      return false;
    }

    const factOrdinal = resolveRound2AudioOrdinal(item, idx, packId, true);
    const fictionOrdinal = resolveRound2AudioOrdinal(item, idx, packId, false);

    return factOrdinal >= bounds.min && factOrdinal <= bounds.max && fictionOrdinal >= bounds.min && fictionOrdinal <= bounds.max;
  });

  return filtered.length ? filtered : items;
};

const toStringSafe = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const toNumberSafe = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const normalizeTrueFalseItems = (value: unknown): TrueFalseItem[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  type PartialItem = TrueFalseItem & { order: number };
  const merged = new Map<number, PartialItem>();

  const ensureItem = (id: number, order: number): PartialItem => {
    const existing = merged.get(id);
    if (existing) {
      existing.order = Math.min(existing.order, order);
      return existing;
    }
    const fresh: PartialItem = { fact: '', fiction: '', explanation: '', fictionExplanation: '', order };
    merged.set(id, fresh);
    return fresh;
  };

  value.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      return;
    }

    const item = raw as Record<string, unknown>;
    const factId = toNumberSafe(item.fact_id ?? item.factId);
    const fictionId = toNumberSafe(item.fiction_id ?? item.fictionId);
    const genericId = toNumberSafe(item.id);
    const id = factId ?? fictionId ?? genericId ?? index;

    const fact = toStringSafe(item.fact ?? item.fact_text);
    const fiction = toStringSafe(item.fiction ?? item.fiction_text);
    const explanation = toStringSafe(item.explanation ?? item.fact_explanation);
    const fictionExplanation = toStringSafe(item.fictionExplanation ?? item.fiction_explanation);

    if (!fact && !fiction && !explanation && !fictionExplanation) {
      return;
    }

    const target = ensureItem(id, index);
    if (fact) target.fact = fact;
    if (fiction) target.fiction = fiction;
    if (explanation) target.explanation = explanation;
    if (fictionExplanation) target.fictionExplanation = fictionExplanation;
    if (Number.isFinite(factId ?? NaN)) {
      target.factId = factId ?? undefined;
    }
    if (Number.isFinite(fictionId ?? NaN)) {
      target.fictionId = fictionId ?? undefined;
    }
  });

  return Array.from(merged.values())
    .filter((item) => item.fact.length > 0 && item.fiction.length > 0)
    .sort((a, b) => a.order - b.order)
    .map(({ order, ...rest }) => rest);
};

export const ROUND2_POINTS = 200;

export const pickRandomIndex = (length: number): number => {
  return Math.floor(Math.random() * length);
};
