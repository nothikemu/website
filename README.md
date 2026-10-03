# hkmu.me

hikemu's corner of the internet. *computers used to feel like magic.*

A one-page personal profile: live Discord presence, what I'm listening to, recent streams, the stuff I build,
and Sakamoto-san (fan art) keeping an eye on the music. Set entirely in JetBrains Mono Nerd Font.

## Stack

Vite + vanilla TypeScript (no framework), self-hosted JetBrains Mono Nerd Font (subset, ~40 KB per weight, OFL), and a few
Vercel functions in `/api` for anything that needs a secret.

```
index.html          page markup (static, paints before any JS runs)
src/main.ts         boot: cat, pointer effects, views
src/views/*         presence, music, socials, projects
src/assets/         sakamoto.svg
public/fonts/       JetBrains Mono Nerd Font (subset woff2 + OFL)
src/lib/*           lanyard socket, tiny store, 1s ticker, dom helpers
src/styles/main.css everything visual
shared/*            config + types shared by browser and api
api/*               Vercel functions (Web-standard GET handlers)
```

| Data | Source | Notes |
| --- | --- | --- |
| Discord presence, activities, custom status | [Lanyard](https://github.com/Phineas/lanyard) WebSocket, REST fallback | realtime, reconnects with backoff |
| Now playing | Lanyard (Spotify via Discord), else `/api/spotify` | progress bar is a pure CSS animation |
| Recent streams | `/api/spotify` (Spotify Web API) + tracks seen live via Lanyard | merged, deduped, and kept in localStorage so a refresh never empties the list |
| Repos | `/api/github` (cached 15 min), falls back to api.github.com | forks hidden |
| Discord banner | `/api/discord` (dcdn.dstn.to) | optional; the dusk banner art stays otherwise |
| Steam | `/api/steam` | optional, needs `STEAM_API_KEY`; shown in the Steam icon's tooltip |

Settings that aren't secrets (Discord ID, handles, timezone for the clock) live in `shared/config.ts`.

## Develop

```bash
npm install
cp .env.example .env   # optional, only for Spotify/Steam
npm run dev            # http://127.0.0.1:5173, /api routes work locally too
npm run build
```

## Deploy (Vercel)

1. Import this repo in Vercel. Framework preset: Vite (also set in `vercel.json`).
2. Add the env vars from `.env.example` you want (all optional, all server-side only).
3. Point `hkmu.me` at the project under Settings → Domains.

### Lanyard

Presence only works if the Discord account is in the [Lanyard Discord server](https://discord.gg/lanyard).
Until then the site shows an offline/"presence unavailable" state, and nothing breaks.

### Spotify (one-time)

1. Create an app at <https://developer.spotify.com/dashboard>. Add redirect URIs
   `https://hkmu.me/api/spotify/callback` (and `http://127.0.0.1:5173/api/spotify/callback` for local dev).
2. Set `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, and a long random `SPOTIFY_SETUP_KEY`. Deploy.
3. Visit `https://hkmu.me/api/spotify/login?key=<SPOTIFY_SETUP_KEY>` and approve
   (scopes: `user-read-currently-playing`, `user-read-playback-state`, `user-read-recently-played`).
4. Copy the refresh token it shows you into `SPOTIFY_REFRESH_TOKEN`, then redeploy.

Access tokens are minted from the refresh token on the server and refreshed automatically. The client secret
and tokens never reach the browser. Without a refresh token, the site says history isn't hooked up yet and
still shows live tracks from Discord.
