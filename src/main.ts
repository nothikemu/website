import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/profile.css';
import './styles/now.css';
import './styles/about.css';
import './styles/streams.css';
import './styles/projects.css';
import './styles/sakamoto.css';
import './styles/motion.css';

import { $, $$, reducedMotion, setText, svg } from './lib/dom';
import { icons, type IconName } from './lib/icons';
import { initAbout } from './views/about';
import { initMusic } from './views/music';
import { initProfile } from './views/profile';
import { initProjects } from './views/projects';
import { initSakamoto } from './views/sakamoto';
import { initStreams } from './views/streams';

for (const el of $$('[data-icon]')) {
  const name = el.dataset.icon as IconName;
  if (icons[name]) el.replaceChildren(svg(icons[name]));
}
setText($('[data-year]'), String(new Date().getFullYear()));

initSakamoto();
initProfile();
initMusic();
initStreams();
initAbout();
initProjects();

/* Pointer position for the two user-driven effects: banner parallax and Sakamoto's eyes.
   Fine pointers only, one write per frame, nothing under reduced motion. */
if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
  const root = document.documentElement;
  let frame = 0;
  let x = 0;
  let y = 0;
  addEventListener(
    'pointermove',
    (e) => {
      x = (e.clientX / innerWidth) * 2 - 1;
      y = (e.clientY / innerHeight) * 2 - 1;
      if (frame || reducedMotion()) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        root.style.setProperty('--px', x.toFixed(3));
        root.style.setProperty('--py', y.toFixed(3));
      });
    },
    { passive: true },
  );
}

console.log('%c hikemu %c computers used to feel like magic. say hi to sakamoto-san.', 'color:#b3beff;font-weight:600', 'color:#8a91a3');
