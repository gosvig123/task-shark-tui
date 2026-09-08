import blessed from 'blessed';
import type { View } from './view.js';
import { CursorEditor } from './cursor-editor.js';
import { editorLines } from './cursor-input.js';
import { safe } from './dialogs.js';
import { navigationWidth } from './layout.js';

export function searchConversations(view: View): Promise<void> {
  return new Promise(resolve => {
    const editor = new CursorEditor(view.query, false), previous = view.screen.focused, grabbed = view.screen.grabKeys;
    const input = blessed.box({ parent: view.screen, top: 3, left: 1, height: 1 });
    const draw = () => {
      input.width = navigationWidth(Number(view.screen.width)) - 2;
      const layout = editorLines(editor, Math.max(2, Number(input.width) - 2));
      input.setContent('/ ' + layout.lines[layout.row]); input.setFront(); view.screen.render();
    };
    const finish = () => {
      view.screen.removeListener('resize', draw); input.destroy(); view.screen.grabKeys = grabbed;
      if (previous && !previous.detached) previous.focus(); resolve();
    };
    input.on('keypress', (ch, key = {}) => {
      if (key.name === 'escape' || key.name === 'enter') { finish(); return; }
      editor.key(safe(ch ?? ''), key); view.query = editor.value; view.follow = true; view.render(); draw();
    });
    view.screen.grabKeys = true; input.focus(); view.screen.on('resize', draw); draw();
  });
}
