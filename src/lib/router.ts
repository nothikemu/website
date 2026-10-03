import { $, $$, reducedMotion } from './dom';

export type Route = 'home' | 'craft' | 'more';
const PATHS: Record<string, Route> = { '/': 'home', '/craft': 'craft', '/more': 'more' };
const TITLES: Record<Route, string> = { home: 'hikemu', craft: 'craft · hikemu', more: 'more · hikemu' };

const listeners: ((r: Route) => void)[] = [];
export const onRoute = (fn: (r: Route) => void) => listeners.push(fn);

const routeFromPath = (path: string): Route => PATHS[path.replace(/\/+$/, '') || '/'] ?? 'home';
export let current: Route = routeFromPath(location.pathname);

function movePill() {
  const nav = $('.nav');
  const active = $(`.nav a[data-route="${current}"]`);
  if (!nav || !active) return;
  nav.style.setProperty('--pill-x', `${active.offsetLeft}px`);
  nav.style.setProperty('--pill-w', `${active.offsetWidth}px`);
}

function apply(route: Route, focus: boolean) {
  current = route;
  for (const view of $$('[data-view]')) view.hidden = view.dataset.view !== route;
  for (const a of $$('.nav a[data-route]')) {
    if (a.dataset.route === route) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  document.title = TITLES[route];
  movePill();
  if (focus) {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    $<HTMLElement>(`[data-view="${route}"] h1`)?.focus({ preventScroll: true });
  }
  listeners.forEach((fn) => fn(route));
}

export function navigate(path: string, push = true) {
  const route = routeFromPath(path);
  if (push && location.pathname !== path) history.pushState({}, '', path);
  if (route === current && push) return;
  const swap = () => apply(route, true);
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (doc.startViewTransition && !reducedMotion()) doc.startViewTransition(swap);
  else swap();
}

export function initRouter() {
  apply(current, false);
  document.addEventListener('click', (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('a[data-link]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(new URL(a.href).pathname);
  });
  addEventListener('popstate', () => navigate(location.pathname, false));
  addEventListener('resize', movePill, { passive: true });
  document.fonts?.ready.then(movePill);
}
