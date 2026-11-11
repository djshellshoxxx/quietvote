import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isCurrentPage, shouldHandleNavigation } from '../src/ui/navigation.ts';
import { parseRoute } from '../src/ui/route.ts';

const click = (overrides: Partial<Pick<MouseEvent, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'defaultPrevented'>> = {}) => ({
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
  ...overrides,
});

test('handles an ordinary primary-button click', () => {
  assert.equal(shouldHandleNavigation(click()), true);
});

test('handles a keyboard-generated click with button zero', () => {
  // Keyboard activation is represented as a primary-button click (often detail === 0).
  assert.equal(shouldHandleNavigation(click()), true);
});

test('leaves modified clicks to the browser', () => {
  for (const modifier of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey'] as const) {
    assert.equal(shouldHandleNavigation(click({ [modifier]: true })), false, modifier);
  }
});

test('leaves middle and right clicks to the browser', () => {
  assert.equal(shouldHandleNavigation(click({ button: 1 })), false);
  assert.equal(shouldHandleNavigation(click({ button: 2 })), false);
});

test('does not handle a click that has already been cancelled', () => {
  assert.equal(shouldHandleNavigation(click({ defaultPrevented: true })), false);
});

test('matches the current home, help, create, and verify routes', () => {
  for (const [href, path] of [['/', '/'], ['/help', '/help'], ['/new', '/new'], ['/verify', '/verify']] as const) {
    assert.equal(isCurrentPage(href, parseRoute(path)), true, href);
  }
  assert.equal(isCurrentPage('/help', parseRoute('/')), false);
});

test('matches only the same election and view', () => {
  const current = parseRoute('/e/aaaaaaaaaaaaaaaaaaaaaaaaaa/vote');
  assert.equal(isCurrentPage('/e/aaaaaaaaaaaaaaaaaaaaaaaaaa/vote', current), true);
  assert.equal(isCurrentPage('/e/bbbbbbbbbbbbbbbbbbbbbbbbbb/vote', current), false);
  assert.equal(isCurrentPage('/e/aaaaaaaaaaaaaaaaaaaaaaaaaa/results', current), false);
});

test('normalizes trailing slashes and the election overview alias', () => {
  assert.equal(isCurrentPage('/help/', parseRoute('/help')), true);
  const current = parseRoute('/e/aaaaaaaaaaaaaaaaaaaaaaaaaa/overview');
  assert.equal(isCurrentPage('/e/aaaaaaaaaaaaaaaaaaaaaaaaaa/', current), true);
  assert.equal(isCurrentPage('/e/aaaaaaaaaaaaaaaaaaaaaaaaaa/overview/', parseRoute('/e/aaaaaaaaaaaaaaaaaaaaaaaaaa')), true);
});

test('ignores query and fragment and never marks unknown routes current', () => {
  assert.equal(isCurrentPage('/help?from=home#top', parseRoute('/help')), true);
  assert.equal(isCurrentPage('/unknown', parseRoute('/unknown')), false);
  assert.equal(isCurrentPage('/help', parseRoute('/unknown')), false);
});
