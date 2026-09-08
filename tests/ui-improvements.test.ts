import test from 'node:test';
import assert from 'node:assert/strict';
import blessed from 'blessed';
import { PassThrough } from 'node:stream';
import { compose } from '../src/ui/actions.js';
import { searchConversations } from '../src/ui/conversation-search.js';
import { navigationWidth, composerHeight, resizePanel } from '../src/ui/layout.js';
import type { View } from '../src/ui/view.js';

function setup() {
  const input = new PassThrough(), output = new PassThrough();
  Object.assign(output, { columns: 100, rows: 32, isTTY: true }); output.resume();
  const screen = blessed.screen({ input, output, terminal: 'xterm' });
  const previous = blessed.box({ parent: screen }); previous.focus();
  const key = (name: string, ch = '') => screen.focused.emit('keypress', ch, { name });
  const close = () => { screen.destroy(); input.destroy(); output.destroy(); };
  return { screen, previous, key, close };
}
test('conversation-search: edits inline, filters immediately, retains query and restores focus', async () => {
  const ui = setup();
  const view = { screen: ui.screen, query: '', render() {}, follow: false } as unknown as View;
  try {
    const result = searchConversations(view);
    assert.equal(ui.screen.focused.top, 3); assert.equal(ui.screen.focused.left, 1);
    ui.key('w', 'work'); assert.equal(view.query, 'work'); assert.equal(view.follow, true);
    ui.screen.emit('resize'); ui.key('escape'); await result;
    assert.equal(view.query, 'work'); assert.equal(ui.screen.focused, ui.previous);
    assert.equal(ui.screen.grabKeys, false);
  } finally { ui.close(); }
});
for (const method of ['confirm', 'select', 'input', 'editor']) {
  test(`actions: Message routes ${method} Pi Request and preserves cancellation`, async () => {
    const ui = setup(), answers: unknown[] = [], conversation = { title: 'Fixture' };
    const request = { id: 'request', method, options: ['One', 'Two'], prefill: 'Prefilled' };
    const runtime = { state: () => ({ requests: [request] }), answer: (...args: unknown[]) => answers.push(args),
      send: () => assert.fail('Must not send a message while answering a Pi Request') };
    const view = { screen: ui.screen, runtime, current: () => ({ conversation }) } as unknown as View;
    try {
      const result = compose(view);
      ui.screen.program.emit('keypress', '', { full: 'escape', name: 'escape' }); await result;
      assert.deepEqual(answers, [[conversation, 'request', { cancelled: true }]]);
    } finally { ui.close(); }
  });
}
test('layout: panes and composer fit common small and large terminals; panels resize and clean up', () => {
  for (const [columns, rows] of [[40, 16], [60, 20], [100, 32], [200, 60]]) {
    assert.ok(navigationWidth(columns) <= columns / 2);
    assert.ok(columns - navigationWidth(columns) >= 24);
    assert.ok(composerHeight(rows) + 8 < rows);
  }
  const ui = setup();
  try {
    const before = ui.screen.listeners('resize').length, panel = blessed.box({ parent: ui.screen });
    resizePanel(panel, () => 80); assert.equal(panel.height, 30);
    ui.screen.program.rows = 20; ui.screen.emit('resize'); assert.equal(panel.height, 18);
    panel.destroy(); assert.equal(ui.screen.listeners('resize').length, before);
  } finally { ui.close(); }
});
test('actions: Message sends normally when no Pi Request is pending', async () => {
  const ui = setup(), sent: unknown[] = [], conversation = { title: 'Fixture' };
  const runtime = { state: () => ({ requests: [] }), send: (...args: unknown[]) => sent.push(args) };
  const detail = blessed.box({ parent: ui.screen, left: 32, bottom: 3 });
  const view = { screen: ui.screen, detail, render() {}, runtime, current: () => ({ conversation }) } as unknown as View;
  try {
    const result = compose(view); ui.key('h', 'hello');
    ui.screen.focused.emit('keypress', '', { name: 's', ctrl: true }); await result;
    assert.deepEqual(sent, [[conversation, 'hello']]); assert.equal(view.follow, true);
  } finally { ui.close(); }
});
