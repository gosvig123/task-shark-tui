import blessed, { type Widgets } from 'blessed';
import { safe } from './dialogs.js';
import { selectionStyle } from './styles.js';

export function matchingLists(options: string[], query: string): string[] {
  return options.filter(option => option.toLowerCase().includes(query.toLowerCase()));
}
function searchPanel(screen: Widgets.Screen, title: string, count: number) {
  const panel = blessed.box({ parent: screen, top: 'center', left: 'center', width: '90%',
    height: Math.min(count + 7, Math.max(8, Number(screen.height) - 4)), border: 'line',
    label: safe(` ${title} `), tags: false });
  const query = blessed.text({ parent: panel, top: 0, left: 1, right: 1, height: 1, tags: false });
  const list = blessed.list({ parent: panel, top: 2, left: 1, right: 1, bottom: 2, keys: false,
    tags: false, style: { selected: selectionStyle } });
  blessed.text({ parent: panel, bottom: 0, left: 1, right: 1, height: 2,
    content: 'Type to search · ↑↓ move · Enter choose\nBackspace edit · Ctrl-U clear · Esc cancel' });
  return { panel, query, list };
}
export function chooseSourceList(screen: Widgets.Screen, title: string, options: string[]): Promise<string | undefined> {
  return chooseSearchable(screen, title, options, String);
}
export function chooseSearchable<T>(screen: Widgets.Screen, title: string, options: T[], label: (option: T) => string): Promise<T | undefined> {
  return new Promise(resolve => {
    const { panel, query, list } = searchPanel(screen, title, options.length);
    let search = '', selected = 0, matches = options;
    const render = () => {
      query.setContent(safe(`Search: ${search || '(type to search)'}`));
      list.setItems(matches.length ? matches.map(option => safe(label(option))) : ['No matching choices']);
      list.select(selected); screen.render();
    };
    const finish = (value?: T) => { panel.destroy(); screen.render(); resolve(value); };
    list.on('keypress', (text: string, key: Widgets.Events.IKeyEventArg) => {
      if (key.name === 'escape') return finish();
      if (key.name === 'enter' || key.name === 'return') { if (matches[selected] !== undefined) finish(matches[selected]); return; }
      if (key.name === 'up' || key.name === 'down') {
        selected = Math.max(0, Math.min(matches.length - 1, selected + (key.name === 'up' ? -1 : 1)));
      } else {
        const next = editQuery(search, text, key);
        if (next === search) return;
        search = next; matches = options.filter(option => label(option).toLowerCase().includes(search.toLowerCase())); selected = 0;
      }
      render();
    });
    list.focus(); render();
  });
}
function editQuery(query: string, text: string, key: Widgets.Events.IKeyEventArg): string {
  if (key.ctrl && key.name === 'u') return '';
  if (key.name === 'backspace') return Array.from(query).slice(0, -1).join('');
  if (!key.ctrl && !key.meta && text && !/[\x00-\x1f\x7f-\x9f]/.test(text)) return query + text;
  return query;
}
