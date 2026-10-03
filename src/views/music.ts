import type { RecentTrack, SpotifyResponse } from '../../shared/types';
import { $, getJSON, h, setText, swapImage } from '../lib/dom';
import type { LanyardPresence } from '../lib/lanyard';
import { getState, set, watch } from '../lib/store';
import { tick } from '../lib/ticker';
import { ago, duration } from '../lib/time';

/** Whatever is playing right now, normalised from either Lanyard or the Spotify API. */
interface Current {
  key: string;
  id: string | null;
  title: string;
  artist: string;
  album: string;
  art: string | null;
  url: string | null;
  /** epoch ms at which the track (virtually) started */
  start: number;
  durationMs: number;
  paused: boolean;
  /** frozen progress while paused */
  pausedAt: number;
  source: 'discord' | 'spotify';
}

/* ------------------------------------------------------------------ */
/* history that survives a refresh                                      */
/* ------------------------------------------------------------------ */

/**
 * Two sources feed "Recent Streams":
 *  - the Spotify API (authoritative, same for every visitor)
 *  - tracks seen live through Lanyard while the page was open
 * Both are kept in localStorage, so a refresh (or a Spotify hiccup) never empties the list.
 */
const STORE_KEY = 'hkmu:streams:v1';
const MAX_PLAYS = 60;

interface Saved {
  plays: RecentTrack[];
  /** what was playing when the page was last open, so it can be filed into history on return */
  current: (Current & { seenAt: number }) | null;
}

function readSaved(): Saved {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Saved;
      if (Array.isArray(parsed.plays)) return { plays: parsed.plays.filter(validPlay), current: parsed.current ?? null };
    }
  } catch {
    /* private mode, quota, malformed json: start fresh */
  }
  return { plays: [], current: null };
}

const validPlay = (t: RecentTrack) => !!t && typeof t.title === 'string' && typeof t.playedAt === 'string' && !Number.isNaN(Date.parse(t.playedAt));

let saved = readSaved();
let persistTimer: number | undefined;
function persist() {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(saved));
    } catch {
      /* storage unavailable: history just won't outlive the tab */
    }
  }, 250);
}

/** Same song within ~8 minutes from two sources = one play. */
const playKey = (t: RecentTrack) => `${(t.id || t.title).toLowerCase()}:${Math.round(Date.parse(t.playedAt) / 480_000)}`;

function addPlays(incoming: RecentTrack[]) {
  const byKey = new Map(saved.plays.map((p) => [playKey(p), p]));
  for (const t of incoming) {
    if (!validPlay(t)) continue;
    const k = playKey(t);
    const existing = byKey.get(k);
    // prefer API data (has duration, small art, canonical url) over lanyard-captured copies
    byKey.set(k, existing ? { ...existing, ...t, art: t.art ?? existing.art, artSmall: t.artSmall ?? existing.artSmall } : t);
  }
  saved.plays = [...byKey.values()].sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt)).slice(0, MAX_PLAYS);
  persist();
}

function currentToPlay(c: Current, playedAt: number): RecentTrack {
  return {
    id: c.id ?? c.key,
    title: c.title,
    artists: c.artist.split(', '),
    album: c.album,
    art: c.art,
    artSmall: c.art,
    url: c.url ?? '',
    durationMs: c.durationMs,
    playedAt: new Date(playedAt).toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* data                                                                */
/* ------------------------------------------------------------------ */

let current: Current | null = null;
let query = '';
let fetching: Promise<void> | null = null;
let lastFetch = 0;

export function loadSpotify(force = false): Promise<void> {
  if (fetching) return fetching;
  if (!force && Date.now() - lastFetch < 20_000) return Promise.resolve();
  fetching = getJSON<SpotifyResponse>('/api/spotify')
    .then((data) => {
      if (typeof data?.configured !== 'boolean') throw new Error('bad payload');
      if (data.recent?.length) addPlays(data.recent);
      set('spotify', { status: 'ok', data });
    })
    .catch(() => {
      if (getState().spotify.status !== 'ok') set('spotify', { status: 'error' });
    })
    .finally(() => {
      lastFetch = Date.now();
      fetching = null;
    });
  return fetching;
}

function fromLanyard(p: LanyardPresence | null): Current | null {
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

function fromApi(data: SpotifyResponse | null): Current | null {
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

/* ------------------------------------------------------------------ */
/* now playing card                                                    */
/* ------------------------------------------------------------------ */

const card = () => $('[data-now]')!;

function renderNow(next: Current | null) {
  const el = card();
  const prev = current;
  const changed = prev?.key !== next?.key || prev?.paused !== next?.paused;

  // a track that was playing is now over: file it into history
  if (prev && prev.key !== next?.key && !prev.paused) {
    addPlays([currentToPlay(prev, Math.min(Date.now(), prev.start + prev.durationMs))]);
    window.setTimeout(() => loadSpotify(true), 8000);
  }
  current = next;
  saved.current = next && !next.paused ? { ...next, seenAt: Date.now() } : null;
  persist();
  if (!changed) return;

  const state = !next ? 'idle' : next.paused ? 'paused' : 'playing';
  el.dataset.state = state;
  $('[data-mascot]')?.setAttribute('data-playing', String(state === 'playing'));

  const live = $('[data-now-live]')!;
  live.hidden = !next;
  setText($('[data-now-source]', el), next ? (next.paused ? 'paused' : 'live') : '');
  live.title = next ? `via ${next.source === 'discord' ? 'discord presence (lanyard)' : 'spotify api'}` : '';

  const img = $<HTMLImageElement>('[data-now-art]', el)!;
  const titleLink = $<HTMLAnchorElement>('[data-now-title-link]', el)!;
  const artLink = $<HTMLAnchorElement>('[data-now-link]', el)!;

  if (!next) {
    img.hidden = true;
    img.removeAttribute('src');
    delete img.dataset.src;
    el.style.removeProperty('--now-art');
    setText($('[data-now-title]', el), 'Not listening');
    setText($('[data-now-sub]', el), 'No song currently playing.');
    setText($('[data-now-album]', el), '');
    titleLink.removeAttribute('href');
    titleLink.removeAttribute('aria-label');
    artLink.removeAttribute('href');
    $('[data-now-progress]', el)!.hidden = true;
    announce('');
    return;
  }

  setText($('[data-now-title]', el), next.title);
  setText($('[data-now-sub]', el), `by ${next.artist}`);
  setText($('[data-now-album]', el), next.album ? `on ${next.album}` : '');
  for (const a of [titleLink, artLink]) {
    if (next.url) {
      a.href = next.url;
      a.target = '_blank';
      a.rel = 'noopener';
    } else a.removeAttribute('href');
  }
  titleLink.setAttribute('aria-label', `${next.title} by ${next.artist} (opens Spotify)`);

  if (next.art) {
    swapImage(img, next.art, (ok) => {
      img.hidden = !ok;
      img.alt = ok ? `Album art for ${next.album || next.title}` : '';
      if (!ok) return;
      img.style.animation = 'none';
      void img.offsetWidth;
      img.style.animation = '';
      el.style.setProperty('--now-art', `url("${next.art}")`);
    });
  } else img.hidden = true;

  $('[data-now-progress]', el)!.hidden = !(next.durationMs > 0);
  setText($('[data-now-duration]', el), duration(next.durationMs));
  startProgress(next);
  if (!prev || prev.key !== next.key) announce(`Now playing: ${next.title} by ${next.artist}`);
}

function announce(text: string) {
  setText($('[data-now-announce]'), text);
}

/** Progress is one CSS animation (compositor only); JS just updates the numbers once a second. */
function startProgress(c: Current) {
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
  const c = current;
  if (!c || c.durationMs <= 0) return;
  const elapsed = Math.min(c.durationMs, Math.max(0, c.paused ? c.pausedAt : now - c.start));
  setText($('[data-now-elapsed]'), duration(elapsed));
  const bar = $('[data-now-bar]');
  bar?.setAttribute('aria-valuenow', String(Math.round((elapsed / c.durationMs) * 100)));
  bar?.setAttribute('aria-valuetext', `${duration(elapsed)} of ${duration(c.durationMs)}`);
  $('[data-now-fill]')?.style.setProperty('--p', String(elapsed / c.durationMs));
  // an API-sourced track ran out: ask again (Lanyard pushes its own updates)
  if (c.source === 'spotify' && !c.paused && elapsed >= c.durationMs) {
    c.paused = true;
    window.setTimeout(() => loadSpotify(true), 3000);
  }
}

/* ------------------------------------------------------------------ */
/* recent streams                                                      */
/* ------------------------------------------------------------------ */

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  return d.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' }).toLowerCase();
}

function spotifyGlyph() {
  return h('span', { class: 'nf', title: 'Spotify', 'aria-hidden': 'true' }, '');
}

function trackRow(t: { title: string; artist: string; art: string | null; url: string | null; durationMs: number }, when: string, i: number, isNow: boolean) {
  const url = t.url || null;
  const cover = h('a', { class: 'cover', href: url, target: url ? '_blank' : null, rel: 'noopener', tabindex: '-1', 'aria-hidden': 'true' });
  if (t.art) cover.append(h('img', { src: t.art, alt: '', width: 46, height: 46, loading: 'lazy', decoding: 'async' }));
  const title = url ? h('a', { class: 't-title', href: url, target: '_blank', rel: 'noopener' }, t.title) : h('span', { class: 't-title' }, t.title);
  return h(
    'li',
    { class: `track${isNow ? ' is-now' : ''}`, style: `--i:${Math.min(i, 12)}` },
    cover,
    h('div', { class: 't-main' }, title, h('span', { class: 't-artist' }, t.artist)),
    h('div', { class: 't-meta' }, spotifyGlyph(), t.durationMs ? h('span', {}, duration(t.durationMs)) : null, h('span', { class: 't-when' }, when)),
  );
}

function renderStreams() {
  const list = $('[data-streams]')!;
  const meta = $('[data-streams-meta]')!;
  const s = getState().spotify;
  const q = query.trim().toLowerCase();
  const match = (...fields: string[]) => !q || fields.some((f) => f.toLowerCase().includes(q));

  const rows: HTMLElement[] = [];
  if (current && match(current.title, current.artist, current.album)) {
    rows.push(trackRow(current, current.paused ? 'paused' : 'now', 0, true));
  }
  let lastDay = '';
  for (const t of saved.plays) {
    if (!match(t.title, t.artists.join(' '), t.album)) continue;
    const day = dayLabel(t.playedAt);
    if (day !== lastDay && day !== 'today') rows.push(h('li', { class: 'day', 'aria-hidden': 'true' }, `── ${day}`));
    lastDay = day;
    const row = { title: t.title, artist: t.artists.join(', '), art: t.artSmall ?? t.art, url: t.url || null, durationMs: t.durationMs };
    rows.push(trackRow(row, ago(t.playedAt), rows.length, false));
  }

  if (!rows.length) {
    if (s.status === 'loading') {
      list.replaceChildren(...Array.from({ length: 4 }, () => h('li', { class: 'skel', 'aria-hidden': 'true' })));
      setText(meta, 'loading…');
      return;
    }
    let headline = 'nothing played yet';
    let detail = 'tracks land here as they play.';
    if (q) {
      headline = `no matches for "${query.trim()}"`;
      detail = 'try an artist instead?';
    } else if (s.status === 'error') {
      headline = "couldn't reach spotify";
      detail = 'try the refresh button in a bit.';
    } else if (s.status === 'ok' && !s.data.configured) {
      headline = 'quiet in here';
      detail = 'tracks from discord land here as they play.';
    }
    list.replaceChildren(h('li', { class: 'streams-empty' }, h('strong', {}, headline), h('span', {}, detail)));
  } else list.replaceChildren(...rows);

  const live = s.status === 'ok' && s.data.configured && !s.data.error;
  setText(meta, `${saved.plays.length} recent · ${live ? 'via spotify' : 'via discord presence'}${s.status === 'ok' && s.data.error ? ' · spotify is napping, showing saved history' : ''}`);
}

/* ------------------------------------------------------------------ */

export function initMusic() {
  // whatever was playing when this browser last had the page open: once we know it's no
  // longer the current track (it ended, or got skipped/stopped), it belongs in history
  let resume = saved.current;
  const settleResume = (next: Current | null, settled: boolean) => {
    if (!resume) return;
    const ended = Date.now() > resume.start + resume.durationMs;
    if (ended || (settled && next?.key !== resume.key)) {
      addPlays([currentToPlay(resume, Math.min(Date.now(), resume.start + resume.durationMs))]);
      resume = null;
    } else if (settled) resume = null; // still the same song: it'll be filed when it ends
  };
  settleResume(null, false);

  watch(['presence', 'lanyard', 'spotify'], () => {
    const { presence, spotify, lanyard } = getState();
    // Lanyard is realtime, so it wins whenever it has a track
    const next = fromLanyard(presence) ?? (spotify.status === 'ok' ? fromApi(spotify.data) : null);
    settleResume(next, lanyard !== 'connecting');
    renderNow(next);
    renderStreams();
  });
  tick(tickProgress);

  const input = $<HTMLInputElement>('[data-stream-search]')!;
  input.addEventListener('input', () => {
    query = input.value;
    renderStreams();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = query = '';
      renderStreams();
    }
  });

  const refresh = $<HTMLButtonElement>('[data-stream-refresh]')!;
  refresh.addEventListener('click', () => {
    refresh.classList.remove('spinning');
    void refresh.offsetWidth;
    refresh.classList.add('spinning');
    refresh.setAttribute('aria-busy', 'true');
    loadSpotify(true).finally(() => {
      refresh.removeAttribute('aria-busy');
      renderStreams();
    });
  });

  // keep "3m ago" honest, and pick up new history every couple of minutes while visible
  window.setInterval(() => !document.hidden && renderStreams(), 60_000);
  window.setInterval(() => !document.hidden && loadSpotify(), 120_000);
  document.addEventListener('visibilitychange', () => !document.hidden && loadSpotify());

  // other tabs of this site keep the same history
  addEventListener('storage', (e) => {
    if (e.key !== STORE_KEY) return;
    saved = readSaved();
    renderStreams();
  });

  loadSpotify(true);
}
