import { ErrorCode, ParkhiError } from "./error.ts";

export enum LogLevel {
  Debug,
  Info,
  Warn,
  Error,
}

export type LogFunction = (component: string, message: string) => void;

let debug: LogFunction = () => {};
let info: LogFunction = () => {};
let warn: LogFunction = () => {};
let error: LogFunction = () => {};

export function setLogFunction(level: LogLevel, logFunction: LogFunction) {
  if (level == LogLevel.Debug) debug = logFunction;
  else if (level == LogLevel.Info) info = logFunction;
  else if (level == LogLevel.Warn) warn = logFunction;
  else if (level == LogLevel.Error) error = logFunction;
  else throw new ParkhiError(ErrorCode.Internal, `unknown level ${level}`);
}

export type ComponentLogFunction = (message: string) => void;

export function useLogging(component: string): {
  debug: ComponentLogFunction;
  info: ComponentLogFunction;
  warn: ComponentLogFunction;
  error: ComponentLogFunction;
} {
  return {
    debug: (message) => debug(component, message),
    info: (message) => info(component, message),
    warn: (message) => warn(component, message),
    error: (message) => error(component, message),
  };
}
