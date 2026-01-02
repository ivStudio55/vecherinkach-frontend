import round1 from '../../public/questions/round1.json';

export const ROUND_QUESTION_COUNT = 6;

export const OPTION_KEYS = ['a', 'b', 'c', 'd'] as const;

export type OptionKey = (typeof OPTION_KEYS)[number];

export const OPTION_LABELS: Record<OptionKey, string> = {
  a: 'А',
  b: 'Б',
  c: 'В',
  d: 'Г',
};

type RawRoundQuestion = {
  id: number;
  text: string;
  options: string[];
  correct: number;
  points: number;
  audio?: string;
};

export interface RoundQuestion {
  id: number;
  text: string;
  options: string[];
  correctIndex: number;
  points: number;
  audio?: string;
}

export interface ActiveRoundQuestion extends RoundQuestion {
  order: number;
}

const rawQuestions: RawRoundQuestion[] = (round1.questions || []) as RawRoundQuestion[];

const QUESTIONS: RoundQuestion[] = rawQuestions.map((question) => ({
  id: question.id,
  text: question.text,
  options: question.options,
  correctIndex: typeof question.correct === 'number' ? question.correct : 0,
  points: question.points,
  audio: question.audio,
}));

const QUESTION_MAP = new Map<number, RoundQuestion>(QUESTIONS.map((q) => [q.id, q]));

const ALL_QUESTION_IDS = QUESTIONS.map((q) => q.id);

export const hasEnoughQuestions = (count: number) => QUESTIONS.length >= count;

export const pickRandomQuestionIds = (count = ROUND_QUESTION_COUNT) => {
  if (!hasEnoughQuestions(count)) {
    throw new Error('Недостаточно вопросов для генерации раунда');
  }

  const ids = [...ALL_QUESTION_IDS];
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, count);
};

export const getQuestionById = (id: number): RoundQuestion | null => QUESTION_MAP.get(id) ?? null;

export const getQuestionForIndex = (
  selectedIds: number[],
  questionIndex: number
): ActiveRoundQuestion | null => {
  if (!selectedIds.length) {
    return null;
  }
  const questionId = selectedIds[questionIndex];
  if (!questionId && questionId !== 0) {
    return null;
  }
  const question = getQuestionById(questionId);
  if (!question) {
    return null;
  }
  return {
    ...question,
    order: questionIndex + 1,
  };
};

export const buildQuestionsFromSelection = (selectedIds: number[]): ActiveRoundQuestion[] =>
  selectedIds
    .map((_, index) => getQuestionForIndex(selectedIds, index))
    .filter((question): question is ActiveRoundQuestion => Boolean(question));

export const getOptionKeyByIndex = (index: number): OptionKey => OPTION_KEYS[index] ?? OPTION_KEYS[0];

export const getOptionIndexFromKey = (key: string): number => {
  const idx = OPTION_KEYS.indexOf(key as OptionKey);
  return idx >= 0 ? idx : 0;
};

export const getRoundTitle = () => round1.name;
export const getRoundDescription = () => round1.description;
