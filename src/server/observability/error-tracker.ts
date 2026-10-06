import "server-only";
import { currentContext } from "./context";
import { logger } from "./logger";

/**
 * Error tracking abstraction. The default reporter logs structured errors; a
 * Sentry (or compatible) reporter can be registered at boot without touching
 * call sites — see instrumentation.ts.
 */
export interface ErrorReporter {
  capture(error: unknown, context?: Record<string, unknown>): void;
}

class LogReporter implements ErrorReporter {
  capture(error: unknown, context?: Record<string, unknown>) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(err.message, { name: err.name, stack: err.stack, ...context });
  }
}

let reporter: ErrorReporter = new LogReporter();

export function setErrorReporter(r: ErrorReporter) {
  reporter = r;
}

export function captureError(error: unknown, context?: Record<string, unknown>) {
  try {
    reporter.capture(error, { requestId: currentContext()?.requestId, ...context });
  } catch {
    // never throw from the error path
  }
}
