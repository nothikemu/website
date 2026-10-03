import { SITE } from '../shared/config.js';
import type { SteamResponse } from '../shared/types.js';
import { edge, json } from './_lib/http.js';

/**
 * Steam presence + recently played games. Needs STEAM_API_KEY (free, from
 * steamcommunity.com/dev/apikey). STEAM_ID64 is optional; otherwise the
 * vanity name from config is resolved. Without a key the site just links to the profile.
 */
const API = 'https://api.steampowered.com';
let resolvedId: string | null = null;

async function call<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${API}${path}`);
  url.search = new URLSearchParams({ key: process.env.STEAM_API_KEY ?? '', format: 'json', ...params }).toString();
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`steam ${res.status}`);
  return (await res.json()) as T;
}

async function steamId(): Promise<string> {
  if (process.env.STEAM_ID64) return process.env.STEAM_ID64;
  if (resolvedId) return resolvedId;
  const r = await call<{ response: { success: number; steamid?: string } }>('/ISteamUser/ResolveVanityURL/v1/', {
    vanityurl: SITE.steamVanity,
  });
  if (r.response.success !== 1 || !r.response.steamid) throw new Error('vanity lookup failed');
  return (resolvedId = r.response.steamid);
}

export async function GET(): Promise<Response> {
  if (!process.env.STEAM_API_KEY) return json({ configured: false } satisfies SteamResponse, { cache: edge(3600, 86400) });
  try {
    const id = await steamId();
    const [summary, recent] = await Promise.all([
      call<{ response: { players: any[] } }>('/ISteamUser/GetPlayerSummaries/v2/', { steamids: id }),
      call<{ response: { games?: any[] } }>('/IPlayerService/GetRecentlyPlayedGames/v1/', { steamid: id, count: '5' }).catch(() => ({
        response: { games: [] },
      })),
    ]);
    const p = summary.response.players[0];
    const body: SteamResponse = {
      configured: true,
      profile: p
        ? {
            name: p.personaname,
            avatar: p.avatarfull ?? p.avatarmedium,
            url: p.profileurl,
            state: p.personastate ?? 0,
            game: p.gameextrainfo ?? null,
          }
        : undefined,
      recent: (recent.response.games ?? []).map((g) => ({
        appId: g.appid,
        name: g.name,
        minutes2w: g.playtime_2weeks ?? 0,
        minutesTotal: g.playtime_forever ?? 0,
        icon: g.img_icon_url
          ? `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
          : null,
      })),
    };
    return json(body, { cache: edge(120, 900) });
  } catch {
    return json({ configured: true, error: 'upstream' } satisfies SteamResponse, { status: 502, cache: edge(60, 300) });
  }
}
