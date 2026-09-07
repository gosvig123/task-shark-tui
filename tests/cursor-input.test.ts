import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import blessed from 'blessed';
import { textInput } from '../src/ui/dialogs.js';

for (const cancel of [false, true]) test(`cursor dialog ${cancel ? 'cancels' : 'submits'} and restores focus`, async () => {
  const input = new PassThrough(), output = new PassThrough();
  Object.assign(output, { columns: 70, rows: 24, isTTY: true }); output.resume();
  const screen = blessed.screen({ input, output, terminal: 'xterm', fullUnicode: true });
  try {
    const main = blessed.box({ parent: screen }); main.focus(); screen.render();
    const pending = textInput(screen, 'Date', '2026-09-07');
    assert.equal(screen.grabKeys, true);
    const field = screen.focused;
    field.emit('keypress', '', { name: 'left', ctrl: true });
    field.emit('keypress', '', { name: 'delete' }); field.emit('keypress', '', { name: 'delete' });
    field.emit('keypress', '15', { name: '1' });
    assert.match(field.getContent(), /2026-09-15/);
    assert.match(field.getContent(), /\x1b\[7m/);
    field.emit('keypress', '', cancel ? { name: 'escape' } : { name: 's', ctrl: true });
    assert.equal(await pending, cancel ? undefined : '2026-09-15');
    assert.equal(screen.focused, main); assert.equal(screen.grabKeys, false);
  } finally { screen.destroy(); input.destroy(); output.destroy(); }
});
