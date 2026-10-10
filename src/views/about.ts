import { LINKS, SITE } from '../../shared/config';
import type { SteamResponse } from '../../shared/types';
import { $, getJSON, h, setText, svg } from '../lib/dom';
import { icons } from '../lib/icons';
import { mainActivities, STATUS_LABEL } from '../lib/lanyard';
import { set, watch, type State } from '../lib/store';
import { tick } from '../lib/ticker';
import { ago, duration } from '../lib/time';
import { visibleRepos } from './projects';

type Key = 'github' | 'discord' | 'x' | 'steam';

const SOCIALS: { key: Key; action: string; href: string }[] = [
  { key: 'github', action: 'Open GitHub profile', href: LINKS.github },
  { key: 'discord', action: 'Open Discord profile', href: LINKS.discord },
  { key: 'x', action: 'Open X profile', href: LINKS.x },
  { key: 'steam', action: 'Open Steam profile', href: LINKS.steam },
];

/** What each tooltip says beyond its action, from live state. */
function details(key: Key, s: State): { handle: string; lines: string[]; status?: string } {
  switch (key) {
    case 'github': {
      const repos = visibleRepos();
      if (s.repos.status !== 'ok') return { handle: `@${SITE.github}`, lines: [] };
      const latest = repos[0];
      return {
        handle: `@${SITE.github}`,
        lines: [`${repos.length} public ${repos.length === 1 ? 'repo' : 'repos'}`, ...(latest ? [`last push to ${latest.name}, ${ago(latest.pushedAt)}`] : [])],
      };
    }
    case 'discord': {
      const p = s.presence;
      if (!p) return { handle: `@${SITE.handle}`, lines: [s.lanyard === 'connecting' ? 'checking presence' : 'presence unavailable'], status: 'offline' };
      const act = mainActivities(p)[0];
      const lines = [STATUS_LABEL[p.discord_status]];
      if (p.listening_to_spotify && p.spotify) lines.push(`listening to ${p.spotify.song}`);
      else if (act) lines.push(`${act.type === 3 ? 'watching' : act.type === 2 ? 'listening to' : 'playing'} ${act.name}`);
      return { handle: `@${p.discord_user.username}`, lines, status: p.discord_status };
    }
    case 'x':
      return { handle: `@${SITE.x}`, lines: ['posts sometimes, lurks always'] };
    case 'steam': {
      const prof = s.steam.status === 'ok' ? s.steam.data.profile : undefined;
      const recent = s.steam.status === 'ok' ? s.steam.data.recent?.[0] : undefined;
      if (!prof) return { handle: SITE.steamVanity, lines: [] };
      return {
        handle: prof.name,
        lines: [prof.game ? `playing ${prof.game}` : prof.state ? 'online' : 'offline', ...(recent && !prof.game ? [`recently: ${recent.name}`] : [])],
      };
    }
  }
}

function initSocials() {
  const ul = $('[data-socials]')!;
  const tips = new Map<Key, HTMLElement>();
  for (const s of SOCIALS) {
    const tipId = `tip-${s.key}`;
    const a = h('a', { class: 'icon-btn', href: s.href, target: '_blank', rel: 'noopener me', 'aria-label': s.action, 'aria-describedby': tipId });
    a.append(svg(icons[s.key]));
    const tip = h('span', { class: 'tip', role: 'tooltip', id: tipId });
    tips.set(s.key, tip);
    const li = h('li', { class: 'has-tip', 'data-key': s.key }, a, tip);
    if (s.key === 'discord') li.append(h('span', { class: 'badge', 'data-status-dot': true, 'data-status': 'offline', 'aria-hidden': 'true' }));
    ul.append(li);
  }

  watch(['presence', 'lanyard', 'repos', 'steam'], (state) => {
    for (const s of SOCIALS) {
      const d = details(s.key, state);
      tips.get(s.key)!.replaceChildren(
        h('strong', {}, d.status ? h('span', { class: 'dot', 'data-status': d.status }) : null, s.action),
        h('span', {}, d.handle),
        ...d.lines.map((l) => h('span', {}, l)),
      );
    }
  });

  // Steam lives only in its tooltip, so only ask for it when someone shows interest
  const steam = ul.querySelector('[data-key="steam"]')!;
  let asked = false;
  const ask = () => {
    if (asked) return;
    asked = true;
    getJSON<SteamResponse>('/api/steam')
      .then((data) => {
        if (typeof data?.configured !== 'boolean') throw new Error('unexpected response');
        set('steam', { status: 'ok', data });
      })
      .catch(() => set('steam', { status: 'error' }));
  };
  steam.addEventListener('pointerenter', ask);
  steam.addEventListener('focusin', ask);
}

export function initAbout() {
  initSocials();
  // "here for 00:42": the only stat this site keeps, and it never leaves your tab
  const arrived = Date.now();
  const here = $('[data-here]');
  tick((now) => setText(here, duration(now - arrived).padStart(5, '0')));
}
