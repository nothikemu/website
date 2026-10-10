import { SITE } from '../../shared/config';
import { reposUrl, trimRepo } from '../../shared/github';
import type { Repo, ReposResponse } from '../../shared/types';
import { $, afterDelay, getJSON, h, nf, setText } from '../lib/dom';
import { getState, set, watch } from '../lib/store';
import { ago, compact } from '../lib/time';

const LANG: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572a5',
  Rust: '#dea584',
  Go: '#00add8',
  C: '#8d93a5',
  'C++': '#f34b7d',
  'C#': '#178600',
  Java: '#b07219',
  Kotlin: '#a97bff',
  Swift: '#f05138',
  Lua: '#6a72d8',
  Shell: '#89e051',
  HTML: '#e34c26',
  CSS: '#663399',
  Vue: '#41b883',
  Svelte: '#ff3e00',
  Nix: '#7e7eff',
  Zig: '#ec915c',
  Ruby: '#d1394b',
  PHP: '#7a86b8',
  Dart: '#00b4ab',
  Haskell: '#7d74a8',
  Assembly: '#a17fd4',
};

const SHOWN = 6;
const PROFILE = `https://github.com/${SITE.github}?tab=repositories`;

/** Repos via the cached proxy; straight from GitHub if the proxy isn't there. */
export function loadRepos(): void {
  set('repos', { status: 'loading' });
  getJSON<ReposResponse>('/api/github')
    .then((d) => {
      if (!Array.isArray(d?.repos)) throw new Error('proxy unavailable');
      return d;
    })
    .catch(async () => {
      const raw = await getJSON<unknown[]>(reposUrl(SITE.github), { headers: { Accept: 'application/vnd.github+json' } });
      if (!Array.isArray(raw)) throw new Error('github unavailable');
      return { user: SITE.github, repos: raw.map(trimRepo) };
    })
    .then((data) => set('repos', { status: 'ok', data }))
    .catch(() => set('repos', { status: 'error' }));
}

/** hikemu's own work, newest push first. */
export function visibleRepos(): Repo[] {
  const s = getState().repos;
  if (s.status !== 'ok') return [];
  return s.data.repos.filter((r) => !r.fork).sort((a, b) => Date.parse(b.pushedAt) - Date.parse(a.pushedAt));
}

function row(r: Repo) {
  return h(
    'li',
    { class: 'repo' },
    h('a', { class: 'repo-name', href: r.url, target: '_blank', rel: 'noopener' }, nf(''), h('span', {}, r.name)),
    h('p', { class: `repo-desc${r.description ? '' : ' none'}` }, r.description ?? 'no description. it does something, probably.'),
    h('span', { class: 'repo-lang' }, r.language ? h('span', { class: 'lang-dot', style: `--lang:${LANG[r.language] ?? 'var(--dusk)'}` }) : null, r.language ?? ''),
    h('span', { class: 'repo-stars' }, r.stars ? nf('') : null, r.stars ? h('span', { 'aria-label': `${r.stars} stars` }, compact(r.stars)) : ''),
    h('time', { class: 'repo-when', datetime: r.pushedAt }, ago(r.pushedAt)),
    nf('\uF08E', 'repo-go'),
  );
}

function stateRow(title: string, body: string, ...actions: HTMLElement[]) {
  return h('li', { class: 'state' }, h('h3', {}, title), h('p', {}, body), h('div', { class: 'actions' }, ...actions));
}

const profileLink = () => h('a', { class: 'btn', href: PROFILE, target: '_blank', rel: 'noopener' }, 'Open GitHub profile');

function render() {
  const list = $('[data-repos]')!;
  const s = getState().repos;
  list.setAttribute('aria-busy', String(s.status === 'loading'));

  if (s.status === 'loading') {
    afterDelay(150, () => getState().repos.status === 'loading', () =>
      list.replaceChildren(
        ...Array.from({ length: 3 }, () => h('li', { class: 'skel', 'aria-hidden': 'true' }, h('span', { class: 'lines' }, h('i', { style: 'width:30%' }), h('i', { style: 'width:70%' })))),
      ),
    );
    return;
  }
  if (s.status === 'error') {
    const retry = h('button', { class: 'btn', type: 'button' }, 'Try again');
    retry.addEventListener('click', loadRepos);
    list.replaceChildren(stateRow("Couldn't load projects", 'GitHub didn’t answer. Try again, or browse them on GitHub.', retry, profileLink()));
    return;
  }
  const repos = visibleRepos();
  if (!repos.length) {
    list.replaceChildren(stateRow('No public projects yet', 'Something is definitely cooking. Follow along on GitHub.', profileLink()));
    return;
  }
  list.replaceChildren(...repos.slice(0, SHOWN).map(row));
  setText($('[data-repo-summary]'), repos.length > SHOWN ? `View all ${repos.length} on GitHub` : 'View all on GitHub');
}

export function initProjects() {
  watch(['repos'], render);
  // below the fold: fetch as it approaches the viewport (or soon after load, for the GitHub tooltip)
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    loadRepos();
  };
  const target = $('[data-repos]');
  if (target && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        start();
      }
    }, { rootMargin: '400px' });
    io.observe(target);
  }
  window.setTimeout(start, 2500);
}
