import test from 'node:test';
import assert from 'node:assert/strict';
import blessed from 'blessed';
import { PassThrough } from 'node:stream';
import { messageEditor } from '../src/ui/message-editor.js';
import { taskNavigationWidth, taskNavigationHeights } from '../src/ui/layout.js';
import type { View } from '../src/ui/view.js';

function fixture() {
  const input = new PassThrough(), output = new PassThrough();
  Object.assign(output, { columns: 100, rows: 32, isTTY: true }); output.resume();
  const screen = blessed.screen({ input, output, terminal: 'xterm' });
  const detail = blessed.box({ parent: screen, top: 2, bottom: 3, right: 0 }); detail.focus();
  let text = 'Original transcript';
  const view = { screen, detail, render() {
    detail.left = taskNavigationWidth(Number(screen.width)); detail.setContent(text); screen.render();
  } } as unknown as View;
  return { view, update: () => { text = 'Live response'; view.render(); },
    close: () => { screen.destroy(); input.destroy(); output.destroy(); } };
}
for (const cancel of [true, false]) test(`message-editor: inline live transcript, resize, ${cancel ? 'cancel' : 'send'} cleanup`, async () => {
  const { view, update, close } = fixture(), { screen, detail } = view;
  const listeners = screen.listeners('resize').length;
  try {
    const result = messageEditor(view), input = screen.focused, panel = input.parent as blessed.Widgets.BoxElement;
    assert.equal(panel.left, 40); assert.equal(detail.bottom, Number(panel.height) + 3);
    input.emit('keypress', 'hello', { name: 'h' }); input.emit('keypress', '', { name: 'enter' });
    update(); assert.equal(detail.content, 'Live response'); assert.equal(screen.focused, input);
    screen.program.cols = 60; screen.program.rows = 20; screen.emit('resize');
    assert.equal(panel.left, detail.left); assert.equal(panel.left, 24);
    assert.ok(Number(detail.height) >= 3); assert.equal(screen.focused, input);
    input.emit('keypress', '', cancel ? { name: 'escape' } : { name: 's', ctrl: true });
    assert.equal(await result, cancel ? undefined : 'hello\n');
    assert.equal(detail.bottom, 3); assert.equal(screen.focused, detail); assert.equal(screen.grabKeys, false);
    assert.equal(screen.listeners('resize').length, listeners); assert.equal(panel.detached, true);
  } finally { close(); }
});
test('Task Workspace layout: wider selection column and two equal panels at all window sizes', () => {
  assert.equal(taskNavigationWidth(100), 40); assert.equal(taskNavigationWidth(200), 80);
  assert.deepEqual(taskNavigationHeights(28), [14, 14]);
  assert.deepEqual(taskNavigationHeights(10), [5, 5]);
  for (const height of [0, 3, 6, 9, 11, 27, 55]) {
    const sizes = taskNavigationHeights(height);
    assert.equal(sizes.reduce((a, b) => a + b, 0), height); assert.ok(sizes.every(n => n >= 0));
  }
  assert.equal(taskNavigationWidth(40), 16);
});
