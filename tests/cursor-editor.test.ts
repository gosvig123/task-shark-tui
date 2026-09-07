import test from 'node:test';
import assert from 'node:assert/strict';
import { CursorEditor, type EditorKey } from '../src/ui/cursor-editor.js';
import { editorLines } from '../src/ui/cursor-input.js';

const backward: EditorKey[] = [{ ctrl: true, name: 'w' }, { meta: true, name: 'backspace' }, { ctrl: true, name: 'backspace' }];
const forward: EditorKey[] = [{ meta: true, name: 'd' }, { ctrl: true, name: 'delete' }, { meta: true, name: 'delete' }];
for (const key of backward) test(`previous word: ${JSON.stringify(key)}`, () => {
  const editor = new CursorEditor('Keep café🦈!\n suffix', true);
  editor.cursor = 13; editor.key('', key);
  assert.equal(editor.value, 'Keep suffix'); assert.equal(editor.cursor, 5);
  editor.key('', key); assert.equal(editor.value, 'suffix'); assert.equal(editor.cursor, 0);
  editor.key('', key); assert.equal(editor.value, 'suffix');
});
for (const key of forward) test(`next word: ${JSON.stringify(key)}`, () => {
  const editor = new CursorEditor('Keep 🦈!\ne\u0301lan suffix', true);
  editor.cursor = 4; editor.key('', key);
  assert.equal(editor.value, 'Keep suffix'); assert.equal(editor.cursor, 4);
  editor.cursor = editor.text.length; editor.key('', key); assert.equal(editor.value, 'Keep suffix');
});
test('clear all removes multiline text on both sides of the cursor; empty deletes are safe', () => {
  const editor = new CursorEditor('First\nSecond\nThird', true); editor.cursor = 7;
  editor.key('', { ctrl: true, name: 'u' });
  assert.equal(editor.value, ''); assert.equal(editor.cursor, 0);
  for (const key of [...backward, ...forward]) editor.key('', key);
  assert.equal(editor.value, ''); assert.equal(editor.cursor, 0);
});

test('date groups support Ctrl-arrows and insertion/deletion without replacing the field', () => {
  const editor = new CursorEditor('2026-09-07', false);
  editor.key('', { ctrl: true, name: 'left' }); assert.equal(editor.cursor, 8);
  editor.key('', { name: 'delete' }); editor.key('', { name: 'delete' }); editor.key('15', {});
  assert.equal(editor.value, '2026-09-15');
  editor.key('', { name: 'home' }); editor.key('', { ctrl: true, name: 'right' }); assert.equal(editor.cursor, 5);
  editor.key('', { name: 'delete' }); editor.key('', { name: 'delete' }); editor.key('10', {});
  assert.equal(editor.value, '2026-10-15');
  editor.key('', { ctrl: true, name: 'b' }); editor.key('', { ctrl: true, name: 'f' }); assert.equal(editor.cursor, 7);
});
test('Unicode graphemes stay intact through cursor movement, backspace and Delete', () => {
  const editor = new CursorEditor('A🦈e\u0301👨‍👩‍👧B', false);
  editor.key('', { name: 'left' }); editor.key('', { name: 'backspace' }); assert.equal(editor.value, 'A🦈e\u0301B');
  editor.key('', { name: 'left' }); editor.key('', { name: 'delete' }); assert.equal(editor.value, 'A🦈B');
  editor.key('界', {}); assert.equal(editor.value, 'A🦈界B');
  const typed = new CursorEditor('', false);
  typed.key('e', {}); typed.key('\u0301', {}); typed.key('', { name: 'backspace' }); assert.equal(typed.value, '');
  const rendered = editorLines(editor, 4); assert.ok(rendered.lines.join('').includes('\x1b[7m'));
});
test('multiline Home/End and Ctrl-A/E work per line; up/down cross lines', () => {
  const editor = new CursorEditor('First\nSecond', true);
  editor.key('', { ctrl: true, name: 'a' }); editor.key('New ', {});
  assert.equal(editor.value, 'First\nNew Second');
  editor.key('', { name: 'up' }); assert.equal(editor.cursor, 4);
  editor.key('', { ctrl: true, name: 'e' }); editor.key('!', {});
  assert.equal(editor.value, 'First!\nNew Second');
  editor.key('', { ctrl: true, name: 'home' }); assert.equal(editor.cursor, 0);
  editor.key('', { name: 'enter' }); editor.key('', { name: 'home' }); assert.equal(editor.cursor, 1);
  editor.key('', { ctrl: true, name: 'home' }); editor.key('', { name: 'home' }); assert.equal(editor.cursor, 0);
  editor.key('', { ctrl: true, name: 'u' }); assert.equal(editor.value, ''); assert.equal(editor.cursor, 0);
});
