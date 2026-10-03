import { randomBytes } from 'node:crypto';
import { safeEqual } from '../_lib/http.js';
import { credentials, redirectUri, SCOPES } from '../_lib/spotify.js';

/**
 * One-time owner setup: /api/spotify/login?key=<SPOTIFY_SETUP_KEY>
 * Sends you to Spotify's consent screen. Without the key this route does nothing,
 * so random visitors can't start the flow.
 */
export async function GET(req: Request): Promise<Response> {
  const setupKey = process.env.SPOTIFY_SETUP_KEY ?? '';
  const { id, hasApp } = credentials();
  if (!hasApp || !setupKey) return new Response('spotify setup is disabled.\n', { status: 404 });

  const url = new URL(req.url);
  if (!safeEqual(url.searchParams.get('key') ?? '', setupKey)) return new Response('nope.\n', { status: 403 });

  const state = randomBytes(24).toString('hex');
  const authorize = new URL('https://accounts.spotify.com/authorize');
  authorize.search = new URLSearchParams({
    client_id: id,
    response_type: 'code',
    redirect_uri: redirectUri(req),
    scope: SCOPES.join(' '),
    state,
    show_dialog: 'true',
  }).toString();

  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      'Set-Cookie': `sp_state=${state}; Path=/api/spotify; HttpOnly; SameSite=Lax; Max-Age=600${secure}`,
      'Cache-Control': 'no-store',
    },
  });
}
