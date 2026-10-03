import { timingSafeEqual } from 'node:crypto';

export function json(body: unknown, init: { status?: number; cache?: string; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': init.cache ?? 'no-store',
      ...init.headers,
    },
  });
}

/** Edge-cache for `fresh` seconds, then serve stale while revalidating for `stale` seconds. */
export const edge = (fresh: number, stale: number) =>
  `public, max-age=0, s-maxage=${fresh}, stale-while-revalidate=${stale}`;

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
