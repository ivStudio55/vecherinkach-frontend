import { supabase } from '@/lib/supabase';
import { logError, logEvent } from './logger';

export type SubmitAnswerResult = {
  player_id: string;
  total_points: number | null;
  was_duplicate: boolean;
};

export type SubmitAnswerPayload = {
  roomId: string;
  playerId: string;
  questionIndex: number;
  answer: string;
  isCorrect: boolean;
  points: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeRpcResponse = (data: SubmitAnswerResult[] | SubmitAnswerResult | null) => {
  if (!data) {
    return null;
  }
  return Array.isArray(data) ? data[0] ?? null : data;
};

export const submitRound1Answer = async (
  payload: SubmitAnswerPayload,
  retries = 1
): Promise<{ data: SubmitAnswerResult | null; error: unknown | null }> => {
  try {
    const { data, error } = await supabase.rpc('submit_answer', {
      p_room_id: payload.roomId,
      p_player_id: payload.playerId,
      p_question_index: payload.questionIndex,
      p_answer: payload.answer,
      p_is_correct: payload.isCorrect,
      p_points: payload.points,
    });

    if (error) {
      if (retries > 0) {
        await sleep(300);
        return submitRound1Answer(payload, retries - 1);
      }
      logError('rpc', 'submit_answer failed', error, { roomId: payload.roomId, playerId: payload.playerId });
      return { data: null, error };
    }

    const normalized = normalizeRpcResponse(data as SubmitAnswerResult[] | SubmitAnswerResult | null);
    logEvent('info', 'rpc', 'submit_answer ok', {
      roomId: payload.roomId,
      playerId: payload.playerId,
      wasDuplicate: normalized?.was_duplicate,
    });

    return { data: normalized, error: null };
  } catch (err) {
    if (retries > 0) {
      await sleep(300);
      return submitRound1Answer(payload, retries - 1);
    }
    logError('rpc', 'submit_answer exception', err, { roomId: payload.roomId, playerId: payload.playerId });
    return { data: null, error: err };
  }
};
