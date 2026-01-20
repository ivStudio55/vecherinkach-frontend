export type RoundState = 'idle' | 'answering' | 'waiting_results' | 'showing_results' | 'transitioning';

export type RoundEvent =
  | { type: 'LOCAL_ANSWER' }
  | { type: 'SERVER_UPDATE'; status: string; allAnswered: boolean; startedAt: string | null; transitioningToNext?: boolean }
  | { type: 'TIMEOUT' }
  | { type: 'ALL_ANSWERED' }
  | { type: 'NEXT_QUESTION' };

export type UiRoundPhase = 'loading' | 'waiting' | 'question' | 'transition' | 'calculating' | 'results';

export const roundStateReducer = (state: RoundState, event: RoundEvent): RoundState => {
  switch (event.type) {
    case 'LOCAL_ANSWER':
      if (state === 'answering') {
        return 'waiting_results';
      }
      return state;
    case 'TIMEOUT':
      if (state === 'answering') {
        return 'waiting_results';
      }
      return state;
    case 'ALL_ANSWERED':
      if (state === 'answering') {
        return 'waiting_results';
      }
      return state;
    case 'NEXT_QUESTION':
      return 'transitioning';
    case 'SERVER_UPDATE': {
      const status = event.status;
      if (status === 'waiting') {
        return 'idle';
      }
      if (status === 'finished' || status === 'final-results') {
        return 'showing_results';
      }
      if (status === 'round5-explanation') {
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
    }
    default:
      return state;
  }
};

export const mapRoundStateToUiPhase = (state: RoundState): UiRoundPhase => {
  switch (state) {
    case 'idle':
      return 'waiting';
    case 'answering':
      return 'question';
    case 'waiting_results':
      return 'calculating';
    case 'showing_results':
      return 'results';
    case 'transitioning':
      return 'transition';
    default:
      return 'waiting';
  }
};
