import type { RecentTrack } from '../../shared/types';
import { $, afterDelay, h, nf, setText } from '../lib/dom';
import { getState, watch, type NowTrack } from '../lib/store';
import { ago, duration } from '../lib/time';
import { loadSpotify } from './music';

let query = '';

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(new Date()) - startOf(d)) / 86_400_000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  return d.toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' }).toLowerCase();
}

interface Row {
  title: string;
  artist: string;
  album: string;
  art: string | null;
  url: string | null;
  durationMs: number;
}

function trackRow(t: Row, when: string, isNow: boolean) {
  const cover = h('a', { class: 'cover', href: t.url, target: t.url ? '_blank' : null, rel: 'noopener', tabindex: '-1', 'aria-hidden': 'true' });
  if (t.art) cover.append(h('img', { src: t.art, alt: '', width: 40, height: 40, loading: 'lazy', decoding: 'async' }));
  const title = t.url
    ? h('a', { class: 't-title', href: t.url, target: '_blank', rel: 'noopener', 'aria-label': `${t.title} by ${t.artist}, open on Spotify` }, t.title)
    : h('span', { class: 't-title' }, t.title);
  return h(
    'li',
    { class: `track${isNow ? ' is-now' : ''}` },
    cover,
    h('div', { class: 't-main' }, title, h('span', { class: 't-artist' }, t.artist)),
    h(
      'div',
      { class: 't-meta' },
      nf(''),
      t.durationMs ? h('span', {}, duration(t.durationMs)) : null,
      h('span', { class: 't-when' }, when),
    ),
  );
}

const fromNow = (c: NowTrack): Row => ({ title: c.title, artist: c.artist, album: c.album, art: c.art, url: c.url, durationMs: c.durationMs });
const fromPlay = (t: RecentTrack): Row => ({
  title: t.title,
  artist: t.artists.join(', '),
  album: t.album,
  art: t.artSmall ?? t.art,
  url: t.url || null,
  durationMs: t.durationMs,
});

function skeleton() {
  return Array.from({ length: 5 }, () =>
    h('li', { class: 'skel', 'aria-hidden': 'true' }, h('i', { class: 'sq' }), h('span', { class: 'lines' }, h('i', { style: 'width:55%' }), h('i', { style: 'width:35%' }))),
  );
}

function state(title: string, body: string, ...actions: HTMLElement[]) {
  return h('li', { class: 'state' }, h('h3', {}, title), h('p', {}, body), actions.length ? h('div', { class: 'actions' }, ...actions) : null);
}

function button(label: string, onClick: () => void) {
  const b = h('button', { class: 'btn', type: 'button' }, label);
  b.addEventListener('click', onClick);
  return b;
}

function render() {
  const list = $('[data-tracks]')!;
  const meta = $('[data-streams-meta]')!;
  const { spotify, now, history } = getState();
  const q = query.trim().toLowerCase();
  const match = (r: Row) => !q || [r.title, r.artist, r.album].some((f) => f.toLowerCase().includes(q));

  const rows: HTMLElement[] = [];
  if (now && match(fromNow(now))) rows.push(trackRow(fromNow(now), now.paused ? 'paused' : 'now', true));
  let lastDay = 'today';
  for (const t of history) {
    const row = fromPlay(t);
    if (!match(row)) continue;
    const day = dayLabel(t.playedAt);
    if (day !== lastDay) rows.push(h('li', { class: 'day' }, day));
    lastDay = day;
    rows.push(trackRow(row, ago(t.playedAt), false));
  }

  const loading = spotify.status === 'loading' && !rows.length;
  list.setAttribute('aria-busy', String(loading));

  if (rows.length) {
    list.replaceChildren(...rows);
  } else if (loading) {
    // skeleton only if loading takes long enough to notice
    afterDelay(150, () => getState().spotify.status === 'loading' && !list.children.length, () => list.replaceChildren(...skeleton()));
  } else if (q) {
    list.replaceChildren(
      state(`No songs match "${query.trim()}"`, 'Try an artist or album name instead.', button('Clear search', clearSearch)),
    );
  } else if (spotify.status === 'error') {
    list.replaceChildren(state("Couldn't load listening history", 'Spotify didn’t answer. Try again in a moment.', button('Try again', refresh)));
  } else {
    list.replaceChildren(state('No songs yet', 'Songs show up here as hikemu listens, and they stay after a refresh.', button('Check again', refresh)));
  }

  const count = history.length;
  let source = '';
  if (spotify.status === 'ok' && spotify.data.configured && !spotify.data.error) source = 'from spotify';
  else if (spotify.status === 'ok' && spotify.data.error) source = 'spotify didn’t answer, showing saved history';
  else if (count) source = 'seen live on discord';
  setText(meta, count ? `${count} recent ${count === 1 ? 'song' : 'songs'}, ${source}` : '');
}

function clearSearch() {
  const input = $<HTMLInputElement>('[data-stream-search]')!;
  input.value = query = '';
  render();
  input.focus();
}

function refresh() {
  const btn = $<HTMLButtonElement>('[data-stream-refresh]')!;
  // inline feedback on the control, only if the request is slow enough to notice
  let done = false;
  afterDelay(100, () => !done, () => btn.setAttribute('aria-busy', 'true'));
  loadSpotify(true).finally(() => {
    done = true;
    btn.removeAttribute('aria-busy');
    render();
  });
}

export function initStreams() {
  watch(['spotify', 'now', 'history'], render);

  const input = $<HTMLInputElement>('[data-stream-search]')!;
  input.addEventListener('input', () => {
    query = input.value;
    render();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && input.value) {
      e.preventDefault();
      clearSearch();
    }
  });
  $('[data-stream-refresh]')!.addEventListener('click', refresh);

  // keep "3m ago" honest
  window.setInterval(() => !document.hidden && render(), 60_000);
}
