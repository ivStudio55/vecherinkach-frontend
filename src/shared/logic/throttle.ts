type Throttled<T extends (...args: any[]) => void> = ((...args: Parameters<T>) => void) & {
  cancel: () => void;
};

export const throttle = <T extends (...args: any[]) => void>(fn: T, waitMs: number): Throttled<T> => {
  let lastCall = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;

  const invoke = () => {
    lastCall = Date.now();
    timeoutId = null;
    if (lastArgs) {
      fn(...lastArgs);
      lastArgs = null;
    }
  };

  const throttled = ((...args: Parameters<T>) => {
    lastArgs = args;
    const now = Date.now();
    const remaining = waitMs - (now - lastCall);

    if (remaining <= 0 || remaining > waitMs) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      invoke();
      return;
    }

    if (!timeoutId) {
      timeoutId = setTimeout(invoke, remaining);
    }
  }) as Throttled<T>;

  throttled.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    lastArgs = null;
  };

  return throttled;
};
