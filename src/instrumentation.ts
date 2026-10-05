/**
 * Runs once per server instance. Register an external error reporter here
 * (e.g. Sentry) when ERROR_TRACKING_DSN is set — call sites use
 * captureError() and never need to change.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const dsn = process.env.ERROR_TRACKING_DSN;
  if (!dsn) return;
  const { setErrorReporter } = await import("@/server/observability/error-tracker");
  const { logger } = await import("@/server/observability/logger");
  // Placeholder transport: wire @sentry/nextjs here. Until then, errors are tagged for log-based alerting.
  setErrorReporter({
    capture(error, context) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(err.message, { name: err.name, stack: err.stack, tracked: true, ...context });
    },
  });
}
