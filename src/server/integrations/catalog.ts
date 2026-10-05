import "server-only";
import { githubMode } from "./github";

export type ProviderInfo = {
  id: "github" | "discord" | "slack" | "google_drive";
  name: string;
  description: string;
  status: "available" | "mock" | "coming_soon" | "unavailable";
  capabilities: string[];
  note?: string;
};

export function providerCatalog(): ProviderInfo[] {
  const gh = githubMode();
  return [
    {
      id: "github",
      name: "GitHub",
      description: "Link a repository to a project, import commits and connect them to issues, requirements and tests via references like ISS-012.",
      status: gh === "live" ? "available" : gh === "mock" ? "mock" : "unavailable",
      capabilities: ["Import repository", "Commit history", "Commit ↔ issue linking", "Push webhooks"],
      note: gh === "mock" ? "GITHUB_CLIENT_ID is not set — using the local mock adapter." : gh === "unavailable" ? "Set GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET to enable." : undefined,
    },
    {
      id: "discord",
      name: "Discord",
      description: "Post project activity — failed tests, releases, engineering changes — to a channel through a Discord webhook.",
      status: "available",
      capabilities: ["Channel notifications", "Event filters"],
    },
    {
      id: "slack",
      name: "Slack",
      description: "Send project events to a Slack channel using an incoming webhook.",
      status: "available",
      capabilities: ["Channel notifications", "Event filters"],
    },
    {
      id: "google_drive",
      name: "Google Drive",
      description: "Import drawings and documents from shared drives into the project file system with version history.",
      status: "coming_soon",
      capabilities: ["Import files", "Watch folders"],
      note: "The adapter interface exists (server/integrations/drive.ts); Drive OAuth scopes are not yet requested.",
    },
  ];
}

export const DEFAULT_CHANNEL_EVENTS = [
  "test.failed",
  "test.passed",
  "release.published",
  "change.created",
  "change.implemented",
  "decision.accepted",
  "issue.created",
  "milestone.completed",
  "snapshot.created",
];
