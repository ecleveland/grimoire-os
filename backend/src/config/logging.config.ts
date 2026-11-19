import { ConsoleLogger, LogLevel } from '@nestjs/common';

type LoggingEnv = Partial<Record<'LOG_LEVEL' | 'LOG_FORMAT', string>>;

export type LogFormat = 'text' | 'json';

// Most severe first. A level enables itself and every level before it, and
// fatal is always on.
const LEVELS_BY_SEVERITY: LogLevel[] = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];
const SETTABLE_LEVELS: LogLevel[] = ['error', 'warn', 'log', 'debug', 'verbose'];

/**
 * The Nest log levels LOG_LEVEL enables. Unset means log, which prints request
 * lines and startup messages but not debug output. Compose passes an unset
 * host variable through as an empty string, so empty counts as unset.
 */
export function resolveLogLevels(env: LoggingEnv = process.env): LogLevel[] {
  const raw = env.LOG_LEVEL;
  const level = raw === undefined || raw === '' ? 'log' : raw;
  if (!SETTABLE_LEVELS.includes(level as LogLevel)) {
    throw new Error(`LOG_LEVEL must be ${SETTABLE_LEVELS.join(', ')} or unset, got "${raw}"`);
  }
  return LEVELS_BY_SEVERITY.slice(0, LEVELS_BY_SEVERITY.indexOf(level as LogLevel) + 1);
}

/** Whether log lines print as text or as one JSON object per line. Unset or empty means text. */
export function resolveLogFormat(env: LoggingEnv = process.env): LogFormat {
  const raw = env.LOG_FORMAT;
  if (raw === undefined || raw === '' || raw === 'text') return 'text';
  if (raw === 'json') return 'json';
  throw new Error(`LOG_FORMAT must be "text", "json" or unset, got "${raw}"`);
}

/**
 * The logger the app boots with. In JSON mode flattenParams puts the fields of
 * a structured log call at the top level of the line, beside level and message,
 * so a log collector can filter on them without parsing the message.
 */
export function createAppLogger(env: LoggingEnv = process.env): ConsoleLogger {
  const json = resolveLogFormat(env) === 'json';
  return new ConsoleLogger({ json, flattenParams: true, logLevels: resolveLogLevels(env) });
}
