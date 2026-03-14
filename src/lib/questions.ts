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

export type Round1QuestionsPayload = {
  name?: string;
  description?: string;
  questions?: RawRoundQuestion[];
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

export type QuestionBank = {
  name: string;
  description: string;
  questions: RoundQuestion[];
  questionMap: Map<number, RoundQuestion>;
  allQuestionIds: number[];
};

const parseRound1Payload = (value: unknown): Round1QuestionsPayload => {
  if (!value || typeof value !== 'object') {
    return {};
  }
  return value as Round1QuestionsPayload;
};

export const createQuestionBank = (payload: unknown): QuestionBank => {
  const parsed = parseRound1Payload(payload);
  const name = typeof parsed.name === 'string' ? parsed.name : '';
  const description = typeof parsed.description === 'string' ? parsed.description : '';
  const raw = Array.isArray(parsed.questions) ? parsed.questions : [];

  const questions: RoundQuestion[] = raw
    .filter((q): q is RawRoundQuestion => Boolean(q && typeof q === 'object'))
    .map((question) => ({
      id: Number(question.id),
      text: String(question.text ?? ''),
      options: Array.isArray(question.options) ? question.options.map((opt) => String(opt)) : [],
      correctIndex: typeof question.correct === 'number' ? question.correct : 0,
      points: typeof question.points === 'number' ? question.points : 0,
      audio: typeof question.audio === 'string' ? question.audio : undefined,
    }))
    .filter((q) => Number.isFinite(q.id) && q.id >= 0);

  const questionMap = new Map<number, RoundQuestion>(questions.map((q) => [q.id, q]));
  const allQuestionIds = questions.map((q) => q.id);

  return {
    name,
    description,
    questions,
    questionMap,
    allQuestionIds,
  };
};

export const DEFAULT_QUESTION_BANK: QuestionBank = {
  name: '',
  description: '',
  questions: [],
  questionMap: new Map(),
  allQuestionIds: [],
};

export const hasEnoughQuestions = (count: number, bank: QuestionBank = DEFAULT_QUESTION_BANK) =>
  bank.questions.length >= count;

export const pickRandomQuestionIds = (count = ROUND_QUESTION_COUNT, bank: QuestionBank = DEFAULT_QUESTION_BANK) => {
  if (!hasEnoughQuestions(count, bank)) {
    throw new Error('Недостаточно вопросов для генерации раунда');
  }

  const ids = [...bank.allQuestionIds];
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, count);
};

export const getQuestionById = (id: number, bank: QuestionBank = DEFAULT_QUESTION_BANK): RoundQuestion | null =>
  bank.questionMap.get(id) ?? null;

export const getQuestionForIndex = (
  selectedIds: number[],
  questionIndex: number,
  bank: QuestionBank = DEFAULT_QUESTION_BANK
): ActiveRoundQuestion | null => {
  if (!selectedIds.length) {
    return null;
  }
  const questionId = selectedIds[questionIndex];
  if (!questionId && questionId !== 0) {
    return null;
  }
  const question = getQuestionById(questionId, bank);
  if (!question) {
    return null;
  }
  return {
    ...question,
    order: questionIndex + 1,
  };
};

export const buildQuestionsFromSelection = (
  selectedIds: number[],
  bank: QuestionBank = DEFAULT_QUESTION_BANK
): ActiveRoundQuestion[] =>
  selectedIds
    .map((_, index) => getQuestionForIndex(selectedIds, index, bank))
    .filter((question): question is ActiveRoundQuestion => Boolean(question));

export const getOptionKeyByIndex = (index: number): OptionKey => OPTION_KEYS[index] ?? OPTION_KEYS[0];

export const getOptionIndexFromKey = (key: string): number => {
  const idx = OPTION_KEYS.indexOf(key as OptionKey);
  return idx >= 0 ? idx : 0;
};

export const getRoundTitle = (bank: QuestionBank = DEFAULT_QUESTION_BANK) => bank.name;
export const getRoundDescription = (bank: QuestionBank = DEFAULT_QUESTION_BANK) => bank.description;
