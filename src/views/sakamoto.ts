import sakamoto from '../assets/sakamoto.svg?raw';
import { $, reducedMotion, svg } from '../lib/dom';
import { watch } from '../lib/store';

/**
 * Sakamoto-san (fan art) sits on Recent Streams.
 * asleep    nothing is playing (hover wakes him)
 * awake     paused
 * listening a song is playing: music notes drift up
 * His eyes follow the pointer (see main.ts) and he blinks now and then while on screen.
 */
export function initSakamoto() {
  const host = $('[data-sakamoto]');
  if (!host) return;
  host.replaceChildren(svg(sakamoto));

  watch(['now'], ({ now }) => {
    host.dataset.mood = !now ? 'asleep' : now.paused ? 'awake' : 'listening';
  });

  let visible = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => (visible = entries[0]?.isIntersecting ?? true)).observe(host);
  }
  const blink = () => {
    if (visible && !document.hidden && host.dataset.mood !== 'asleep' && !reducedMotion()) {
      host.classList.add('blink');
      window.setTimeout(() => host.classList.remove('blink'), 150);
    }
    window.setTimeout(blink, 4000 + Math.random() * 5000);
  };
  window.setTimeout(blink, 3000);
}
