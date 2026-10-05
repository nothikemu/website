import "server-only";
import { registerDefaultSubscribers } from "./subscribers";

registerDefaultSubscribers();

export { emit, subscribe } from "./bus";
export type { DomainEvent } from "./types";
