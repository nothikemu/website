import { LINKS, SITE } from '../../shared/config';
import type { SteamResponse } from '../../shared/types';
import { $, getJSON, h, svg } from '../lib/dom';
import { icons, type IconName } from '../lib/icons';
import { mainActivities, STATUS_LABEL } from '../lib/lanyard';
import { set, watch, type State } from '../lib/store';
import { ago } from '../lib/time';
import { visibleRepos } from './projects';

type Key = 'github' | 'discord' | 'x' | 'steam';

const SOCIALS: { key: Key; label: string; href: string; icon: IconName }[] = [
  { key: 'github', label: 'GitHub', href: LINKS.github, icon: 'github' },
  { key: 'discord', label: 'Discord', href: LINKS.discord, icon: 'discord' },
  { key: 'x', label: 'X', href: LINKS.x, icon: 'x' },
  { key: 'steam', label: 'Steam', href: LINKS.steam, icon: 'steam' },
];

/** The tooltip body for each platform, derived from live state. */
export function preview(key: Key, s: State): { title: string; handle: string; lines: string[]; status?: string } {
  switch (key) {
    case 'github': {
      const repos = visibleRepos();
      const latest = repos[0];
      return {
        title: 'GitHub',
        handle: `@${SITE.github}`,
        lines:
          s.repos.status === 'ok'
            ? [`${repos.length} public repos`, latest ? `pushed to ${latest.name} ${ago(latest.pushedAt)}` : 'nothing pushed yet']
            : s.repos.status === 'error'
              ? ['repos are over there →']
              : ['peeking at repos…'],
      };
    }
    case 'discord': {
      const p = s.presence;
      const act = p ? mainActivities(p)[0] : undefined;
      const lines = p ? [STATUS_LABEL[p.discord_status]] : [s.lanyard === 'connecting' ? 'connecting…' : 'presence unavailable'];
      if (p?.listening_to_spotify && p.spotify) lines.push(`♪ ${p.spotify.song}`);
      else if (act) lines.push(`${act.type === 3 ? 'watching' : act.type === 2 ? 'listening to' : 'playing'} ${act.name}`);
      return { title: 'Discord', handle: p ? `@${p.discord_user.username}` : SITE.handle, lines, status: p?.discord_status ?? 'offline' };
    }
    case 'x':
      return { title: 'X', handle: `@${SITE.x}`, lines: ['posts occasionally, lurks constantly'] };
    case 'steam': {
      const st = s.steam.status === 'ok' ? s.steam.data : null;
      const prof = st?.profile;
      const lines = prof
        ? [prof.game ? `in-game: ${prof.game}` : prof.state ? 'online' : 'offline', ...(st?.recent?.[0] ? [`recently: ${st.recent[0].name}`] : [])]
        : ['games, mostly unfinished ones'];
      return { title: 'Steam', handle: SITE.steamVanity, lines };
    }
  }
}

function fill(tip: HTMLElement, key: Key, s: State) {
  const p = preview(key, s);
  const head = h('strong', {}, p.status ? h('span', { class: 'dot', 'data-status': p.status }) : null, p.title);
  tip.replaceChildren(head, h('span', { class: 'handle-line' }, p.handle), ...p.lines.map((l) => h('span', { class: 'tip-line' }, l)));
}

export function initSocials() {
  const ul = $('[data-socials]')!;
  const tips = new Map<Key, HTMLElement>();
  for (const s of SOCIALS) {
    const tipId = `tip-${s.key}`;
    const a = h('a', { href: s.href, target: '_blank', rel: 'noopener me', 'aria-label': s.label, 'aria-describedby': tipId });
    a.append(svg(icons[s.icon]));
    const tip = h('span', { class: 'tip', role: 'tooltip', id: tipId });
    tips.set(s.key, tip);
    const li = h('li', { class: 'social', 'data-key': s.key }, a, tip);
    if (s.key === 'discord') li.append(h('span', { class: 'badge', 'data-status-dot': true, 'data-status': 'offline', 'aria-hidden': 'true' }));
    ul.append(li);
  }
  watch(['presence', 'lanyard', 'repos', 'steam'], (s) => tips.forEach((tip, key) => fill(tip, key, s)));

  // steam presence only lives in its tooltip; fetch it when someone shows interest
  const steam = ul.querySelector('[data-key="steam"]');
  let asked = false;
  const ask = () => {
    if (asked) return;
    asked = true;
    getJSON<SteamResponse>('/api/steam')
      .then((data) => {
        if (typeof data?.configured !== 'boolean') throw new Error('bad payload');
        set('steam', { status: 'ok', data });
      })
      .catch(() => set('steam', { status: 'error' }));
  };
  steam?.addEventListener('pointerenter', ask);
  steam?.addEventListener('focusin', ask);
}
