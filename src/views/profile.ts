import { SITE } from '../../shared/config';
import type { DiscordProfile } from '../../shared/types';
import { $, $$, getJSON, h, nf, setText, swapImage } from '../lib/dom';
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
  type LanyardState,
} from '../lib/lanyard';
import { set, watch } from '../lib/store';
import { tick } from '../lib/ticker';
import { duration, relativeZone } from '../lib/time';

/** One Discord activity: art, what kind of activity, name, details, how long. */
function activityRow(a: LanyardActivity): HTMLElement {
  const large = assetUrl(a, 'large_image');
  const small = assetUrl(a, 'small_image');
  const fallback = () => h('span', { class: 'act-fallback' }, nf(''));
  const art = h('div', { class: 'act-art' });
  if (large) {
    const img = h('img', { src: large, alt: a.assets?.large_text ?? '', width: 48, height: 48, loading: 'lazy', decoding: 'async' });
    img.addEventListener('error', () => img.replaceWith(fallback()), { once: true });
    art.append(img);
    if (small) art.append(h('img', { class: 'act-small', src: small, alt: a.assets?.small_text ?? '', width: 20, height: 20, loading: 'lazy' }));
  } else art.append(fallback());

  const time = a.timestamps?.start || a.timestamps?.end
    ? h('span', { class: 'act-time', 'data-act-start': a.timestamps?.start ?? null, 'data-act-end': a.timestamps?.end ?? null })
    : null;

  return h(
    'div',
    { class: 'act' },
    art,
    h(
      'div',
      { class: 'act-text' },
      h('span', { class: 'act-verb' }, VERB[a.type] ?? 'doing'),
      h('strong', {}, a.name),
      a.details ? h('span', {}, a.details) : null,
      a.state ? h('span', {}, a.state) : null,
      time,
    ),
  );
}

function tickActivities(now: number) {
  for (const el of $$('[data-act-start], [data-act-end]')) {
    const end = Number(el.dataset.actEnd);
    const start = Number(el.dataset.actStart);
    if (end) setText(el, `${duration(end - now)} left`);
    else if (start) setText(el, `for ${duration(now - start)}`);
  }
}

function render(p: LanyardPresence | null, conn: LanyardState) {
  const status = p?.discord_status ?? 'offline';
  for (const dot of $$('[data-status-dot]')) {
    dot.dataset.status = status;
    if (dot.getAttribute('role') === 'img') dot.setAttribute('aria-label', `Discord status: ${STATUS_LABEL[status]}`);
  }

  // where hikemu is on discord from; a desktop glyph stands in while offline
  const platforms = $('[data-platforms]')!;
  const on: [boolean | undefined, string, string][] = [
    [p?.active_on_discord_desktop, '', 'desktop'],
    [p?.active_on_discord_mobile, '', 'mobile'],
    [p?.active_on_discord_web, '', 'web'],
  ];
  const active = on.filter(([v]) => v);
  platforms.replaceChildren(
    ...(active.length ? active : [on[0]]).map(([, glyph]) => h('span', { class: 'nf', 'aria-hidden': 'true', 'data-status': active.length ? status : 'offline' }, glyph)),
    h('span', { class: 'sr-only' }, active.length ? `on Discord ${active.map(([, , l]) => l).join(' and ')}` : 'not on Discord right now'),
  );

  const activity = $('[data-activity]')!;
  const custom = $('[data-custom-status]')!;
  if (!p) {
    custom.hidden = true;
    const text = conn === 'connecting' ? '' : 'Discord presence is unavailable right now. It reconnects on its own.';
    if (activity.dataset.key !== text) {
      activity.dataset.key = text;
      activity.className = 'activity';
      activity.replaceChildren(...(text ? [h('p', { class: 'act-quiet' }, text)] : []));
    }
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

  const cs = customStatus(p);
  custom.replaceChildren();
  if (cs && (cs.state || cs.emoji)) {
    if (cs.emoji) {
      const url = emojiUrl(cs.emoji);
      custom.append(url ? h('img', { src: url, alt: `:${cs.emoji.name}:`, width: 16, height: 16 }) : h('span', {}, cs.emoji.name));
    }
    if (cs.state) custom.append(h('span', {}, cs.state));
    custom.hidden = false;
  } else custom.hidden = true;

  const acts = mainActivities(p);
  const key = acts.map((a) => `${a.application_id ?? a.name}:${a.details}:${a.state}:${a.assets?.large_image}`).join('|') || `quiet:${status}`;
  if (activity.dataset.key === key) return;
  activity.dataset.key = key;
  if (acts.length) {
    activity.className = 'activity well';
    activity.replaceChildren(...acts.slice(0, 2).map(activityRow));
  } else {
    activity.className = 'activity';
    const quiet = status === 'offline' ? 'offline. probably asleep, or (rarely) outside.' : 'online, not doing anything in particular.';
    activity.replaceChildren(h('p', { class: 'act-quiet' }, quiet));
  }
}

function initClock() {
  const clock = $('[data-clock]')!;
  const tz = $('[data-tz]')!;
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: SITE.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  let lastMinute = -1;
  tick((now) => {
    const m = Math.floor(now / 60000);
    if (m === lastMinute) return;
    lastMinute = m;
    setText(clock, fmt.format(now));
    clock.setAttribute('datetime', new Date(now).toISOString());
    setText(tz, relativeZone(SITE.timezone));
  });
}

export function initProfile() {
  initClock();
  tick(tickActivities);
  watch(['presence', 'lanyard'], (s) => render(s.presence, s.lanyard));
  connectLanyard(SITE.discordId, (presence, conn) => {
    set('lanyard', conn);
    set('presence', presence);
  });

  // the Discord banner is a nice-to-have; the night-sky art stays if it's missing
  getJSON<DiscordProfile>('/api/discord')
    .then((profile) => {
      set('discordProfile', profile);
      const img = $<HTMLImageElement>('[data-banner]');
      if (!img || !profile.banner) return;
      swapImage(img, profile.banner, (ok) => {
        if (!ok) return;
        img.hidden = false;
        requestAnimationFrame(() => img.classList.add('ready'));
      });
    })
    .catch(() => {});
}
