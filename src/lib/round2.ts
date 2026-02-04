export type TrueFalseItem = {
  fact: string;
  fiction: string;
  explanation: string;
  fictionExplanation: string;
};

const toStringSafe = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export const normalizeTrueFalseItems = (value: unknown): TrueFalseItem[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const fact = toStringSafe((item as Record<string, unknown>).fact ?? (item as Record<string, unknown>).fact_text);
      const fiction = toStringSafe(
        (item as Record<string, unknown>).fiction ?? (item as Record<string, unknown>).fiction_text
      );
      const explanation = toStringSafe(
        (item as Record<string, unknown>).explanation ?? (item as Record<string, unknown>).fact_explanation
      );
      const fictionExplanation = toStringSafe(
        (item as Record<string, unknown>).fictionExplanation ?? (item as Record<string, unknown>).fiction_explanation
      );

      return { fact, fiction, explanation, fictionExplanation } satisfies TrueFalseItem;
    })
    .filter((item) => item.fact.length > 0 || item.fiction.length > 0);
};

export const ROUND2_POINTS = 200;

export const pickRandomIndex = (length: number): number => {
  return Math.floor(Math.random() * length);
};
