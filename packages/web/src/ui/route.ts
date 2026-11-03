// Pure routing (QV-10 §5.2). Paths, not hashes: fragments carry secrets (invites) and never reach the server.
export type Route =
  | { name: 'home' }
  | { name: 'create' }
  | { name: 'verify' }
  | { name: 'help' }
  | { name: 'election'; id: string; view: 'overview' | 'rules' | 'key' | 'vote' | 'receipt' | 'results' | 'admin' }
  | { name: 'notfound' };

const ID = /^[a-z2-7]{26}$/;
export function parseRoute(path: string): Route {
  const p = path.replace(/\/+$/, '') || '/';
  if (p === '/') return { name: 'home' };
  if (p === '/new') return { name: 'create' };
  if (p === '/verify') return { name: 'verify' };
  if (p === '/help') return { name: 'help' };
  const m = /^\/e\/([^/]+)(?:\/([a-z]+))?$/.exec(p);
  if (m && ID.test(m[1]!)) {
    const v = m[2] ?? 'overview';
    if (v === 'overview' || v === 'rules' || v === 'key' || v === 'vote' || v === 'receipt' || v === 'results' || v === 'admin') return { name: 'election', id: m[1]!, view: v };
  }
  return { name: 'notfound' };
}
export const electionPath = (id: string, view = ''): string => `/e/${id}${view ? `/${view}` : ''}`;
