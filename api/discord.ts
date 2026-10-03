import { SITE } from '../shared/config.js';
import type { DiscordProfile } from '../shared/types.js';
import { edge, json } from './_lib/http.js';

/**
 * Lanyard doesn't expose profile banners, so this asks dcdn.dstn.to (a public
 * Discord profile cache) for the banner / accent colour and caches the answer.
 * Entirely optional: the client keeps its own banner art if this fails.
 */
export async function GET(): Promise<Response> {
  const empty: DiscordProfile = { banner: null, accentColor: null, bio: null };
  try {
    const res = await fetch(`https://dcdn.dstn.to/profile/${SITE.discordId}`, {
      headers: { 'User-Agent': SITE.domain },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return json(empty, { cache: edge(600, 3600) });
    const data: any = await res.json();
    const user = data?.user ?? {};
    const profile = data?.user_profile ?? {};
    const hash: string | null = user.banner ?? profile.banner ?? null;
    const accent: number | null = profile.accent_color ?? user.accent_color ?? user.banner_color ?? null;
    const body: DiscordProfile = {
      banner: hash
        ? `https://cdn.discordapp.com/banners/${SITE.discordId}/${hash}.${hash.startsWith('a_') ? 'gif' : 'webp'}?size=640`
        : null,
      accentColor: typeof accent === 'number' ? `#${accent.toString(16).padStart(6, '0')}` : typeof accent === 'string' ? accent : null,
      bio: profile.bio ?? user.bio ?? null,
    };
    return json(body, { cache: edge(3600, 86400) });
  } catch {
    return json(empty, { cache: edge(120, 600) });
  }
}
