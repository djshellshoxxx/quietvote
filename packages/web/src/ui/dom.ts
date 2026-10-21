// Tiny DOM helper. Rendering uses createElement/textContent only: innerHTML & co. are banned (QV-19-REQ-019, lint test).
export type Child = Node | string | null | undefined | false;
export type Attrs = Record<string, string | number | boolean | undefined | ((e: Event) => void)>;

export function h(tag: string, attrs: Attrs = {}, ...kids: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, ''), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  add(el, kids);
  return el;
}
export function add(el: Element, kids: Child[]): void {
  for (const k of kids) if (k !== null && k !== undefined && k !== false) el.append(typeof k === 'string' ? document.createTextNode(k) : k);
}
export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}
let uid = 0;
export const nextId = (p: string): string => `${p}-${++uid}`;

/** One polite and one assertive live region per page (QV-13-REQ-021), messages <= 140 chars. */
export class Announcer {
  private readonly polite: HTMLElement;
  private readonly assertive: HTMLElement;
  constructor(polite: HTMLElement, assertive: HTMLElement) {
    this.polite = polite;
    this.assertive = assertive;
  }
  say(msg: string, urgent = false): void {
    const r = urgent ? this.assertive : this.polite;
    r.textContent = '';
    setTimeout(() => (r.textContent = msg.slice(0, 140)), 30);
  }
}
