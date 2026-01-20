export const ROUND2_LIKE_OFFSET = 200000;
export const ROUND3_LIKE_OFFSET = 300000;
export const ROUND4_LIKE_OFFSET = 400000;
export const ROUND5_LIKE_OFFSET = 500000;

export type LikeQuestionMeta = {
  round: 1 | 2 | 3 | 4 | 5;
  index: number;
  variant?: 'fact' | 'fiction';
};

export const buildRound2LikeId = (index: number, showingFact: boolean) =>
  ROUND2_LIKE_OFFSET + index * 2 + (showingFact ? 0 : 1);

export const buildRound3LikeId = (index: number) => ROUND3_LIKE_OFFSET + index;

export const buildRound4LikeId = (puzzleId: number) => ROUND4_LIKE_OFFSET + puzzleId;

export const buildRound5LikeId = (index: number) => ROUND5_LIKE_OFFSET + index;

export const parseLikeQuestionId = (questionId: number): LikeQuestionMeta => {
  if (questionId >= ROUND5_LIKE_OFFSET) {
    return { round: 5, index: questionId - ROUND5_LIKE_OFFSET };
  }
  if (questionId >= ROUND4_LIKE_OFFSET) {
    return { round: 4, index: questionId - ROUND4_LIKE_OFFSET };
  }
  if (questionId >= ROUND3_LIKE_OFFSET) {
    return { round: 3, index: questionId - ROUND3_LIKE_OFFSET };
  }
  if (questionId >= ROUND2_LIKE_OFFSET) {
    const raw = questionId - ROUND2_LIKE_OFFSET;
    return { round: 2, index: Math.floor(raw / 2), variant: raw % 2 === 0 ? 'fact' : 'fiction' };
  }
  return { round: 1, index: questionId };
};

export const describeLikeQuestionId = (questionId: number) => {
  const meta = parseLikeQuestionId(questionId);
  switch (meta.round) {
    case 1:
      return `Раунд 1 · Вопрос #${meta.index}`;
    case 2:
      return `Раунд 2 · ${meta.variant === 'fiction' ? 'Вымысел' : 'Правда'} #${meta.index + 1}`;
    case 3:
      return `Раунд 3 · Вопрос #${meta.index + 1}`;
    case 4:
      return `Раунд 4 · Пазл #${meta.index}`;
    case 5:
      return `Раунд 5 · Вопрос #${meta.index + 1}`;
    default:
      return `Вопрос #${questionId}`;
  }
};
