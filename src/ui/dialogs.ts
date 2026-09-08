import { resizePanel } from './layout.js';
import blessed, { type Widgets } from 'blessed';
import { stripVTControlCharacters } from 'node:util';
import { cursorInput } from './cursor-input.js';
import { selectionStyle } from './styles.js';

export function safe(text: string): string {
  const withoutOsc = text.replace(/(?:\x1b\]|\x9d)[\s\S]*?(?:\x07|\x1b\\)/g, '');
  const clean = withoutOsc.replace(/[\x00-\x08\x0b-\x1a\x1c-\x1f\x7f]/g, '');
  return stripVTControlCharacters(clean).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '');
}
export async function textInput(screen: Widgets.Screen, title: string, prefill = '', multiline = false): Promise<string | undefined> {
  const box = blessed.box({ parent: screen, top: 'center', left: 'center', width: '90%',
    height: multiline ? '70%' : 7, border: 'line', style: { border: { fg: 'cyan' } },
    label: safe(` ${title} `), tags: false });
  resizePanel(box, () => multiline ? Math.floor(Number(screen.height) * .7) : 7);
  blessed.text({ parent: box, bottom: 0, left: 1, height: 2,
    content: '←/→ · Home/End · Ctrl-W delete word · Ctrl-U clear all\n' +
      (multiline ? 'Ctrl-S submit · Enter newline · Esc cancel' : 'Enter / Ctrl-S submit · Esc cancel') });
  try {
    return await cursorInput(screen, { parent: box, top: 1, left: 1, right: 1, bottom: 3,
      style: { fg: 'white', bg: 'black' } }, safe(prefill), multiline, safe);
  } finally { box.destroy(); screen.render(); }
}
export function choicePanel(screen: Widgets.Screen, title: string, options: string[], details?: string) {
  const panel = blessed.box({ parent: screen, top: 'center', left: 'center', width: '90%',
    height: details === undefined ? Math.min(options.length + 4, Math.max(6, Number(screen.height) - 4)) : '90%',
    border: 'line', label: safe(` ${title} `), tags: false });
  resizePanel(panel, () => details === undefined ? options.length + 4 : Number(screen.height) - 2);
  const list = blessed.list({ parent: panel, left: 1, right: 1, bottom: 1,
    ...(details === undefined ? { top: 0 } : { height: 2 }), keys: details === undefined,
    items: options.map(safe), tags: false, style: { selected: selectionStyle } });
  blessed.text({ parent: panel, bottom: 0, left: 1, height: 1,
    content: details === undefined ? 'Enter choose · Esc cancel' : 'PgUp/PgDn/Home/End details · ↑↓ choice · Enter · Esc' });
  const body = details === undefined ? undefined : blessed.box({ parent: panel, top: 0, left: 1, right: 1,
    bottom: 4, content: safe(details), tags: false, wrap: true, scrollable: true, alwaysScroll: true,
    scrollbar: { ch: '│' } });
  // Blessed does not restore focus when a focused descendant's parent is removed.
  list.on('detach', () => { if (screen.focused === list) screen.rewindFocus(); });
  if (body) detailKeys(screen, list, body, options);
  list.select(0);
  return { panel, list, body };
}
function detailKeys(screen: Widgets.Screen, list: Widgets.ListElement, body: Widgets.BoxElement, options: string[]): void {
  let selected = 0;
  list.key('up', () => { selected = Math.max(0, selected - 1); list.select(selected); screen.render(); });
  list.key('down', () => { selected = Math.min(options.length - 1, selected + 1); list.select(selected); screen.render(); });
  list.key('enter', () => list.emit('select', list.getItem(selected), selected));
  list.key('pageup', () => { body.scroll(-Math.max(1, Number(body.height) - 1)); screen.render(); });
  list.key('pagedown', () => { body.scroll(Math.max(1, Number(body.height) - 1)); screen.render(); });
  list.key('home', () => { body.setScrollPerc(0); screen.render(); });
  list.key('end', () => { body.setScrollPerc(100); screen.render(); });
}
export function choose(screen: Widgets.Screen, title: string, options: string[], details?: string): Promise<string | undefined> {
  return new Promise(resolve => {
    const { panel, list } = choicePanel(screen, title, options, details);
    const finish = (value?: string) => { panel.destroy(); screen.render(); resolve(value); };
    list.on('select', (_item, index: number) => finish(options[index]));
    list.key('escape', () => finish());
    list.focus(); screen.render();
  });
}
