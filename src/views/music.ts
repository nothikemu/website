import type { RecentTrack, SpotifyResponse } from '../../shared/types';
import { $, getJSON, setText, swapImage } from '../lib/dom';
import type { LanyardPresence } from '../lib/lanyard';
import { getState, set, watch, type NowTrack } from '../lib/store';
import { tick } from '../lib/ticker';
import { duration } from '../lib/time';

/* ================================================================== */
/* listening history that survives a refresh                          */
/* ================================================================== */

/**
 * Two sources feed Recent Streams:
 *  - the Spotify API (authoritative, the same for every visitor)
 *  - songs seen live through Lanyard while the page is open
 * Both are merged, de-duplicated and kept in localStorage, so a refresh or a Spotify
 * hiccup never empties the list.
 */
const STORE_KEY = 'hkmu:streams:v1';
const MAX_PLAYS = 60;

interface Saved {
  plays: RecentTrack[];
  /** what was playing when this browser last had the page open */
  current: NowTrack | null;
}

const validPlay = (t: RecentTrack) => !!t && typeof t.title === 'string' && !Number.isNaN(Date.parse(t.playedAt));

function readSaved(): Saved {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Saved>;
      return { plays: Array.isArray(parsed.plays) ? parsed.plays.filter(validPlay) : [], current: parsed.current ?? null };
    }
  } catch {
    /* private mode, quota or malformed json: start fresh */
  }
  return { plays: [], current: null };
}

let saved = readSaved();
let persistTimer: number | undefined;
function persist() {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(saved));
    } catch {
      /* storage unavailable: history won't outlive the tab */
    }
  }, 200);
}

/** The same song within ~8 minutes, from either source, is one play. */
const playKey = (t: RecentTrack) => `${(t.id || t.title).toLowerCase()}:${Math.round(Date.parse(t.playedAt) / 480_000)}`;

function addPlays(incoming: RecentTrack[]) {
  const byKey = new Map(saved.plays.map((p) => [playKey(p), p]));
  for (const t of incoming) {
    if (!validPlay(t)) continue;
    const k = playKey(t);
    const prev = byKey.get(k);
    // API copies win (duration, small art, canonical url), but keep any art we already had
    byKey.set(k, prev ? { ...prev, ...t, art: t.art ?? prev.art, artSmall: t.artSmall ?? prev.artSmall } : t);
  }
  saved.plays = [...byKey.values()].sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt)).slice(0, MAX_PLAYS);
  persist();
  set('history', saved.plays);
}

const asPlay = (c: NowTrack, playedAt: number): RecentTrack => ({
  id: c.id ?? c.key,
  title: c.title,
  artists: c.artist.split(', '),
  album: c.album,
  art: c.art,
  artSmall: c.art,
  url: c.url ?? '',
  durationMs: c.durationMs,
  playedAt: new Date(playedAt).toISOString(),
});

/* ================================================================== */
/* data                                                               */
/* ================================================================== */

let inflight: Promise<void> | null = null;
let lastFetch = 0;

export function loadSpotify(force = false): Promise<void> {
  if (inflight) return inflight;
  if (!force && Date.now() - lastFetch < 20_000) return Promise.resolve();
  inflight = getJSON<SpotifyResponse>('/api/spotify')
    .then((data) => {
      if (typeof data?.configured !== 'boolean') throw new Error('unexpected response');
      if (data.recent?.length) addPlays(data.recent);
      set('spotify', { status: 'ok', data });
    })
    .catch(() => {
      if (getState().spotify.status !== 'ok') set('spotify', { status: 'error' });
    })
    .finally(() => {
      lastFetch = Date.now();
      inflight = null;
    });
  return inflight;
}

function fromLanyard(p: LanyardPresence | null): NowTrack | null {
  const s = p?.listening_to_spotify ? p.spotify : null;
  if (!s) return null;
  return {
    key: `${s.track_id ?? s.song}:${s.timestamps.start}`,
    id: s.track_id,
    title: s.song,
    artist: s.artist.replace(/; /g, ', '),
    album: s.album,
    art: s.album_art_url,
    url: s.track_id ? `https://open.spotify.com/track/${s.track_id}` : null,
    start: s.timestamps.start,
    durationMs: s.timestamps.end - s.timestamps.start,
    paused: false,
    pausedAt: 0,
    source: 'discord',
  };
}

function fromApi(data: SpotifyResponse | null): NowTrack | null {
  const n = data?.now;
  if (!n) return null;
  const start = n.sampledAt - n.progressMs;
  return {
    key: `${n.id}:${Math.round(start / 5000)}`,
    id: n.id,
    title: n.title,
    artist: n.artists.join(', '),
    album: n.album,
    art: n.art,
    url: n.url,
    start,
    durationMs: n.durationMs,
    paused: !n.isPlaying,
    pausedAt: n.progressMs,
    source: 'spotify',
  };
}

/* ================================================================== */
/* the Listening to Spotify panel                                     */
/* ================================================================== */

const panel = () => $('[data-now]')!;

function render(next: NowTrack | null, prev: NowTrack | null) {
  const el = panel();
  el.dataset.state = !next ? 'idle' : next.paused ? 'paused' : 'playing';

  const live = $('[data-now-live]', el)!;
  live.hidden = !next;
  setText($('[data-now-state]', el), next?.paused ? 'paused' : 'live');

  const img = $<HTMLImageElement>('[data-now-art]', el)!;
  const titleLink = $<HTMLAnchorElement>('[data-now-link]', el)!;
  const artLink = $<HTMLAnchorElement>('[data-now-art-link]', el)!;

  if (!next) {
    img.hidden = true;
    img.removeAttribute('src');
    delete img.dataset.src;
    el.style.removeProperty('--now-art');
    setText($('[data-now-title]', el), 'Not listening');
    setText($('[data-now-artist]', el), 'No song currently playing.');
    setText($('[data-now-album]', el), '');
    for (const a of [titleLink, artLink]) a.removeAttribute('href');
    titleLink.removeAttribute('aria-label');
    $('[data-now-progress]', el)!.hidden = true;
    setText($('[data-now-announce]'), '');
    return;
  }

  setText($('[data-now-title]', el), next.title);
  setText($('[data-now-artist]', el), `by ${next.artist}`);
  setText($('[data-now-album]', el), next.album ? `on ${next.album}` : '');
  for (const a of [titleLink, artLink]) {
    if (next.url) {
      a.href = next.url;
      a.target = '_blank';
      a.rel = 'noopener';
    } else a.removeAttribute('href');
  }
  titleLink.setAttribute('aria-label', `Open ${next.title} by ${next.artist} on Spotify`);

  if (next.art && next.art !== img.dataset.src) {
    swapImage(img, next.art, (ok) => {
      img.hidden = !ok;
      img.alt = ok ? `Cover of ${next.album || next.title}` : '';
      if (!ok) return;
      img.classList.remove('enter');
      void img.offsetWidth;
      img.classList.add('enter');
      el.style.setProperty('--now-art', `url("${next.art}")`);
    });
  } else if (!next.art) img.hidden = true;

  $('[data-now-progress]', el)!.hidden = !(next.durationMs > 0);
  setText($('[data-now-duration]', el), duration(next.durationMs));
  startProgress(next);
  if (prev?.key !== next.key) setText($('[data-now-announce]'), `Now playing ${next.title} by ${next.artist}`);
}

/** Progress is one CSS animation on the compositor; JS only updates the numbers once a second. */
function startProgress(c: NowTrack) {
  const fill = $('[data-now-fill]')!;
  fill.classList.remove('running');
  const elapsed = c.paused ? c.pausedAt : Date.now() - c.start;
  fill.style.setProperty('--p', String(Math.min(1, elapsed / (c.durationMs || 1))));
  if (!c.paused && c.durationMs > 0) {
    fill.style.setProperty('--dur', `${c.durationMs}ms`);
    fill.style.setProperty('--delay', `${-elapsed}ms`);
    void fill.offsetWidth;
    fill.classList.add('running');
  }
}

function tickProgress(now: number) {
  const c = getState().now;
  if (!c || c.durationMs <= 0) return;
  const elapsed = Math.min(c.durationMs, Math.max(0, c.paused ? c.pausedAt : now - c.start));
  setText($('[data-now-elapsed]'), duration(elapsed));
  const bar = $('[data-now-bar]');
  bar?.setAttribute('aria-valuenow', String(Math.round((elapsed / c.durationMs) * 100)));
  bar?.setAttribute('aria-valuetext', `${duration(elapsed)} of ${duration(c.durationMs)}`);
  $('[data-now-fill]')?.style.setProperty('--p', String(elapsed / c.durationMs));
  // an API-sourced song ran out: ask Spotify what's next (Lanyard pushes its own updates)
  if (c.source === 'spotify' && !c.paused && elapsed >= c.durationMs) {
    c.paused = true;
    window.setTimeout(() => loadSpotify(true), 3000);
  }
}

/* ================================================================== */

export function initMusic() {
  set('history', saved.plays);

  // a song that was playing when this browser last had the page open goes into history
  // once we know it's no longer the current song
  let resume = saved.current;
  const settleResume = (next: NowTrack | null, settled: boolean) => {
    if (!resume) return;
    const ended = Date.now() > resume.start + resume.durationMs;
    if (ended || (settled && next?.key !== resume.key)) {
      addPlays([asPlay(resume, Math.min(Date.now(), resume.start + resume.durationMs))]);
      resume = null;
    } else if (settled) resume = null;
  };
  settleResume(null, false);

  watch(['presence', 'lanyard', 'spotify'], ({ presence, spotify, lanyard }) => {
    // Lanyard is realtime, so it wins whenever it has a song
    const next = fromLanyard(presence) ?? (spotify.status === 'ok' ? fromApi(spotify.data) : null);
    settleResume(next, lanyard !== 'connecting');

    const prev = getState().now;
    if (prev?.key === next?.key && prev?.paused === next?.paused) return;
    // the previous song finished or was skipped: file it
    if (prev && !prev.paused && prev.key !== next?.key) {
      addPlays([asPlay(prev, Math.min(Date.now(), prev.start + prev.durationMs))]);
      window.setTimeout(() => loadSpotify(true), 8000);
    }
    saved.current = next && !next.paused ? next : null;
    persist();
    set('now', next);
    render(next, prev);
  });
  tick(tickProgress);

  // keep history fresh while someone is looking, without polling a hidden tab
  window.setInterval(() => !document.hidden && loadSpotify(), 120_000);
  document.addEventListener('visibilitychange', () => !document.hidden && loadSpotify());
  // other tabs of this site share the same history
  addEventListener('storage', (e) => {
    if (e.key !== STORE_KEY) return;
    saved = readSaved();
    set('history', saved.plays);
  });

  loadSpotify(true);
}
