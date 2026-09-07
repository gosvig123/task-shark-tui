import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import blessed, { type Widgets } from 'blessed';
import { choicePanel, choose } from '../src/ui/dialogs.js';

function page(screen: Widgets.Screen, name: 'pageup' | 'pagedown'): void {
  screen.program.emit('keypress', '', { full: name, name });
}
function checkPaging(screen: Widgets.Screen, body: Widgets.BoxElement): void {
  page(screen, 'pagedown');
  assert.ok(body.getScroll() > 0);
  page(screen, 'pageup');
  assert.equal(body.getScroll(), 0);
}

for (const closeKey of ['enter', 'escape']) {
  test(`dialogs: ${closeKey} restores focus and leaves the main view scrollable`, async () => {
    const input = new PassThrough(), output = new PassThrough();
    Object.assign(output, { columns: 100, rows: 32, isTTY: true }); output.resume();
    const screen = blessed.screen({ input, output, terminal: 'xterm' });
    try {
      const content = Array.from({ length: 100 }, (_, i) => `Line ${i}`).join('\n');
      const main = blessed.box({ parent: screen, scrollable: true, alwaysScroll: true, content });
      main.key('pagedown', () => { main.scroll(10); screen.render(); });
      main.key('pageup', () => { main.scroll(-10); screen.render(); });
      main.focus(); screen.render();
      const result = choose(screen, 'Details', ['Close'], content);
      screen.program.emit('keypress', '', { full: closeKey, name: closeKey });
      await result;
      assert.equal(screen.focused, main);
      checkPaging(screen, main);
    } finally { screen.destroy(); input.destroy(); output.destroy(); }
  });
}

for (const [columns, rows] of [[100, 32], [60, 20]]) {
  test(`dialogs: long confirmation details scroll separately from No/Yes at ${columns}x${rows}`, () => {
    const input = new PassThrough(), output = new PassThrough();
    Object.assign(output, { columns, rows, isTTY: true }); output.resume();
    const screen = blessed.screen({ input, output, terminal: 'xterm', fullUnicode: true });
    try {
      const details = Array.from({ length: 80 }, (_, i) => `Detail ${i + 1}: a multiline approval with full context.`).join('\n');
      const { panel, list, body } = choicePanel(screen, 'Pi confirmation', ['No', 'Yes'], details);
      list.focus(); screen.render();
      assert.equal(list.style.selected.fg, 'black');
      assert.equal(list.style.selected.bg, 'yellow');
      assert.equal(list.style.selected.bold, true);
      assert.equal(list.getItemIndex(list.getItem(0)), 0);
      assert.equal((list as typeof list & { value: string }).value, 'No');
      assert.equal(body!.getContent(), details);
      assert.ok(Number(body!.top) + Number(body!.height) <= Number(list.top));
      checkPaging(screen, body!);
      list.emit('key end', '', { full: 'end', name: 'end' });
      assert.ok(body!.getScroll() > 0);
      assert.equal(body!.getScrollPerc(), 100);
      assert.equal((list as typeof list & { value: string }).value, 'No');
      panel.destroy();
      assert.doesNotThrow(() => { page(screen, 'pagedown'); page(screen, 'pageup'); });
      assert.notEqual(screen.focused, list);
    } finally { screen.destroy(); input.destroy(); output.destroy(); }
  });
}
