import { SITE } from '../../shared/config';
import { reposUrl, trimRepo } from '../../shared/github';
import type { Repo, ReposResponse } from '../../shared/types';
import { $, getJSON, h } from '../lib/dom';
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

/** Repos via our cached proxy; if that's unavailable, straight from GitHub. */
export function loadRepos(): void {
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

/** Own work, newest push first. */
export function visibleRepos(): Repo[] {
  const s = getState().repos;
  if (s.status !== 'ok') return [];
  return s.data.repos.filter((r) => !r.fork).sort((a, b) => Date.parse(b.pushedAt) - Date.parse(a.pushedAt));
}

function repoTile(r: Repo, i: number) {
  const meta = h('div', { class: 'repo-meta' });
  if (r.language) meta.append(h('span', {}, h('span', { class: 'lang-dot', style: `--lang:${LANG[r.language] ?? '#8b95a7'}` }), r.language));
  if (r.stars) meta.append(h('span', { title: `${r.stars} stars` }, h('span', { class: 'nf', 'aria-hidden': 'true' }, ''), compact(r.stars)));
  if (r.forks) meta.append(h('span', { title: `${r.forks} forks` }, h('span', { class: 'nf', 'aria-hidden': 'true' }, ''), compact(r.forks)));
  meta.append(h('span', { title: new Date(r.pushedAt).toLocaleString() }, ago(r.pushedAt)));
  if (r.archived) meta.append(h('span', { class: 'tag' }, 'archived'));

  return h(
    'li',
    { class: 'repo', style: `--i:${i}` },
    h(
      'div',
      { class: 'repo-top' },
      h('a', { class: 'repo-name', href: r.url, target: '_blank', rel: 'noopener' }, h('span', { class: 'nf', 'aria-hidden': 'true' }, ''), h('span', {}, r.name)),
      h('span', { class: 'nf arrow', 'aria-hidden': 'true' }, ''),
    ),
    h('p', { class: `repo-desc${r.description ? '' : ' none'}`, title: r.description ?? '' }, r.description ?? 'no description. it does something, probably.'),
    meta,
  );
}

function render() {
  const list = $('[data-repos]')!;
  const summary = $('[data-repo-summary]');
  const s = getState().repos;

  if (s.status === 'loading') {
    list.replaceChildren(...Array.from({ length: 3 }, () => h('li', { class: 'repo-skel', 'aria-hidden': 'true' })));
    return;
  }
  if (s.status === 'error') {
    list.replaceChildren(
      h('li', { class: 'notice' }, "github isn't answering right now. ", h('a', { href: `https://github.com/${SITE.github}?tab=repositories`, target: '_blank', rel: 'noopener' }, 'see them there →')),
    );
    return;
  }
  const repos = visibleRepos();
  if (!repos.length) {
    list.replaceChildren(h('li', { class: 'notice' }, 'nothing public yet. something is definitely cooking though.'));
    return;
  }
  list.replaceChildren(...repos.slice(0, SHOWN).map(repoTile));
  if (summary) {
    const more = repos.length > SHOWN ? ` · +${repos.length - SHOWN} more` : '';
    summary.textContent = `${repos.length} repos${more}`;
  }
}

export function initProjects() {
  watch(['repos'], render);
  // below the fold: fetch once it's about to be seen (or soon after load, for the github tooltip)
  const target = $('[data-repos]');
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    loadRepos();
  };
  if (target && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && (io.disconnect(), start()), { rootMargin: '400px' });
    io.observe(target);
  }
  window.setTimeout(start, 2500);
}
