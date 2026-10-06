import type { entityType } from "@/server/db/schema";

export type EntityType = (typeof entityType.enumValues)[number];

/**
 * Domain event emitted by services after a successful mutation. Subscribers
 * (activity feed, notifications, outbound integrations, audit) react to it.
 */
export type DomainEvent = {
  type: string; // "issue.created", "file.uploaded", "test.failed", …
  actorId: string | null;
  organizationId: string;
  projectId?: string | null;
  projectSlug?: string | null;
  projectName?: string | null;
  target?: { type: EntityType; id: string; label?: string | null; title?: string | null; url?: string | null };
  /** Users that should be notified directly (assignees, mentions, owners…). */
  notify?: { userId: string; type: string; title: string; body?: string | null }[];
  /** Whether this event belongs in the human activity feed (default true). */
  activity?: boolean;
  data?: Record<string, unknown>;
};

export type Subscriber = { name: string; handle: (event: DomainEvent) => Promise<void> | void };
