/**
 * Central logger.
 *
 * Keeps the last entries in memory (shown by debug tools), mirrors them to the
 * console, and forwards them to the Electron main process when the game runs
 * as a desktop application, where they are appended to a log file in the
 * user's data folder. Uncaught errors are captured by `installGlobalErrorHandlers`.
 */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

export class Logger {
  constructor({ capacity = 500, minLevel = 'debug', sink = null } = {}) {
    this.capacity = capacity;
    this.minLevel = LEVELS[minLevel];
    this.entries = [];
    this.sink = sink;
  }

  setSink(sink) {
    this.sink = sink;
  }

  log(level, scope, message, data) {
    if (LEVELS[level] < this.minLevel) return;
    const entry = { t: new Date().toISOString(), level, scope, message };
    if (data !== undefined) entry.data = safeSerialize(data);
    this.entries.push(entry);
    if (this.entries.length > this.capacity) this.entries.shift();
    const line = `[${entry.t}] ${level.toUpperCase()} ${scope}: ${message}`;
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    if (data !== undefined) fn(line, data);
    else fn(line);
    if (this.sink) {
      try {
        this.sink(entry);
      } catch {
        // A broken sink must never crash the game.
      }
    }
  }

  scope(name) {
    return {
      debug: (m, d) => this.log('debug', name, m, d),
      info: (m, d) => this.log('info', name, m, d),
      warn: (m, d) => this.log('warn', name, m, d),
      error: (m, d) => this.log('error', name, m, d),
    };
  }
}

function safeSerialize(data) {
  if (data instanceof Error) return { name: data.name, message: data.message, stack: data.stack };
  try {
    return JSON.parse(JSON.stringify(data));
  } catch {
    return String(data);
  }
}

export const logger = new Logger();

export function installGlobalErrorHandlers(target, log = logger) {
  const l = log.scope('global');
  target.addEventListener('error', (e) => l.error(e.message || 'Erreur non gérée', e.error ?? null));
  target.addEventListener('unhandledrejection', (e) => l.error('Promesse rejetée non gérée', e.reason ?? null));
}
