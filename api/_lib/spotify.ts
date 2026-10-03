import type { NowPlaying, RecentTrack, Track } from '../../shared/types.js';

/**
 * Spotify Web API access for a single account (the site owner's).
 *
 * Auth model: Authorization Code flow, done once via /api/spotify/login.
 * The resulting refresh token lives in the SPOTIFY_REFRESH_TOKEN env var;
 * access tokens are minted from it on demand and cached per function instance.
 * The client secret never leaves the server.
 */

export const SCOPES = ['user-read-currently-playing', 'user-read-playback-state', 'user-read-recently-played'];

const ACCOUNTS = 'https://accounts.spotify.com';
const API = 'https://api.spotify.com/v1';

export class SpotifyAuthError extends Error {}
export class SpotifyRateLimitError extends Error {}

export function credentials() {
  const id = process.env.SPOTIFY_CLIENT_ID ?? '';
  const secret = process.env.SPOTIFY_CLIENT_SECRET ?? '';
  const refresh = process.env.SPOTIFY_REFRESH_TOKEN ?? '';
  return { id, secret, refresh, hasApp: !!(id && secret), ready: !!(id && secret && refresh) };
}

export function redirectUri(req: Request): string {
  return process.env.SPOTIFY_REDIRECT_URI || `${new URL(req.url).origin}/api/spotify/callback`;
}

const basic = (id: string, secret: string) => `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;

export async function tokenRequest(params: Record<string, string>) {
  const { id, secret } = credentials();
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: { Authorization: basic(id, secret), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(8000),
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 400 || res.status === 401) throw new SpotifyAuthError(body.error_description ?? body.error ?? 'auth failed');
    throw new Error(`spotify token endpoint ${res.status}`);
  }
  return body as { access_token: string; expires_in: number; refresh_token?: string };
}

let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(force = false): Promise<string> {
  if (!force && cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: credentials().refresh });
  cached = { token: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 };
  return cached.token;
}

/** GET against the Web API, refreshing the access token once on 401. */
async function get(path: string): Promise<Response> {
  const call = async (token: string) =>
    fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
  let res = await call(await accessToken());
  if (res.status === 401) {
    cached = null;
    res = await call(await accessToken(true));
  }
  if (res.status === 401 || res.status === 403) throw new SpotifyAuthError(`spotify ${res.status}`);
  if (res.status === 429) throw new SpotifyRateLimitError('rate limited');
  return res;
}

function trimTrack(t: any): Track {
  const images: { url: string; width: number }[] = (t.album?.images ?? []).slice().sort((a: any, b: any) => a.width - b.width);
  const big = images.find((i) => i.width >= 300) ?? images[images.length - 1];
  const small = images.find((i) => i.width >= 64) ?? big;
  return {
    id: t.id,
    title: t.name,
    artists: (t.artists ?? []).map((a: any) => a.name),
    album: t.album?.name ?? '',
    art: big?.url ?? null,
    artSmall: small?.url ?? null,
    url: t.external_urls?.spotify ?? `https://open.spotify.com/track/${t.id}`,
    durationMs: t.duration_ms ?? 0,
  };
}

export async function nowPlaying(): Promise<NowPlaying | null> {
  const res = await get('/me/player/currently-playing?additional_types=track');
  if (res.status === 204 || !res.ok) return null;
  const body: any = await res.json().catch(() => null);
  if (!body?.item || body.currently_playing_type !== 'track') return null;
  return { ...trimTrack(body.item), isPlaying: !!body.is_playing, progressMs: body.progress_ms ?? 0, sampledAt: Date.now() };
}

export async function recentlyPlayed(limit = 30): Promise<RecentTrack[]> {
  const res = await get(`/me/player/recently-played?limit=${limit}`);
  if (!res.ok) throw new Error(`recently-played ${res.status}`);
  const body: any = await res.json();
  return (body.items ?? []).filter((i: any) => i?.track?.id).map((i: any) => ({ ...trimTrack(i.track), playedAt: i.played_at }));
}
