import blessed from 'blessed';
import type { View } from './view.js';
import { composerHeight } from './layout.js';
import { cursorInput } from './cursor-input.js';
import type { EditorKey } from './cursor-editor.js';
import { safe } from './dialogs.js';

export async function messageEditor(view: View, prefill = '', command?: (key: EditorKey) => boolean): Promise<string | undefined> {
  const bottom = view.detail.bottom;
  const panel = blessed.box({ parent: view.screen, right: 0, bottom: 3, border: 'line',
    label: ' Message · Ctrl-S send · Enter newline · Esc cancel ', style: { border: { fg: 'cyan' } } });
  const resize = () => {
    panel.height = composerHeight(Number(view.screen.height));
    view.detail.bottom = Number(panel.height) + 3;
    view.render(); panel.left = view.detail.left; panel.setFront(); view.screen.render();
  };
  view.screen.on('resize', resize);
  try {
    resize();
    return await cursorInput(view.screen, { parent: panel, top: 0, left: 0, right: 0, bottom: 0 }, prefill, true, safe, command);
  } finally {
    view.screen.removeListener('resize', resize); panel.destroy(); view.detail.bottom = bottom; view.render();
  }
}
