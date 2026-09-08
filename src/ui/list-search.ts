import { resizePanel } from './layout.js';
import blessed, { type Widgets } from 'blessed';
import { safe } from './dialogs.js';
import { selectionStyle } from './styles.js';
import { CursorEditor } from './cursor-editor.js';
import { editorLines } from './cursor-input.js';

export function matchingLists(options: string[], query: string): string[] {
  return options.filter(option => option.toLowerCase().includes(query.toLowerCase()));
}
function searchPanel(screen: Widgets.Screen, title: string, count: number) {
  const panel = blessed.box({ parent: screen, top: 'center', left: 'center', width: '90%',
    height: Math.min(count + 7, Math.max(8, Number(screen.height) - 4)), border: 'line',
    label: safe(` ${title} `), tags: false });
  resizePanel(panel, () => count + 7);
  const query = blessed.text({ parent: panel, top: 0, left: 1, right: 1, height: 1, tags: false });
  const list = blessed.list({ parent: panel, top: 2, left: 1, right: 1, bottom: 2, keys: false,
    tags: false, style: { selected: selectionStyle } });
  blessed.text({ parent: panel, bottom: 0, left: 1, right: 1, height: 2,
    content: 'Type to search · ↑↓ move · Enter choose\nCtrl-W delete word · Ctrl-U clear all · Esc cancel' });
  return { panel, query, list };
}
function renderSearch({ panel, query, list }: ReturnType<typeof searchPanel>, editor: CursorEditor, labels: string[], selected: number): void {
  const layout = editorLines(editor, Math.max(2, Number(panel.width) - 12));
  query.setContent(`Search: ${layout.lines[layout.row]}`);
  list.setItems(labels.length ? labels.map(safe) : ['No matching choices']);
  list.select(selected); panel.screen.render();
}
export function chooseSourceList(screen: Widgets.Screen, title: string, options: string[]): Promise<string | undefined> {
  return chooseSearchable(screen, title, options, String);
}
export function chooseSearchable<T>(screen: Widgets.Screen, title: string, options: T[], label: (option: T) => string): Promise<T | undefined> {
  return new Promise(resolve => {
    const controls = searchPanel(screen, title, options.length), { panel, list } = controls;
    const editor = new CursorEditor('', false);
    let selected = 0, matches = options;
    const render = () => renderSearch(controls, editor, matches.map(label), selected);
    const finish = (value?: T) => { screen.removeListener('resize', render); panel.destroy(); screen.render(); resolve(value); };
    list.on('keypress', (text: string, key: Widgets.Events.IKeyEventArg) => {
      if (key.name === 'escape') return finish();
      if (key.name === 'enter' || key.name === 'return') { if (matches[selected] !== undefined) finish(matches[selected]); return; }
      if (key.name === 'up' || key.name === 'down') {
        selected = Math.max(0, Math.min(matches.length - 1, selected + (key.name === 'up' ? -1 : 1)));
      } else {
        const previous = editor.value;
        editor.key(safe(text ?? ''), key);
        if (editor.value !== previous) {
          matches = options.filter(option => label(option).toLowerCase().includes(editor.value.toLowerCase())); selected = 0;
        }
      }
      render();
    });
    screen.on('resize', render); list.focus(); render();
  });
}
