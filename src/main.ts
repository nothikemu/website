import './styles/main.css';
import sakamoto from './assets/sakamoto.svg?raw';

import { $, $$, reducedMotion, setText, svg } from './lib/dom';
import { icons, type IconName } from './lib/icons';
import { tick } from './lib/ticker';
import { duration } from './lib/time';
import { initMusic } from './views/music';
import { initPresence } from './views/presence';
import { initProjects } from './views/projects';
import { initSocials } from './views/socials';

/* static svg icons declared in markup as data-icon="name" */
for (const el of $$('[data-icon]')) {
  const name = el.dataset.icon as IconName;
  if (icons[name]) el.replaceChildren(svg(icons[name]));
}

/* sakamoto-san: once on the streams card, once as a faint sticker behind About Me */
const mascot = $('[data-mascot]');
if (mascot) mascot.replaceChildren(svg(sakamoto));
const sticker = $('[data-cat-watermark]');
if (sticker) sticker.replaceChildren(svg(sakamoto.replace(/sk-(fur|scarf)\b/g, 'skw-$1')));

setText($('[data-year]'), String(new Date().getFullYear()));

// "here for 00:42": the only stat this site keeps, and it never leaves your tab
const arrived = Date.now();
const here = $('[data-here]');
tick((now) => setText(here, duration(now - arrived).padStart(5, '0')));

initPresence();
initMusic();
initSocials();
initProjects();

/* ---------------- pointer effects (fine pointers only, rAF-throttled) ---------------- */

if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
  const root = document.documentElement;
  let frame = 0;
  let px = 0;
  let py = 0;
  let target: HTMLElement | null = null;
  let tx = 0;
  let ty = 0;

  const paint = () => {
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
  };

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
}

console.log('%c hikemu %c computers used to feel like magic. say hi to sakamoto-san.', 'color:#aab8ff;font-weight:700', 'color:#8b95a7');
