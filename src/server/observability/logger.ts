import "server-only";
import { currentContext } from "./context";

type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const lvl = (process.env.LOG_LEVEL as Level | undefined) ?? "info";
  return order[lvl] ?? 20;
}

/** Structured JSON logger. One line per event; request id attached automatically. */
function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (order[level] < threshold()) return;
  if (process.env.NODE_ENV === "test" && level !== "error") return;
  const ctx = currentContext();
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    requestId: ctx?.requestId,
    userId: ctx?.userId,
    ...fields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, f?: Record<string, unknown>) => write("debug", msg, f),
  info: (msg: string, f?: Record<string, unknown>) => write("info", msg, f),
  warn: (msg: string, f?: Record<string, unknown>) => write("warn", msg, f),
  error: (msg: string, f?: Record<string, unknown>) => write("error", msg, f),
};
