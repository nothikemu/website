import { SITE } from '../../shared/config';
import { reposUrl, trimRepo } from '../../shared/github';
import type { Repo, ReposResponse } from '../../shared/types';
import { $, getJSON, h, svg } from '../lib/dom';
import { icons } from '../lib/icons';
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
  SCSS: '#c6538c',
  Vue: '#41b883',
  Svelte: '#ff3e00',
  Nix: '#7e7eff',
  Zig: '#ec915c',
  Dockerfile: '#384d54',
  Makefile: '#427819',
  Ruby: '#d1394b',
  PHP: '#7a86b8',
  Dart: '#00b4ab',
  Elixir: '#8e6fb3',
  Haskell: '#7d74a8',
  Assembly: '#a17fd4',
};

let started = false;

/** Repos via our cached proxy; if that's missing (e.g. static preview), straight from GitHub. */
export function loadRepos(): void {
  if (started) return;
  started = true;
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

/** Own work first: no forks, newest push first. The site's own repo is allowed to show up too. */
export function visibleRepos(): Repo[] {
  const s = getState().repos;
  if (s.status !== 'ok') return [];
  return s.data.repos.filter((r) => !r.fork).sort((a, b) => +new Date(b.pushedAt) - +new Date(a.pushedAt));
}

function repoCard(r: Repo, i: number, featured: boolean) {
  const name = h('a', { class: 'repo-name', href: r.url, target: '_blank', rel: 'noopener' });
  const gh = h('span', { class: 'ico' });
  gh.append(svg(icons.github));
  name.append(gh, h('span', {}, r.name));
  const arrow = h('span', { class: 'ico arrow', 'aria-hidden': 'true' });
  arrow.append(svg(icons.arrow));

  const meta = h('div', { class: 'repo-meta' });
  if (r.language) {
    const dot = h('span', { class: 'lang-dot', style: `--lang:${LANG[r.language] ?? '#8b95a7'}` });
    meta.append(h('span', {}, dot, r.language));
  }
  if (r.stars) {
    const s = h('span', { title: `${r.stars} stars` });
    s.append(svg(icons.star), compact(r.stars));
    meta.append(s);
  }
  if (r.forks) {
    const f = h('span', { title: `${r.forks} forks` });
    f.append(svg(icons.fork), compact(r.forks));
    meta.append(f);
  }
  meta.append(h('span', { title: new Date(r.pushedAt).toLocaleString() }, `updated ${ago(r.pushedAt)}`));
  if (r.archived) meta.append(h('span', { class: 'tag' }, 'archived'));
  if (featured) meta.append(h('span', { class: 'tag' }, 'latest'));

  return h(
    'article',
    { class: `card repo${featured ? ' featured' : ''}`, style: `--i:${Math.min(i, 10)}` },
    h('div', { class: 'repo-top' }, name, arrow),
    h('p', { class: `repo-desc${r.description ? '' : ' none'}` }, r.description ?? 'no description. it does something, probably.'),
    r.topics.length ? h('div', { class: 'topics' }, ...r.topics.slice(0, 5).map((t) => h('span', {}, t))) : null,
    meta,
  );
}

function render() {
  const grid = $('[data-repos]')!;
  const stats = $('[data-craft-stats]')!;
  const s = getState().repos;

  if (s.status === 'loading') {
    grid.replaceChildren(...Array.from({ length: 6 }, () => h('div', { class: 'repo-skel', 'aria-hidden': 'true' })));
    grid.setAttribute('aria-busy', 'true');
    return;
  }
  grid.removeAttribute('aria-busy');

  if (s.status === 'error') {
    const link = h('a', { href: `https://github.com/${SITE.github}?tab=repositories`, target: '_blank', rel: 'noopener' }, 'see them on github →');
    grid.replaceChildren(h('div', { class: 'card notice' }, h('p', {}, "github isn't answering right now. "), link));
    stats.replaceChildren();
    return;
  }

  const repos = visibleRepos();
  if (!repos.length) {
    grid.replaceChildren(h('div', { class: 'card notice' }, h('p', {}, 'nothing public yet. something is definitely cooking though.')));
  } else {
    grid.replaceChildren(...repos.map((r, i) => repoCard(r, i, i === 0 && repos.length > 2)));
  }

  const stars = repos.reduce((n, r) => n + r.stars, 0);
  const langs = new Set(repos.map((r) => r.language).filter(Boolean)).size;
  const stat = (label: string, value: string) => h('div', {}, h('dt', {}, label), h('dd', {}, value));
  stats.replaceChildren(
    stat('repos', String(repos.length)),
    stat('stars', compact(stars)),
    stat('languages', String(langs)),
    stat('last push', repos[0] ? ago(repos[0].pushedAt).replace(' ago', '') : '—'),
  );
}

export function initCraft() {
  watch(['repos'], render);
}
