import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { oauthAccounts } from "@/server/db/schema";
import { decrypt } from "@/server/crypto";
import { env, oauthEnabled } from "@/server/env";
import { BadRequest } from "@/server/http/errors";

export type GhRepo = { fullName: string; private: boolean; description: string | null; defaultBranch: string; pushedAt: string | null; url: string };
export type GhCommit = { sha: string; message: string; authorName: string | null; authorLogin: string | null; url: string; committedAt: string };

/** GitHub adapter. Real implementation uses the user's OAuth token; the mock is for local dev only. */
export interface GitHubClient {
  readonly mock: boolean;
  listRepos(): Promise<GhRepo[]>;
  getRepo(fullName: string): Promise<GhRepo>;
  listCommits(fullName: string, opts?: { since?: string; perPage?: number; branch?: string }): Promise<GhCommit[]>;
}

class RestGitHubClient implements GitHubClient {
  readonly mock = false;
  constructor(private token: string) {}
  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`https://api.github.com${path}`, {
      headers: { Authorization: `Bearer ${this.token}`, Accept: "application/vnd.github+json", "User-Agent": "Forgebase", "X-GitHub-Api-Version": "2022-11-28" },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) throw BadRequest("Repository not found or not accessible with your GitHub account");
    if (res.status === 401) throw BadRequest("GitHub authorization expired — reconnect GitHub in Settings → Connections");
    if (!res.ok) throw BadRequest(`GitHub API error (${res.status})`);
    return (await res.json()) as T;
  }
  private mapRepo(r: { full_name: string; private: boolean; description: string | null; default_branch: string; pushed_at: string | null; html_url: string }): GhRepo {
    return { fullName: r.full_name, private: r.private, description: r.description, defaultBranch: r.default_branch, pushedAt: r.pushed_at, url: r.html_url };
  }
  async listRepos() {
    const rows = await this.get<Parameters<RestGitHubClient["mapRepo"]>[0][]>("/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member");
    return rows.map((r) => this.mapRepo(r));
  }
  async getRepo(fullName: string) {
    return this.mapRepo(await this.get(`/repos/${fullName}`));
  }
  async listCommits(fullName: string, opts: { since?: string; perPage?: number; branch?: string } = {}) {
    const q = new URLSearchParams({ per_page: String(opts.perPage ?? 50) });
    if (opts.since) q.set("since", opts.since);
    if (opts.branch) q.set("sha", opts.branch);
    const rows = await this.get<{ sha: string; html_url: string; commit: { message: string; author: { name: string; date: string } | null }; author: { login: string } | null }[]>(
      `/repos/${fullName}/commits?${q}`,
    );
    return rows.map((c) => ({
      sha: c.sha,
      message: c.commit.message,
      authorName: c.commit.author?.name ?? null,
      authorLogin: c.author?.login ?? null,
      url: c.html_url,
      committedAt: c.commit.author?.date ?? new Date().toISOString(),
    }));
  }
}

/**
 * Deterministic local adapter used when GitHub OAuth credentials are not
 * configured in development. Every response is flagged `mock: true` and the UI
 * labels it — it is never used in production.
 */
class MockGitHubClient implements GitHubClient {
  readonly mock = true;
  async listRepos(): Promise<GhRepo[]> {
    return [
      { fullName: "forge-robotics/cargo-rover-firmware", private: true, description: "STM32 firmware for the cargo rover (mock)", defaultBranch: "main", pushedAt: new Date().toISOString(), url: "https://github.com/forge-robotics/cargo-rover-firmware" },
      { fullName: "forge-robotics/rover-sim", private: false, description: "Gazebo simulation (mock)", defaultBranch: "main", pushedAt: new Date().toISOString(), url: "https://github.com/forge-robotics/rover-sim" },
    ];
  }
  async getRepo(fullName: string) {
    return (await this.listRepos()).find((r) => r.fullName === fullName) ?? { fullName, private: true, description: "(mock repository)", defaultBranch: "main", pushedAt: null, url: `https://github.com/${fullName}` };
  }
  async listCommits(fullName: string): Promise<GhCommit[]> {
    const msgs = [
      "drive: clamp wheel current to 18A (fixes ISS-007)",
      "imu: switch to 400Hz sample rate for TEST-004",
      "arm: add soft limits for shoulder joint",
      "ci: run hardware-in-loop smoke test",
    ];
    return msgs.map((m, i) => {
      const sha = Buffer.from(`${fullName}:${i}`).toString("hex").padEnd(40, "0").slice(0, 40);
      return { sha, message: m, authorName: "Mock Author", authorLogin: "mock", url: `https://github.com/${fullName}/commit/${sha}`, committedAt: new Date(Date.now() - i * 86400_000).toISOString() };
    });
  }
}

export function githubMode(): "live" | "mock" | "unavailable" {
  if (oauthEnabled().github) return "live";
  return env().NODE_ENV === "production" ? "unavailable" : "mock";
}

export async function githubClientFor(userId: string): Promise<GitHubClient> {
  const mode = githubMode();
  if (mode === "mock") return new MockGitHubClient();
  if (mode === "unavailable") throw BadRequest("GitHub integration is not configured on this server");
  const [acct] = await db.select().from(oauthAccounts).where(and(eq(oauthAccounts.userId, userId), eq(oauthAccounts.provider, "github")));
  if (!acct?.accessTokenEnc) throw BadRequest("Connect your GitHub account in Settings → Connections first");
  return new RestGitHubClient(decrypt(acct.accessTokenEnc));
}
