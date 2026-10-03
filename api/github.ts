import { SITE } from '../shared/config.js';
import { reposUrl, trimRepo } from '../shared/github.js';
import { edge, json } from './_lib/http.js';

/**
 * Public repos for the Craft page. Proxied so the response can be edge-cached
 * (visitors never burn through GitHub's 60 req/h unauthenticated limit) and so
 * an optional GITHUB_TOKEN stays server-side.
 */
export async function GET(): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': SITE.domain,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  try {
    const res = await fetch(reposUrl(SITE.github), { headers });
    if (!res.ok) return json({ error: 'upstream', status: res.status }, { status: 502, cache: edge(60, 300) });
    const repos = ((await res.json()) as unknown[]).map(trimRepo);
    return json({ user: SITE.github, repos }, { cache: edge(900, 86400) });
  } catch {
    return json({ error: 'upstream' }, { status: 502, cache: 'no-store' });
  }
}
