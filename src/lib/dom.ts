type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | null | undefined>;

/** Tiny element factory. Text always goes through textContent, so API data can't inject markup. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = String(v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) node.append(c instanceof Node ? c : String(c));
  return node;
}

/** Build an element from a trusted, static SVG string (icons only). */
export function svg(markup: string): SVGElement {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild as SVGElement;
}

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

export function setText(node: Element | null, text: string) {
  if (node && node.textContent !== text) node.textContent = text;
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Swap an <img> src only once the new image has decoded, so nothing flashes. */
export function swapImage(img: HTMLImageElement, src: string | null, onDone?: (ok: boolean) => void) {
  if (!src) return onDone?.(false);
  if (img.dataset.src === src) return onDone?.(true);
  const next = new Image();
  next.decoding = 'async';
  next.src = src;
  next
    .decode()
    .then(() => {
      img.src = src;
      img.dataset.src = src;
      onDone?.(true);
    })
    .catch(() => onDone?.(false));
}

export async function getJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(10000) });
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('json')) throw new Error(`${url}: not json (${res.status})`);
  const body = (await res.json()) as T;
  if (!res.ok && !(body && typeof body === 'object')) throw new Error(`${url}: ${res.status}`);
  return body;
}

/** A nerd font glyph, hidden from assistive tech. */
export const nf = (glyph: string, cls = '') => h('span', { class: `nf ${cls}`.trim(), 'aria-hidden': 'true' }, glyph);

/** Run `fn` only if `pending()` is still true after `ms`: loaders never flash for fast responses. */
export function afterDelay(ms: number, pending: () => boolean, fn: () => void) {
  window.setTimeout(() => pending() && fn(), ms);
}
