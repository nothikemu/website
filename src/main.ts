import '@fontsource-variable/geist';
import '@fontsource-variable/jetbrains-mono';
import './styles/main.css';

import { $$, reducedMotion, setText, svg } from './lib/dom';
import { icons, type IconName } from './lib/icons';
import { initRouter, onRoute, current } from './lib/router';
import { tick } from './lib/ticker';
import { duration } from './lib/time';
import { initCraft, loadRepos } from './views/craft';
import { initMore, loadSteam } from './views/more';
import { initMusic } from './views/music';
import { initPresence } from './views/presence';
import { initSocials } from './views/socials';

/* static icons declared in markup as data-icon="name" */
for (const el of $$('[data-icon]')) {
  const name = el.dataset.icon as IconName;
  if (icons[name]) el.replaceChildren(svg(icons[name]));
}
setText(document.querySelector('[data-year]'), String(new Date().getFullYear()));

// "you've been here 00:42": the only stat this site keeps, and it never leaves your tab
const arrived = Date.now();
const here = document.querySelector('[data-here]');
tick((now) => setText(here, duration(now - arrived).padStart(5, '0')));

initRouter();
initPresence();
initMusic();
initSocials();
initCraft();

const lazyFor = (route: string) => {
  if (route === 'craft') loadRepos();
  if (route === 'more') {
    loadRepos();
    initMore();
  }
};
onRoute(lazyFor);
lazyFor(current);

// Non-critical data (powers hover previews) once the page has settled.
const idle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 1200));
idle(() => {
  loadRepos();
  loadSteam();
});

/* ---------------- pointer effects (fine pointers only, rAF-throttled) ---------------- */

if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
  const root = document.documentElement;
  let frame = 0;
  let px = 0;
  let py = 0;
  let target: HTMLElement | null = null;
  let tx = 0;
  let ty = 0;

  addEventListener(
    'pointermove',
    (e) => {
      px = (e.clientX / innerWidth) * 2 - 1;
      py = (e.clientY / innerHeight) * 2 - 1;
      target = (e.target as Element).closest?.<HTMLElement>('.card') ?? null;
      tx = e.clientX;
      ty = e.clientY;
      if (!frame) frame = requestAnimationFrame(paint);
    },
    { passive: true },
  );

  function paint() {
    frame = 0;
    if (!reducedMotion()) {
      root.style.setProperty('--px', px.toFixed(3));
      root.style.setProperty('--py', py.toFixed(3));
    }
    if (target) {
      const r = target.getBoundingClientRect();
      target.style.setProperty('--mx', `${tx - r.left}px`);
      target.style.setProperty('--my', `${ty - r.top}px`);
    }
  }
}

/* a tiny hello for whoever opens devtools */
console.log('%c✦ hikemu %c computers used to feel like magic.', 'color:#a9b8ff;font-weight:700', 'color:#8b95a7');
