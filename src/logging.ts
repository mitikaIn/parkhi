export enum Level {
  Debug,
  Info,
  Warn,
  Error,
}

export type Handler = (level: Level, component: string, message: string) => void;

let handler: Handler = () => {};

export function setHandler(newHandler: Handler) {
  handler = newHandler;
}

export type LogFn = (message: string) => void;

export interface Logger {
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
}

export function useLogger(component: string): Logger {
  return {
    debug: (message: string) => handler(Level.Debug, component, message),
    info: (message: string) => handler(Level.Info, component, message),
    warn: (message: string) => handler(Level.Warn, component, message),
    error: (message: string) => handler(Level.Error, component, message),
  };
}
