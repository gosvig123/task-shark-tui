import blessed, { type Widgets } from 'blessed';
import { visibleWidth } from '@earendil-works/pi-tui';
import { CursorEditor, type EditorKey } from './cursor-editor.js';

export function editorLines(editor: CursorEditor, width: number): { lines: string[]; row: number } {
  const lines = ['']; let column = 0, row = 0;
  for (let i = 0; i <= editor.text.length; i++) {
    const text = editor.text[i] ?? ' ', newline = text === '\n';
    const cell = newline ? ' ' : text === '\t' ? '  ' : text;
    const size = visibleWidth(cell);
    if (column + size > width) { lines.push(''); column = 0; }
    if (i === editor.cursor) row = lines.length - 1;
    if (i === editor.cursor) lines[lines.length - 1] += `\x1b[7m${cell}\x1b[27m`;
    else if (!newline && i < editor.text.length) lines[lines.length - 1] += cell;
    column += size;
    if (newline) { lines.push(''); column = 0; }
  }
  return { lines, row };
}
export function cursorInput(screen: Widgets.Screen, options: Widgets.BoxOptions, prefill: string,
  multiline: boolean, clean: (text: string) => string, command?: (key: EditorKey) => boolean): Promise<string | undefined> {
  return new Promise(resolve => {
    const previous = screen.focused, grabbed = screen.grabKeys;
    const input = blessed.box({ ...options, tags: false, wrap: false, scrollable: false });
    const editor = new CursorEditor(prefill, multiline); let top = 0, done = false;
    const draw = () => {
      const layout = editorLines(editor, Math.max(2, Number(input.width))), height = Math.max(1, Number(input.height));
      top = Math.max(0, Math.min(top, layout.row)); if (layout.row >= top + height) top = layout.row - height + 1;
      input.setContent(layout.lines.slice(top, top + height).join('\n')); screen.render();
    };
    const finish = (value?: string) => {
      if (done) return; done = true;
      screen.removeListener('resize', draw); screen.grabKeys = grabbed;
      if (previous && !previous.detached) previous.focus(); else screen.rewindFocus();
      resolve(value);
    };
    input.on('keypress', (ch: string, key: EditorKey = {}) => {
      if (key.name === 'escape') { finish(); return; }
      if (command?.(key) || (key.ctrl && key.name === 's') || (!multiline && key.name === 'enter')) { finish(editor.value); return; }
      editor.key(clean(ch ?? ''), key); draw();
    });
    screen.grabKeys = true; input.focus(); screen.on('resize', draw); draw();
  });
}
