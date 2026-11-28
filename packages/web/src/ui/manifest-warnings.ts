// Display the validator's warnings without deriving new policy or trusting diagnostic prose.
import type { MessageKey, Translator } from '../i18n/index.ts';
import { h, nextId } from './dom.ts';

const MESSAGES: Readonly<Record<string, MessageKey>> = {
  'W-NO-THRESHOLD': 'qv.election.warning.noThreshold',
  'W-SECRECY': 'qv.election.warning.secrecy',
  'W-AVAILABILITY': 'qv.election.warning.availability',
  'W-SMALL-ROLL': 'qv.election.warning.smallRoll',
};

/** Static, visible on each relevant view; the app's two live regions remain the only announcers. */
export function manifestWarnings(warnings: readonly string[], tr: Translator): HTMLElement | null {
  if (warnings.length === 0) return null;
  const heading = nextId('manifest-warnings');
  return h('section', { class: 'manifest-warnings banner', 'aria-labelledby': heading },
    h('h2', { id: heading }, tr.t('qv.election.warning.title')),
    h('ul', {}, ...warnings.map((warning) => {
      const code = warning.split(':', 1)[0]!;
      const key = Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : undefined;
      // A future warning must remain visible. Unknown text is a text node, never markup.
      return h('li', {}, key === undefined ? tr.t('qv.election.warning.other', { warning }) : tr.t(key));
    })));
}
