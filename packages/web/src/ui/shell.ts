// Page chrome helpers. The experimental/demo notices live inside the <header> landmark so no content sits outside a landmark (B3-32).
import { h, type Child } from './dom.ts';

export function buildHeader(banners: string[], ...rest: Child[]): HTMLElement {
  return h('header', {}, h('div', { class: 'banners' }, ...banners.map((b) => h('p', { class: 'banner' }, b))), ...rest);
}
