import type { SpotifyResponse } from '../../shared/types.js';
import { edge, json } from '../_lib/http.js';
import { credentials, nowPlaying, recentlyPlayed, SpotifyAuthError, SpotifyRateLimitError } from '../_lib/spotify.js';

/** Now playing + listening history. Edge-cached for 30s so traffic never reaches Spotify directly. */
export async function GET(): Promise<Response> {
  if (!credentials().ready) {
    const body: SpotifyResponse = { configured: false, now: null, recent: [] };
    return json(body, { cache: edge(300, 3600) });
  }
  try {
    const [now, recent] = await Promise.all([nowPlaying(), recentlyPlayed()]);
    const body: SpotifyResponse = { configured: true, now, recent };
    return json(body, { cache: edge(30, 300) });
  } catch (err) {
    const error = err instanceof SpotifyAuthError ? 'reauth' : err instanceof SpotifyRateLimitError ? 'rate_limited' : 'upstream';
    if (error === 'reauth') console.error('[spotify] refresh token rejected, re-run /api/spotify/login', (err as Error).message);
    const body: SpotifyResponse = { configured: true, error, now: null, recent: [] };
    return json(body, { status: 503, cache: edge(30, 60) });
  }
}
