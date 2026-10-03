import { SITE } from '../../shared/config';
import type { DiscordProfile } from '../../shared/types';
import { $, $$, getJSON, h, setText, svg, swapImage } from '../lib/dom';
import { icons } from '../lib/icons';
import {
  assetUrl,
  avatarUrl,
  connectLanyard,
  customStatus,
  decorationUrl,
  emojiUrl,
  mainActivities,
  STATUS_LABEL,
  VERB,
  type LanyardActivity,
  type LanyardPresence,
} from '../lib/lanyard';
import { getState, set, watch } from '../lib/store';
import { tick } from '../lib/ticker';
import { duration, relativeZone } from '../lib/time';

/** An activity rendered Discord-style: art, verb, name, details, elapsed. Used on Home and More. */
export function activityRow(a: LanyardActivity): HTMLElement {
  const large = assetUrl(a, 'large_image');
  const small = assetUrl(a, 'small_image');
  const art = h('div', { class: 'act-art' });
  if (large) {
    const img = h('img', { src: large, alt: a.assets?.large_text ?? a.name, width: 46, height: 46, loading: 'lazy', decoding: 'async' });
    img.addEventListener('error', () => img.replaceWith(fallbackIcon()), { once: true });
    art.append(img);
  } else art.append(fallbackIcon());
  if (small && large) art.append(h('img', { class: 'act-small', src: small, alt: a.assets?.small_text ?? '', width: 18, height: 18, loading: 'lazy' }));

  const time = h('span', { class: 'act-time', 'data-act-start': a.timestamps?.start ?? null, 'data-act-end': a.timestamps?.end ?? null });

  return h(
    'div',
    { class: 'act' },
    art,
    h(
      'div',
      { class: 'act-text' },
      h('span', { class: 'label' }, VERB[a.type] ?? 'doing'),
      h('strong', {}, a.name),
      a.details ? h('span', {}, a.details) : null,
      a.state ? h('span', {}, a.state) : null,
      a.timestamps?.start || a.timestamps?.end ? time : null,
    ),
  );
}

function fallbackIcon() {
  const f = h('span', { class: 'act-fallback' });
  f.append(svg(icons.gamepad));
  return f;
}

/** Keeps every "12:34 elapsed" on the page ticking off the shared 1s timer. */
function tickActivities(now: number) {
  for (const el of $$('[data-act-start], [data-act-end]')) {
    const end = Number(el.dataset.actEnd);
    const start = Number(el.dataset.actStart);
    if (end) setText(el, `${duration(end - now)} left`);
    else if (start) setText(el, `${duration(now - start)} elapsed`);
  }
}

function renderProfile(p: LanyardPresence | null, state: ReturnType<typeof getState>['lanyard']) {
  const status = p?.discord_status ?? 'offline';
  for (const dot of $$('[data-status-dot]')) {
    dot.dataset.status = status;
    if (dot.getAttribute('role') === 'img') dot.setAttribute('aria-label', `Discord status: ${STATUS_LABEL[status]}`);
  }
  $('[data-mascot]')?.setAttribute('data-status', status);

  // the little lanyard 88x31 tells the truth about the socket
  setText($('[data-b-lanyard-state]'), state === 'live' ? '● LIVE' : state === 'polling' ? '● REST' : state === 'connecting' ? '● ···' : '○ OFF');

  if (!p) {
    renderActivity(null, state);
    return;
  }

  const avatar = $<HTMLImageElement>('[data-avatar]');
  if (avatar) swapImage(avatar, avatarUrl(p, 256));
  const deco = $<HTMLImageElement>('[data-avatar-deco]');
  const decoSrc = decorationUrl(p);
  if (deco) {
    if (decoSrc) swapImage(deco, decoSrc, (ok) => (deco.hidden = !ok));
    else deco.hidden = true;
  }

  // where am i online from
  const platforms = $('[data-platforms]');
  if (platforms) {
    const on: [boolean, 'monitor' | 'phone' | 'globe', string][] = [
      [p.active_on_discord_desktop, 'monitor', 'desktop'],
      [p.active_on_discord_mobile, 'phone', 'mobile'],
      [p.active_on_discord_web, 'globe', 'web'],
    ];
    const active = on.filter(([v]) => v);
    const list = active.length ? active : [[true, 'monitor', 'desktop'] as const];
    platforms.replaceChildren(
      ...list.map(([, icon, label]) => {
        const s = h('span', { class: 'ico', title: active.length ? `on discord ${label}` : 'offline', 'data-status': active.length ? status : 'offline' });
        s.append(svg(icons[icon]));
        return s;
      }),
    );
    platforms.setAttribute('aria-label', active.length ? `Active on ${active.map(([, , l]) => l).join(', ')}` : 'Not active');
  }

  const custom = customStatus(p);
  const bubble = $('[data-custom-status]');
  if (bubble) {
    bubble.replaceChildren();
    if (custom && (custom.state || custom.emoji)) {
      if (custom.emoji) {
        const url = emojiUrl(custom.emoji);
        bubble.append(url ? h('img', { src: url, alt: `:${custom.emoji.name}:`, width: 16, height: 16 }) : h('span', {}, custom.emoji.name));
      }
      if (custom.state) bubble.append(h('span', {}, custom.state));
      bubble.hidden = false;
    } else bubble.hidden = true;
  }

  renderActivity(p, state);
}

function renderActivity(p: LanyardPresence | null, state: string) {
  const slot = $('[data-activity]');
  if (!slot) return;
  const first = p ? mainActivities(p)[0] : undefined;
  if (first) {
    const key = `${first.application_id ?? first.name}:${first.details}:${first.state}:${first.assets?.large_image}`;
    if (slot.dataset.key === key) return;
    slot.dataset.key = key;
    slot.replaceChildren(activityRow(first));
    return;
  }
  const quiet =
    !p && state === 'unavailable'
      ? 'presence unavailable right now'
      : !p
        ? 'connecting to discord…'
        : p.listening_to_spotify
          ? 'just vibing to music'
          : p.discord_status === 'offline'
            ? 'offline. probably asleep, or (rarely) outside'
            : 'online, not doing anything in particular';
  if (slot.dataset.key === quiet) return;
  slot.dataset.key = quiet;
  slot.replaceChildren(h('p', { class: 'act-quiet' }, quiet));
}

function initClock() {
  const clock = $('[data-clock]');
  const tz = $('[data-tz]');
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: SITE.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const iso = new Intl.DateTimeFormat('sv-SE', { timeZone: SITE.timezone, dateStyle: 'short', timeStyle: 'short' });
  let lastMinute = -1;
  tick((now) => {
    const m = Math.floor(now / 60000);
    if (m === lastMinute) return;
    lastMinute = m;
    const d = new Date(now);
    setText(clock, fmt.format(d));
    clock?.setAttribute('datetime', iso.format(d).replace(' ', 'T'));
    setText(tz, relativeZone(SITE.timezone));
  });
}

export function initPresence() {
  initClock();
  tick(tickActivities);

  watch(['presence', 'lanyard'], (s) => renderProfile(s.presence, s.lanyard));
  connectLanyard(SITE.discordId, (presence, state) => {
    set('lanyard', state);
    set('presence', presence);
  });

  // Discord banner: optional nicety, never blocks anything.
  getJSON<DiscordProfile>('/api/discord')
    .then((profile) => {
      set('discordProfile', profile);
      const img = $<HTMLImageElement>('[data-banner]');
      if (img && profile.banner) {
        swapImage(img, profile.banner, (ok) => {
          if (!ok) return;
          img.hidden = false;
          requestAnimationFrame(() => img.classList.add('ready'));
        });
      }
    })
    .catch(() => {});
}
