import { escapeHtml, readCookie, safeEqual } from '../_lib/http.js';
import { credentials, redirectUri, tokenRequest } from '../_lib/spotify.js';

const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0d111b;color:#e6e9ef;font:15px/1.6 ui-monospace,monospace}main{max-width:640px;padding:32px}h1{font-size:16px}code{display:block;word-break:break-all;background:#151b28;border:1px solid #ffffff14;border-radius:10px;padding:14px;margin:12px 0;user-select:all}p{color:#9aa3b2}</style>
<main>${body}</main>`,
    {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex',
        'Set-Cookie': 'sp_state=; Path=/api/spotify; HttpOnly; SameSite=Lax; Max-Age=0',
      },
    },
  );

/** Spotify redirects here after /api/spotify/login. Exchanges the code and shows the refresh token once. */
export async function GET(req: Request): Promise<Response> {
  if (!credentials().hasApp || !process.env.SPOTIFY_SETUP_KEY) return new Response('spotify setup is disabled.\n', { status: 404 });

  const url = new URL(req.url);
  const state = url.searchParams.get('state') ?? '';
  const expected = readCookie(req, 'sp_state') ?? '';
  if (!state || !expected || !safeEqual(state, expected)) {
    return page('nope', '<h1>state mismatch</h1><p>start again from /api/spotify/login?key=…</p>', 400);
  }
  const error = url.searchParams.get('error');
  if (error) return page('cancelled', `<h1>spotify said: ${escapeHtml(error)}</h1>`, 400);

  try {
    const token = await tokenRequest({
      grant_type: 'authorization_code',
      code: url.searchParams.get('code') ?? '',
      redirect_uri: redirectUri(req),
    });
    if (!token.refresh_token) return page('hm', '<h1>spotify returned no refresh token</h1>', 502);
    return page(
      'spotify connected',
      `<h1>✓ spotify connected</h1>
<p>set this as <b>SPOTIFY_REFRESH_TOKEN</b> in your vercel project's environment variables, then redeploy:</p>
<code>${escapeHtml(token.refresh_token)}</code>
<p>this page isn't stored anywhere. close it once you've copied the token.</p>`,
    );
  } catch (err) {
    return page('error', `<h1>token exchange failed</h1><p>${escapeHtml((err as Error).message)}</p>`, 502);
  }
}
