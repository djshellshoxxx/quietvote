import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldHandleNavigation } from '../src/ui/navigation.ts';

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
