/** One shared 1s tick for every clock/timer on the page. Stops while the tab is hidden. */
type Fn = (now: number) => void;
const fns = new Set<Fn>();
let id: number | undefined;

const run = () => {
  const now = Date.now();
  fns.forEach((f) => f(now));
};
const start = () => {
  if (id !== undefined || document.hidden) return;
  // align to the wall-clock second so all timers flip together
  id = window.setTimeout(function loop() {
    run();
    id = window.setTimeout(loop, 1000 - (Date.now() % 1000) + 5);
  }, 1000 - (Date.now() % 1000) + 5);
};
const stop = () => {
  window.clearTimeout(id);
  id = undefined;
};

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop();
  else {
    run();
    start();
  }
});

export function tick(fn: Fn): () => void {
  fns.add(fn);
  fn(Date.now());
  start();
  return () => fns.delete(fn);
}
