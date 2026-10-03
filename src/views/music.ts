import type { RecentTrack, SpotifyResponse } from '../../shared/types';
import { $, getJSON, h, setText, svg, swapImage } from '../lib/dom';
import { icons } from '../lib/icons';
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

let current: Current | null = null;
/** Tracks seen live via Lanyard during this visit (newest first). Merged into the history list. */
const sessionPlays: RecentTrack[] = [];
let query = '';

/* ------------------------------------------------------------------ */
/* data                                                                */
/* ------------------------------------------------------------------ */

let fetching: Promise<void> | null = null;
let lastFetch = 0;

export function loadSpotify(force = false): Promise<void> {
  if (fetching) return fetching;
  if (!force && Date.now() - lastFetch < 20_000) return Promise.resolve();
  fetching = getJSON<SpotifyResponse>('/api/spotify')
    .then((data) => {
      if (typeof data?.configured !== 'boolean') throw new Error('bad payload');
      set('spotify', { status: 'ok', data });
    })
    .catch(() => {
      const prev = getState().spotify;
      if (prev.status !== 'ok') set('spotify', { status: 'error' });
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

  // Lanyard track ended/changed → remember it for the history list.
  if (prev && prev.source === 'discord' && prev.key !== next?.key) {
    sessionPlays.unshift({
      id: prev.id ?? prev.key,
      title: prev.title,
      artists: [prev.artist],
      album: prev.album,
      art: prev.art,
      artSmall: prev.art,
      url: prev.url ?? '#',
      durationMs: prev.durationMs,
      playedAt: new Date().toISOString(),
    });
    sessionPlays.length = Math.min(sessionPlays.length, 30);
    // history on Spotify's side changed too; grab it after a short delay
    window.setTimeout(() => loadSpotify(true), 8000);
  }

  current = next;
  if (!changed) return;

  const state = !next ? 'idle' : next.paused ? 'paused' : 'playing';
  el.dataset.state = state;
  $('[data-mascot]')?.setAttribute('data-playing', String(state === 'playing'));

  const live = $('[data-now-live]')!;
  live.hidden = !next;
  setText($('[data-now-source]', el), next ? (next.paused ? 'paused' : next.source === 'discord' ? 'live' : 'now') : '');
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
      if (ok) {
        // restart the fade-in for each new cover
        img.style.animation = 'none';
        void img.offsetWidth;
        img.style.animation = '';
        el.style.setProperty('--now-art', `url("${next.art}")`);
      }
    });
  } else {
    img.hidden = true;
  }

  $('[data-now-progress]', el)!.hidden = !(next.durationMs > 0);
  setText($('[data-now-duration]', el), duration(next.durationMs));
  startProgress(next);
  if (!prev || prev.key !== next.key) announce(`Now playing: ${next.title} by ${next.artist}`);
}

function announce(text: string) {
  setText($('[data-now-announce]'), text);
}

/** Progress is a single CSS animation (compositor-only); JS just updates the text once a second. */
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
  const pct = Math.round((elapsed / c.durationMs) * 100);
  const bar = $('[data-now-bar]');
  bar?.setAttribute('aria-valuenow', String(pct));
  bar?.setAttribute('aria-valuetext', `${duration(elapsed)} of ${duration(c.durationMs)}`);
  $('[data-now-fill]')?.style.setProperty('--p', String(elapsed / c.durationMs));
  // API-sourced track ran out: ask again (Lanyard pushes its own updates).
  if (c.source === 'spotify' && !c.paused && elapsed >= c.durationMs) {
    c.paused = true;
    window.setTimeout(() => loadSpotify(true), 3000);
  }
}

/* ------------------------------------------------------------------ */
/* recent streams                                                      */
/* ------------------------------------------------------------------ */

function historyList(): RecentTrack[] {
  const s = getState().spotify;
  const api = s.status === 'ok' ? s.data.recent : [];
  const merged: RecentTrack[] = [];
  const seen = new Set<string>();
  const push = (t: RecentTrack) => {
    // same track within ~10 min from both sources = same play
    const k = `${t.id}:${Math.round(new Date(t.playedAt).getTime() / 600_000)}`;
    if (seen.has(k)) return;
    seen.add(k);
    merged.push(t);
  };
  [...sessionPlays, ...api].sort((a, b) => +new Date(b.playedAt) - +new Date(a.playedAt)).forEach(push);
  return merged;
}

function trackRow(t: RecentTrack | Current, i: number, isNow: boolean) {
  const title = 'title' in t ? t.title : '';
  const artist = 'artists' in t ? t.artists.join(', ') : (t as Current).artist;
  const art = 'artSmall' in t ? t.artSmall ?? t.art : (t as Current).art;
  const url = t.url && t.url !== '#' ? t.url : null;
  const dur = 'durationMs' in t ? t.durationMs : 0;
  const when = isNow ? ((t as Current).paused ? 'paused' : 'now') : ago((t as RecentTrack).playedAt);

  const cover = h('a', { class: 'cover', href: url, target: url ? '_blank' : null, rel: 'noopener', tabindex: '-1', 'aria-hidden': 'true' });
  if (art) cover.append(h('img', { src: art, alt: '', width: 54, height: 54, loading: 'lazy', decoding: 'async' }));

  const titleEl = url
    ? h('a', { class: 't-title', href: url, target: '_blank', rel: 'noopener' }, title)
    : h('span', { class: 't-title' }, title);

  const spot = h('span', { class: 'ico', title: 'Spotify' });
  spot.append(svg(icons.spotify));

  const li = h(
    'li',
    { class: `track${isNow ? ' is-now' : ''}`, style: `--i:${Math.min(i, 12)}` },
    cover,
    h('div', { class: 't-main' }, titleEl, h('span', { class: 't-artist' }, artist)),
    h('div', { class: 't-meta' }, spot, dur ? h('span', {}, duration(dur)) : null, h('span', { class: 't-when' }, when)),
  );
  return li;
}

function renderStreams() {
  const list = $('[data-streams]')!;
  const meta = $('[data-streams-meta]')!;
  const s = getState().spotify;
  const q = query.trim().toLowerCase();
  const match = (title: string, artist: string, album: string) =>
    !q || title.toLowerCase().includes(q) || artist.toLowerCase().includes(q) || album.toLowerCase().includes(q);

  const rows: HTMLElement[] = [];
  if (current && match(current.title, current.artist, current.album)) rows.push(trackRow(current, 0, true));
  historyList()
    .filter((t) => match(t.title, t.artists.join(' '), t.album))
    .forEach((t) => rows.push(trackRow(t, rows.length, false)));

  if (s.status === 'loading' && !rows.length) {
    list.replaceChildren(...Array.from({ length: 4 }, () => h('li', { class: 'skel', 'aria-hidden': 'true' })));
    setText(meta, 'loading…');
    return;
  }

  if (!rows.length) {
    let headline = 'nothing here yet';
    let detail = 'tracks show up as they play.';
    if (q) {
      headline = `no matches for "${query.trim()}"`;
      detail = 'try an artist instead?';
    } else if (s.status === 'error') {
      headline = "couldn't reach spotify";
      detail = 'try the refresh button in a bit.';
    } else if (s.status === 'ok' && !s.data.configured) {
      headline = 'spotify history isn’t hooked up yet';
      detail = 'live tracks from discord will still land here.';
    } else if (s.status === 'ok' && s.data.error) {
      headline = 'spotify is being shy right now';
      detail = s.data.error === 'rate_limited' ? 'rate limited, back soon.' : 'history will be back shortly.';
    }
    list.replaceChildren(h('li', { class: 'streams-empty' }, h('strong', {}, headline), h('span', { class: 'mono' }, detail)));
  } else {
    list.replaceChildren(...rows);
  }

  const source =
    s.status === 'ok' && s.data.configured && !s.data.error
      ? `via spotify · ${historyList().length} recent`
      : sessionPlays.length || current
        ? 'via discord presence · this visit only'
        : 'via spotify';
  setText(meta, source);
}

/* ------------------------------------------------------------------ */

export function initMusic() {
  const sync = () => {
    const { presence, spotify } = getState();
    const fromDiscord = fromLanyard(presence);
    const fromSpotify = spotify.status === 'ok' ? fromApi(spotify.data) : null;
    // Lanyard is realtime, so it wins whenever it has a track.
    renderNow(fromDiscord ?? fromSpotify);
    renderStreams();
  };
  watch(['presence', 'spotify'], sync);
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
    loadSpotify(true).finally(() => refresh.removeAttribute('aria-busy'));
  });

  // relative times ("3m ago") drift, so redraw them occasionally
  window.setInterval(() => !document.hidden && renderStreams(), 60_000);
  // history is cheap but not free: refresh every couple of minutes while someone is looking
  window.setInterval(() => !document.hidden && loadSpotify(), 120_000);
  document.addEventListener('visibilitychange', () => !document.hidden && loadSpotify());

  loadSpotify(true);
}
