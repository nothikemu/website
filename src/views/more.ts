import { LINKS, SITE } from '../../shared/config';
import type { SteamResponse } from '../../shared/types';
import { $, getJSON, h, setText, svg } from '../lib/dom';
import { icons, type IconName } from '../lib/icons';
import { avatarUrl, customStatus, decorationUrl, emojiUrl, mainActivities, STATUS_LABEL } from '../lib/lanyard';
import { set, watch, type State } from '../lib/store';
import { tick } from '../lib/ticker';
import { activityRow } from './presence';
import { preview } from './socials';

/* ---------------- discord popout ---------------- */

function renderDiscord(s: State) {
  const card = $('[data-discord-card]')!;
  const p = s.presence;
  const prof = s.discordProfile;
  const status = p?.discord_status ?? 'offline';

  const banner = h('div', { class: 'dc-banner' });
  if (prof?.banner) banner.style.backgroundImage = `url("${prof.banner}")`;
  else if (prof?.accentColor) banner.style.setProperty('--dc-accent', prof.accentColor);

  const avatar = h(
    'div',
    { class: 'dc-avatar' },
    h('img', { src: p ? avatarUrl(p, 160) : `${LINKS.github}.png?size=160`, alt: '', width: 84, height: 84, decoding: 'async' }),
  );
  const deco = p ? decorationUrl(p) : null;
  if (deco) avatar.append(h('img', { class: 'avatar-deco', src: deco, alt: '', width: 100, height: 100 }));
  avatar.append(h('span', { class: 'status-dot', 'data-status': status, role: 'img', 'aria-label': `status: ${STATUS_LABEL[status]}` }));

  const name = p?.discord_user.global_name || p?.discord_user.display_name || SITE.name;
  const user = h(
    'p',
    { class: 'dc-user' },
    h('span', {}, `@${p?.discord_user.username ?? SITE.handle}`),
    h('span', { class: 'dc-status', 'data-status': status }, h('span', { class: 'dot' }), STATUS_LABEL[status]),
  );

  const body = h('div', { class: 'dc-body' }, avatar, h('h2', { class: 'dc-name' }, name), user);

  const custom = p ? customStatus(p) : null;
  if (custom && (custom.state || custom.emoji)) {
    const bubble = h('div', { class: 'custom-status' });
    if (custom.emoji) {
      const url = emojiUrl(custom.emoji);
      bubble.append(url ? h('img', { src: url, alt: `:${custom.emoji.name}:`, width: 16, height: 16 }) : h('span', {}, custom.emoji.name));
    }
    if (custom.state) bubble.append(h('span', {}, custom.state));
    body.append(bubble);
  }

  if (prof?.bio) body.append(h('div', { class: 'dc-section' }, h('h3', {}, 'about me'), h('p', { class: 'dc-bio' }, prof.bio)));

  const acts = p ? mainActivities(p) : [];
  const spotify = p?.listening_to_spotify && p.spotify ? p.spotify : null;
  if (acts.length || spotify) {
    const section = h('div', { class: 'dc-section' }, h('h3', {}, 'activity'));
    for (const a of acts) section.append(activityRow(a));
    if (spotify) {
      section.append(
        activityRow({
          id: 'spotify',
          name: spotify.song,
          type: 2,
          details: spotify.artist.replace(/; /g, ', '),
          state: spotify.album,
          timestamps: { end: spotify.timestamps.end },
          assets: spotify.album_art_url ? { large_image: `spotify:${spotify.album_art_url.split('/').pop()}` } : undefined,
        }),
      );
    }
    body.append(section);
  } else {
    body.append(h('div', { class: 'dc-section' }, h('h3', {}, 'activity'), h('p', { class: 'act-quiet' }, p ? 'nothing going on right now' : 'presence unavailable')));
  }

  const connLabel = { live: 'lanyard · live', polling: 'lanyard · rest', connecting: 'lanyard · connecting', unavailable: 'lanyard · offline' }[s.lanyard];
  body.append(
    h(
      'div',
      { class: 'dc-foot' },
      h('span', { class: 'conn', 'data-conn': s.lanyard }, connLabel),
      h('a', { href: LINKS.discord, target: '_blank', rel: 'noopener' }, 'open in discord ↗'),
    ),
  );

  card.replaceChildren(banner, body);
}

/* ---------------- elsewhere ---------------- */

const ELSEWHERE: { key: 'github' | 'discord' | 'x' | 'steam'; label: string; href: string; icon: IconName; brand: string }[] = [
  { key: 'github', label: 'GitHub', href: LINKS.github, icon: 'github', brand: '#e8eaee' },
  { key: 'discord', label: 'Discord', href: LINKS.discord, icon: 'discord', brand: '#8b96ff' },
  { key: 'x', label: 'X', href: LINKS.x, icon: 'x', brand: '#ffffff' },
  { key: 'steam', label: 'Steam', href: LINKS.steam, icon: 'steam', brand: '#8fc6ff' },
];

function renderElsewhere(s: State) {
  const ul = $('[data-elsewhere]')!;
  ul.replaceChildren(
    ...ELSEWHERE.map((e) => {
      const p = preview(e.key, s);
      const ico = h('span', { class: 'l-ico' });
      ico.append(svg(icons[e.icon]));
      const arrow = h('span', { class: 'ico arrow', 'aria-hidden': 'true' });
      arrow.append(svg(icons.arrow));
      const a = h(
        'a',
        { href: e.href, target: '_blank', rel: 'noopener me', style: `--brand:${e.brand}` },
        ico,
        h('span', {}, h('strong', {}, e.label), h('small', {}, `${p.handle} · ${p.lines[0]}`)),
        arrow,
      );
      return h('li', {}, a);
    }),
  );
}

/* ---------------- steam ---------------- */

function renderSteam(s: State) {
  const card = $('[data-steam-card]')!;
  const head = h('header', { class: 'card-head' });
  const title = h('h2', {});
  const ico = h('span', { class: 'ico' });
  ico.append(svg(icons.steam));
  title.append(ico, 'Steam');
  head.append(title);

  const st = s.steam;
  let content: Node;
  if (st.status === 'loading') content = h('p', { class: 'muted-note mono' }, '…');
  else if (st.status === 'ok' && st.data.configured && st.data.profile) {
    const prof = st.data.profile;
    const stateText = prof.game ? `in-game: ${prof.game}` : ['offline', 'online', 'busy', 'away', 'snooze', 'trading', 'looking to play'][prof.state] ?? 'offline';
    const wrap = h(
      'div',
      {},
      h(
        'a',
        { class: 'steam-profile', href: prof.url, target: '_blank', rel: 'noopener' },
        h('img', { src: prof.avatar, alt: '', width: 44, height: 44, loading: 'lazy' }),
        h('span', {}, h('strong', {}, prof.name), h('small', { class: prof.game ? 'ingame' : '' }, stateText)),
      ),
    );
    const games = st.data.recent ?? [];
    if (games.length) {
      wrap.append(
        h(
          'ul',
          { class: 'games', 'aria-label': 'Recently played on Steam' },
          ...games.map((g) =>
            h(
              'li',
              {},
              g.icon ? h('img', { src: g.icon, alt: '', width: 28, height: 28, loading: 'lazy' }) : h('span', { class: 'g-fallback' }),
              h('span', {}, g.name),
              h('span', { class: 'mono' }, `${(g.minutes2w / 60).toFixed(1)}h / 2w`),
            ),
          ),
        ),
      );
    }
    content = wrap;
  } else {
    const link = h('a', { href: LINKS.steam, target: '_blank', rel: 'noopener' }, 'steamcommunity.com/id/hikemu');
    content = h('p', { class: 'muted-note' }, 'a backlog that grows faster than my free time. ', link);
  }
  card.replaceChildren(head, content);
}

let steamStarted = false;
function loadSteam() {
  if (steamStarted) return;
  steamStarted = true;
  getJSON<SteamResponse>('/api/steam')
    .then((data) => {
      if (typeof data?.configured !== 'boolean') throw new Error('bad payload');
      set('steam', { status: 'ok', data });
    })
    .catch(() => set('steam', { status: 'error' }));
}

/* ---------------- small details ---------------- */

function renderDetails() {
  const dl = $('[data-details]')!;
  const row = (k: string, v: Node | string) => [h('dt', {}, k), h('dd', {}, v)];

  const copy = h('button', { class: 'copy', type: 'button', 'aria-label': `Copy Discord ID ${SITE.discordId}` });
  const ico = h('span', { class: 'ico' });
  ico.append(svg(icons.copy));
  copy.append(SITE.discordId, ico);
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(SITE.discordId);
      copy.classList.add('done');
      ico.replaceChildren(svg(icons.check));
      window.setTimeout(() => {
        copy.classList.remove('done');
        ico.replaceChildren(svg(icons.copy));
      }, 1600);
    } catch {
      /* clipboard blocked; the id is selectable text anyway */
    }
  });

  const localTime = h('span', { 'data-local-time': true });
  const presence = h('span', { 'data-presence-conn': true });

  dl.replaceChildren(
    ...row('os', 'linux (obviously)'),
    ...row('local time', localTime),
    ...row('discord id', copy),
    ...row('presence', presence),
    ...row('music', 'spotify → discord → lanyard → here'),
    ...row('this site', 'vite + vanilla ts, no framework'),
    ...row('tracking', 'none. no cookies either.'),
    ...row('motto', SITE.tagline),
  );

  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: SITE.timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  tick((now) => setText(localTime, `${fmt.format(now)} (${SITE.timezone.split('/').pop()!.replace('_', ' ').toLowerCase()})`));
  watch(['lanyard'], (s) =>
    setText(presence, { live: 'websocket, live', polling: 'rest fallback', connecting: 'connecting…', unavailable: 'unavailable' }[s.lanyard]),
  );
}

/* ---------------- */

let ready = false;

/** Built lazily the first time someone opens /more. */
export function initMore() {
  if (ready) return;
  ready = true;
  renderDetails();
  watch(['presence', 'lanyard', 'discordProfile'], renderDiscord);
  watch(['presence', 'lanyard', 'repos', 'steam'], renderElsewhere);
  watch(['steam'], renderSteam);
  loadSteam();
}

export { loadSteam };
