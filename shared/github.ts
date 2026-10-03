import type { Repo } from './types';

/** Raw GitHub REST repo → the small shape the site actually uses. */
export function trimRepo(r: any): Repo {
  return {
    name: r.name,
    fullName: r.full_name,
    description: r.description ?? null,
    url: r.html_url,
    homepage: r.homepage || null,
    language: r.language ?? null,
    stars: r.stargazers_count ?? 0,
    forks: r.forks_count ?? 0,
    fork: !!r.fork,
    archived: !!r.archived,
    topics: Array.isArray(r.topics) ? r.topics : [],
    pushedAt: r.pushed_at,
    createdAt: r.created_at,
  };
}

export function reposUrl(user: string): string {
  return `https://api.github.com/users/${encodeURIComponent(user)}/repos?per_page=100&sort=pushed&type=owner`;
}
