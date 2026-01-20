export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogChannel = 'realtime' | 'rpc' | 'state-machine' | 'room-sync' | 'analytics';

export type LogEvent = {
  level: LogLevel;
  channel: LogChannel;
  message: string;
  timestamp: number;
  context?: Record<string, unknown>;
};

type LogSink = (event: LogEvent) => void;

const sinks = new Set<LogSink>();
const buffer: LogEvent[] = [];
const MAX_BUFFER = 200;

const shouldLogToConsole = (level: LogLevel) => {
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }
  return level !== 'debug';
};

const serializeError = (error: unknown) => {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { message: String(error) };
};

const pushToBuffer = (event: LogEvent) => {
  buffer.push(event);
  if (buffer.length > MAX_BUFFER) {
    buffer.splice(0, buffer.length - MAX_BUFFER);
  }
};

export const addLogSink = (sink: LogSink) => {
  sinks.add(sink);
  return () => sinks.delete(sink);
};

export const getLogBuffer = () => [...buffer];

export const logEvent = (level: LogLevel, channel: LogChannel, message: string, context?: Record<string, unknown>) => {
  const event: LogEvent = {
    level,
    channel,
    message,
    timestamp: Date.now(),
    context,
  };

  pushToBuffer(event);
  sinks.forEach((sink) => sink(event));

  if (!shouldLogToConsole(level)) {
    return;
  }

  const payload = context ? { ...context } : undefined;
  if (level === 'error') {
    console.error(`[${channel}] ${message}`, payload);
  } else if (level === 'warn') {
    console.warn(`[${channel}] ${message}`, payload);
  } else if (level === 'info') {
    console.info(`[${channel}] ${message}`, payload);
  } else {
    console.debug(`[${channel}] ${message}`, payload);
  }
};

export const logError = (channel: LogChannel, message: string, error: unknown, context?: Record<string, unknown>) => {
  logEvent('error', channel, message, {
    ...context,
    error: serializeError(error),
  });
};
