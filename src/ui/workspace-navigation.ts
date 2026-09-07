import blessed from 'blessed';
import type { View } from './view.js';
import { safe } from './dialogs.js';
import { workspaceSection, type WorkspaceSection } from './workspace.js';

export const sections: WorkspaceSection[] = ['Details', 'Board Updates', 'Conversations'];
export function workspaceWidth(view: View): number { return Math.max(24, Math.floor(Number(view.screen.width) * .32)); }
export function workspacePanels(view: View): blessed.Widgets.ListElement[] {
  return sections.map(() => blessed.list({ parent: view.screen, hidden: true, left: 0, width: '32%',
    border: 'line', tags: false, keys: false, scrollable: true,
    style: { fg: 'default', selected: { bold: true }, border: { fg: 'default' } } }));
}
export function renderNavigation(view: View): void {
  if (!view.screen.focused || view.screen.focused.detached) view.detail.focus();
  const height = Number(view.screen.height) - 5, first = 5, second = Math.floor((height - first) / 2);
  const sizes = [first, second, height - first - second];
  let top = 2;
  for (const [i, box] of view.workspacePanels.entries()) {
    const section = sections[i], active = section === view.workspaceSection;
    box.show(); box.top = top; box.height = sizes[i]; box.width = workspaceWidth(view); top += sizes[i];
    box.setLabel(` ${active && view.workspaceFocus === 'left' ? '▶ ' : ''}${i + 1} ${section} `);
    box.style.border.fg = active && view.workspaceFocus === 'left' ? 'cyan' : 'default';
    box.style.selected = { bold: active, inverse: active && view.workspaceFocus === 'left' };
    const selected = section === 'Board Updates' ? boardIndex(view) : section === 'Conversations' ?
      Math.max(0, view.rows().findIndex(r => r.key === view.selected)) : 0;
    box.setItems(navigationRows(view, section).map((text, index) => `${active && index === selected ? '› ' : '  '}${safe(text)}`));
    box.select(selected);
  }
  view.detail.left = workspaceWidth(view);
  view.detail.setLabel(view.workspaceFocus === 'right' ? ' ▶ Open · Esc returns left ' : ' Preview · Enter opens ');
  view.detail.style.border.fg = view.workspaceFocus === 'right' ? 'cyan' : 'default';
}
function navigationRows(view: View, section: WorkspaceSection): string[] {
  if (section === 'Details') return [view.taskScope!.title, view.taskScope!.completed ? 'Completed' : 'Pending'];
  if (section === 'Conversations') return view.rows().map(r => r.label).concat(view.rows().length ? [] : ['No conversations · n new']);
  const s = view.boards.state(view.taskScope!.id);
  return s.entries.map(e => `${e.sequence > s.reviewed ? '* ' : ''}#${e.sequence} ${e.kind} · ${e.body.split('\n')[0]}`)
    .concat(s.entries.length ? [] : [s.loading ? 'Loading…' : s.error ? 'Load failed · f retry' : 'No updates · n post']);
}
export function boardIndex(view: View): number {
  const entries = view.boards.state(view.taskScope!.id).entries;
  return Math.max(0, entries.findIndex(e => e.sequence === view.boardSequence));
}
export function moveWorkspace(view: View, delta: number): void {
  const section = view.workspaceSection, entries = view.boards.state(view.taskScope!.id).entries;
  const length = section === 'Details' ? 1 : section === 'Board Updates' ? Math.max(1, entries.length) : Math.max(1, view.rows().length);
  const index = section === 'Board Updates' ? boardIndex(view) : section === 'Conversations' ? Math.max(0, view.rows().findIndex(r => r.key === view.selected)) : 0;
  if (index + delta < 0 || index + delta >= length) {
    const next = sections[sections.indexOf(section) + delta];
    if (next) workspaceSection(view, next);
  } else if (section === 'Board Updates') view.boardSequence = entries[index + delta]?.sequence;
  else if (section === 'Conversations') view.selected = view.rows()[index + delta]?.key ?? '';
  view.follow = true;
}
