import test from 'node:test';
import assert from 'node:assert/strict';
import blessed from 'blessed';
import { PassThrough } from 'node:stream';
import { cachedMessage } from '../src/ui/transcript-cache.js';
import { cacheDetailAttributes } from '../src/ui/detail-attributes.js';
import { setListContent } from '../src/ui/list-content.js';
import { navigationLines } from '../src/ui/navigation-lines.js';
import type { TranscriptMessage } from '../src/model.js';

function screen(t: import('node:test').TestContext) {
  const input = new PassThrough(), output = new PassThrough();
  Object.assign(output, { columns: 80, rows: 24, isTTY: true }); output.resume();
  const screen = blessed.screen({ input, output, terminal: 'xterm' });
  t.after(() => { screen.destroy(); input.destroy(); output.destroy(); });
  return screen;
}
test('completed message rendering reuses output and invalidates each rendering input', () => {
  const message: TranscriptMessage = { role: 'assistant', text: 'Original' };
  let renders = 0;
  const render = () => String(++renders);
  const call = { type: 'toolCall', arguments: { command: 'original' } };
  assert.equal(cachedMessage(message, 80, '/tmp', call, render), '1');
  assert.equal(cachedMessage(message, 80, '/tmp', call, render), '1');
  message.text = 'Changed';
  assert.equal(cachedMessage(message, 80, '/tmp', call, render), '2');
  call.arguments.command = 'changed';
  assert.equal(cachedMessage(message, 80, '/tmp', call, render), '3');
  assert.equal(cachedMessage(message, 40, '/tmp', call, render), '4');
  assert.equal(cachedMessage(message, 40, '/other', call, render), '5');
});
test('detail attributes reuse scans and remain correct after style, content and width changes', t => {
  const parent = screen(t), box = blessed.box({ parent, width: 60, height: 20, scrollable: true });
  type Internals = { _parseAttr(lines: string[]): number[]; _clines: string[] & { attr: number[] } };
  const internal = box as unknown as Internals, original = internal._parseAttr;
  let scans = 0;
  internal._parseAttr = function(lines) { scans++; return original.call(this, lines); };
  cacheDetailAttributes(box);
  box.setContent('plain\n\x1b[31mred\x1b[0m\n' + 'long text '.repeat(30)); parent.render();
  const initial = scans; box.scroll(1); parent.render(); parent.render();
  assert.equal(scans, initial);
  for (const change of [() => { box.style.fg = 'blue'; }, () => { box.width = 30; }, () => { box.setContent('new'); }]) {
    const before = scans; change(); parent.render();
    assert.ok(scans > before);
    assert.deepEqual(internal._clines.attr, original.call(box, internal._clines));
  }
});
test('list updates only changed rows and retains correct content after length changes', t => {
  const list = blessed.list({ parent: screen(t), width: 40, height: 10 });
  setListContent(list, ['First', 'Second']);
  let changes = 0;
  list.getItem(0).on('set content', () => changes++);
  setListContent(list, ['First', 'Second']); assert.equal(changes, 0);
  setListContent(list, ['Changed', 'Second']); assert.equal(changes, 1);
  assert.equal(list.getItem(0).getContent(), 'Changed');
  setListContent(list, ['Only']); assert.equal(list.getItem(0).getContent(), 'Only');
  setListContent(list, ['One', 'Two', 'Three']); assert.equal(list.getItem(2).getContent(), 'Three');
});
test('list shrinking removes the tail first and preserves focus and selected text', t => {
  const parent = screen(t), list = blessed.list({ parent, width: 40, height: 10 });
  setListContent(list, ['A', 'B', 'C', 'D']); list.select(1); list.focus();
  const removed: number[] = [], remove = list.removeItem.bind(list);
  list.removeItem = item => {
    if (typeof item === 'number') removed.push(item);
    return remove(item);
  };
  setListContent(list, ['A', 'B']);
  assert.deepEqual(removed, [3, 2]);
  assert.equal(parent.focused, list);
  assert.equal((list as unknown as { selected: number }).selected, 1);
  assert.equal(list.getItem(1).getContent(), 'B');
  setListContent(list, []); setListContent(list, ['Fresh']);
  assert.equal(list.getItem(0).getContent(), 'Fresh');
});
test('navigation wrapping reuses unchanged labels and invalidates width and compact mode', t => {
  const box = blessed.list({ parent: screen(t), width: 40, height: 10 });
  const rows = ['A long task title '.repeat(5), 'Second'];
  const first = navigationLines(box, rows, false);
  assert.equal(navigationLines(box, [...rows], false)[0], first[0]);
  box.width = 20;
  const narrow = navigationLines(box, rows, false);
  assert.ok(narrow[0].length > first[0].length);
  assert.equal(navigationLines(box, rows, true)[0].length, 1);
});
