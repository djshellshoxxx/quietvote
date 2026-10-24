import { parseRoute, type Route } from './route.ts';

/** Whether a click should be handled as an in-page navigation. */
export function shouldHandleNavigation(
  event: Pick<MouseEvent, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'defaultPrevented'>,
): boolean {
  return event.button === 0
    && !event.metaKey
    && !event.ctrlKey
    && !event.shiftKey
    && !event.altKey
    && !event.defaultPrevented;
}

/** Whether an internal link points at the route currently being displayed. */
export function isCurrentPage(href: string, current: Route): boolean {
  if (current.name === 'notfound') return false;
  const pathname = href.split(/[?#]/, 1)[0] ?? '';
  const target = parseRoute(pathname);
  if (target.name === 'notfound' || target.name !== current.name) return false;
  if (target.name === 'election' && current.name === 'election') {
    return target.id === current.id && target.view === current.view;
  }
  return true;
}
