import rawQuestionsSource from '../../app/public/questions/3round_questions.json';

export const ROUND3_TOTAL_QUESTIONS = 6;

export type RawRound3Question = {
  question: string;
  answer: string;
  category?: string;
  acceptable?: string[];
  comment?: string;
};

export interface Round3Question {
  id: number;
  text: string;
  answer: string;
  acceptable: string[];
  category?: string;
  comment?: string;
  audioFile: string;
  order: number;
}

const rawQuestions: RawRound3Question[] = (rawQuestionsSource.questions || []) as RawRound3Question[];

const normalizedQuestions: Round3Question[] = rawQuestions.map((item, index) => ({
  id: index + 1,
  text: item.question,
  answer: item.answer,
  acceptable: Array.isArray(item.acceptable) ? item.acceptable : [item.answer],
  category: item.category,
  comment: item.comment,
  audioFile: `round3/questions3/${index + 1}.mp3`,
  order: index + 1,
}));

const questionsMap = new Map<number, Round3Question>(normalizedQuestions.map((question) => [question.id, question]));

export const getRound3QuestionById = (id: number): Round3Question | null => questionsMap.get(id) ?? null;

export const hasEnoughRound3Questions = (count = ROUND3_TOTAL_QUESTIONS) => normalizedQuestions.length >= count;

export const pickRound3QuestionIds = (count = ROUND3_TOTAL_QUESTIONS): number[] => {
  if (!hasEnoughRound3Questions(count)) {
    throw new Error('Недостаточно вопросов для раунда 3');
  }

  const ids = normalizedQuestions.map((question) => question.id);
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, count);
};

export const buildRound3Questions = (selectedIds: number[]): Round3Question[] =>
  selectedIds
    .map((questionId, index) => {
      const baseQuestion = getRound3QuestionById(questionId);
      if (!baseQuestion) {
        return null;
      }
      return {
        ...baseQuestion,
        order: index + 1,
      };
    })
    .filter((question): question is Round3Question => Boolean(question));
