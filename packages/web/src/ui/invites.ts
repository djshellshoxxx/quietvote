// Organizer invitation list (B3-23). Each row is a complete, usable link in the format the voter-side router parses
// (<origin>/e/<id>#inv=<token>, flow/invite.ts) plus its own Copy button. The token is the one the server issued: no new exposure.
// DOM construction only (textContent, no innerHTML). Strings are passed in so the i18n scanner keeps seeing every key in app.ts.
import { makeInviteFragment } from '../flow/invite.ts';
import { b64uDecode } from '../util/hex.ts';
import { h } from './dom.ts';
import { electionPath } from './route.ts';

export function inviteLink(origin: string, electionId: string, code: string): string {
  const token = b64uDecode(code);
  return token === undefined || token.length !== 16 ? code : `${origin}${electionPath(electionId)}${makeInviteFragment(token)}`;
}

export interface InviteRowsEnv {
  origin: string;
  copyLabel(n: number): string;
  /** Called with the text to copy and the element holding it (selected as the fallback when the clipboard is unavailable). */
  copy(text: string, field: HTMLElement): void;
}

export function inviteRows(env: InviteRowsEnv, electionId: string, invites: { code?: string | undefined }[]): HTMLElement {
  return h('ol', { class: 'qv-invites' }, ...invites.map((i, n) => {
    const text = inviteLink(env.origin, electionId, i.code ?? '');
    const field = h('code', { dir: 'ltr', class: 'qv-invite-link' }, text);
    return h('li', {}, field, ' ', h('button', { type: 'button', class: 'btn', onclick: () => env.copy(text, field) }, env.copyLabel(n + 1)));
  }));
}
