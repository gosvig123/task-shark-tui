import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import blessed from 'blessed';
import { choicePanel } from '../src/ui/dialogs.js';

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
      list.emit('key end', '', { full: 'end', name: 'end' });
      assert.ok(body!.getScroll() > 0);
      assert.equal(body!.getScrollPerc(), 100);
      assert.equal((list as typeof list & { value: string }).value, 'No');
      panel.destroy();
    } finally { screen.destroy(); input.destroy(); output.destroy(); }
  });
}
