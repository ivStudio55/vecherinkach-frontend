import { logEvent } from './logger';
import type { RoomStatus } from './roomTypes';

export type RoundState = 'idle' | 'answering' | 'waiting_results' | 'showing_results' | 'transitioning';

export type ServerUpdateEvent = {
  type: 'SERVER_UPDATE';
  status: RoomStatus;
  allAnswered: boolean;
  startedAt: string | null;
  transitioningToNext?: boolean;
};

export type RoundEvent =
  | { type: 'LOCAL_ANSWER' }
  | ServerUpdateEvent
  | { type: 'TIMEOUT' }
  | { type: 'ALL_ANSWERED' }
  | { type: 'NEXT_QUESTION' };

export type UiRoundPhase = 'loading' | 'waiting' | 'question' | 'transition' | 'calculating' | 'results';

const ROUND_STATE_CONFIG: Record<RoundState, { uiPhase: UiRoundPhase }> = {
  idle: { uiPhase: 'waiting' },
  answering: { uiPhase: 'question' },
  waiting_results: { uiPhase: 'calculating' },
  showing_results: { uiPhase: 'results' },
  transitioning: { uiPhase: 'transition' },
};

const TERMINAL_STATUSES: ReadonlySet<RoomStatus> = new Set(['finished', 'final-results', 'round5-explanation']);

const deriveStateFromServer = (event: ServerUpdateEvent): RoundState => {
  if (event.status === 'waiting') {
    return 'idle';
  }
  if (TERMINAL_STATUSES.has(event.status)) {
    return 'showing_results';
  }
  if (event.transitioningToNext) {
    return 'transitioning';
  }
  if (event.allAnswered) {
    return 'waiting_results';
  }
  if (!event.startedAt) {
    return 'transitioning';
  }
  return 'answering';
};

const transition = (state: RoundState, event: RoundEvent): RoundState => {
  switch (event.type) {
    case 'LOCAL_ANSWER':
    case 'TIMEOUT':
    case 'ALL_ANSWERED':
      return state === 'answering' ? 'waiting_results' : state;
    case 'NEXT_QUESTION':
      return state === 'transitioning' ? state : 'transitioning';
    case 'SERVER_UPDATE':
      return deriveStateFromServer(event);
    default:
      return state;
  }
};

export const roundStateReducer = (state: RoundState, event: RoundEvent): RoundState => {
  const nextState = transition(state, event);
  if (nextState === state) {
    return state;
  }

  logEvent('info', 'state-machine', 'Round state transition', {
    from: state,
    to: nextState,
    event,
  });

  return nextState;
};

export const mapRoundStateToUiPhase = (state: RoundState): UiRoundPhase => ROUND_STATE_CONFIG[state]?.uiPhase ?? 'waiting';
