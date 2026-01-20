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

const getPlayerPoints = async (playerId: string) => {
  const { data, error } = await supabase
    .from('players')
    .select('total_points')
    .eq('id', playerId)
    .maybeSingle();

  if (error) {
    if (error.code === '42703') {
      return { totalPoints: null as number | null, error: null };
    }
    return { totalPoints: null as number | null, error };
  }

  return { totalPoints: data?.total_points ?? null, error: null };
};

const submitRound1AnswerFallback = async (
  payload: SubmitAnswerPayload
): Promise<{ data: SubmitAnswerResult | null; error: unknown | null }> => {
  try {
    const { data: existing, error: existingError } = await supabase
      .from('answers')
      .select('id')
      .eq('room_id', payload.roomId)
      .eq('player_id', payload.playerId)
      .eq('question_index', payload.questionIndex)
      .maybeSingle();

    if (existingError) {
      return { data: null, error: existingError };
    }

    if (existing?.id) {
      const { totalPoints, error } = await getPlayerPoints(payload.playerId);
      if (error) {
        return { data: null, error };
      }
      return {
        data: {
          player_id: payload.playerId,
          total_points: totalPoints,
          was_duplicate: true,
        },
        error: null,
      };
    }

    const { error: insertError } = await supabase.from('answers').insert({
      room_id: payload.roomId,
      player_id: payload.playerId,
      question_index: payload.questionIndex,
      text: payload.answer,
      is_correct: payload.isCorrect,
      points_earned: payload.points,
    });

    if (insertError) {
      if (insertError.code === '23505') {
        const { totalPoints, error } = await getPlayerPoints(payload.playerId);
        if (error) {
          return { data: null, error };
        }
        return {
          data: {
            player_id: payload.playerId,
            total_points: totalPoints,
            was_duplicate: true,
          },
          error: null,
        };
      }
      return { data: null, error: insertError };
    }

    const { totalPoints, error: pointsError } = await getPlayerPoints(payload.playerId);
    if (pointsError) {
      return { data: null, error: pointsError };
    }

    let updatedPoints: number | null = totalPoints;
    if (payload.isCorrect && totalPoints !== null) {
      const nextPoints = totalPoints + payload.points;
      const { error: updateError } = await supabase
        .from('players')
        .update({ total_points: nextPoints })
        .eq('id', payload.playerId);

      if (updateError) {
        return { data: null, error: updateError };
      }
      updatedPoints = nextPoints;
    }

    return {
      data: {
        player_id: payload.playerId,
        total_points: updatedPoints,
        was_duplicate: false,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: err };
  }
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
      logError('rpc', 'submit_answer failed, falling back to direct writes', error, {
        roomId: payload.roomId,
        playerId: payload.playerId,
      });
      const fallback = await submitRound1AnswerFallback(payload);
      if (!fallback.error) {
        logEvent('info', 'rpc', 'submit_answer fallback ok', {
          roomId: payload.roomId,
          playerId: payload.playerId,
          wasDuplicate: fallback.data?.was_duplicate,
        });
      }
      return fallback;
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
    logError('rpc', 'submit_answer exception, falling back to direct writes', err, {
      roomId: payload.roomId,
      playerId: payload.playerId,
    });
    const fallback = await submitRound1AnswerFallback(payload);
    if (!fallback.error) {
      logEvent('info', 'rpc', 'submit_answer fallback ok', {
        roomId: payload.roomId,
        playerId: payload.playerId,
        wasDuplicate: fallback.data?.was_duplicate,
      });
    }
    return fallback;
  }
};
