import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import blessed from 'blessed';
import { chooseSourceList, matchingLists } from '../src/ui/list-search.js';

const lists = ['Empty list', 'Work', 'work ideas', 'today'];
test('list-search: case-insensitive substring matches retain source order', () => {
  assert.deepEqual(matchingLists(lists, ''), lists);
  assert.deepEqual(matchingLists(lists, 'WORK'), ['Work', 'work ideas']);
  assert.deepEqual(matchingLists(lists, 'missing'), []);
});
function setup(options = lists) {
  const input = new PassThrough(), output = new PassThrough();
  Object.assign(output, { columns: 100, rows: 32, isTTY: true }); output.resume();
  const screen = blessed.screen({ input, output, terminal: 'xterm', fullUnicode: true });
  const result = chooseSourceList(screen, 'Task Lists', options);
  assert.equal(screen.focused.style.selected.fg, 'black');
  assert.equal(screen.focused.style.selected.bg, 'yellow');
  assert.equal(screen.focused.style.selected.bold, true);
  const key = (name: string, text = '', ctrl = false, meta = false) => screen.focused.emit('keypress', text, { name, ctrl, meta });
  const close = () => { screen.destroy(); input.destroy(); output.destroy(); };
  return { result, key, close };
}
test('list-search: immediate typing and arrows select the original matching name', async () => {
  const ui = setup();
  try {
    ui.key('w', 'W'); ui.key('o', 'O'); ui.key('down'); ui.key('enter');
    assert.equal(await ui.result, 'work ideas');
  } finally { ui.close(); }
});
test('list-search: no matches ignore Enter; backspace and clear restore choices', async () => {
  const ui = setup(); let finished = false;
  void ui.result.then(() => { finished = true; });
  try {
    ui.key('x', 'x'); ui.key('enter'); await Promise.resolve(); assert.equal(finished, false);
    ui.key('backspace'); ui.key('w', 'w'); ui.key('down'); ui.key('u', '', true); ui.key('enter');
    assert.equal(await ui.result, 'Empty list');
  } finally { ui.close(); }
});
test('list-search: filter choices search list names and retain All Lists', async () => {
  const options = ['All Lists', ...lists.map(name => `List: ${name}`)];
  const filtered = setup(options);
  try {
    filtered.key('w', 'work'); filtered.key('down'); filtered.key('enter');
    assert.equal(await filtered.result, 'List: work ideas');
  } finally { filtered.close(); }
  const all = setup(options);
  try {
    all.key('a', 'all'); all.key('enter');
    assert.equal(await all.result, 'All Lists');
  } finally { all.close(); }
});
test('list-search: cursor editing and word deletion use the shared editor', async () => {
  const ui = setup();
  try {
    ui.key('w', 'work wrong'); ui.key('w', '', true);
    ui.key('backspace'); ui.key('home'); ui.key('d', '', false, true);
    ui.key('w', 'wrong'); ui.key('backspace', '', false, true);
    ui.key('w', 'work'); ui.key('left'); ui.key('delete'); ui.key('k', 'k'); ui.key('enter');
    assert.equal(await ui.result, 'Work');
  } finally { ui.close(); }
});
test('list-search: Escape cancels an unmatched search', async () => {
  const ui = setup();
  try { ui.key('x', 'x'); ui.key('escape'); assert.equal(await ui.result, undefined); }
  finally { ui.close(); }
});
