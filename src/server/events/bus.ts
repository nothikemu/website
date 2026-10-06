import "server-only";
import { captureError } from "@/server/observability/error-tracker";
import { logger } from "@/server/observability/logger";
import type { DomainEvent, Subscriber } from "./types";

/**
 * In-process event bus. `emit` awaits all subscribers (important on serverless,
 * where work after the response may be frozen) but isolates their failures so a
 * broken integration can never fail a user's request.
 *
 * To move to a durable queue (Inngest, QStash, SQS) replace `emit` with an
 * enqueue call and run `dispatch` from a worker — subscribers do not change.
 */
const subscribers: Subscriber[] = [];

export function subscribe(sub: Subscriber) {
  if (!subscribers.some((s) => s.name === sub.name)) subscribers.push(sub);
}

export async function dispatch(event: DomainEvent) {
  for (const sub of subscribers) {
    try {
      await sub.handle(event);
    } catch (err) {
      captureError(err, { subscriber: sub.name, event: event.type });
    }
  }
}

export async function emit(event: DomainEvent) {
  logger.debug("event", { type: event.type, target: event.target?.label });
  await dispatch(event);
}
