import { taskNavigationWidth, taskNavigationHeights } from './layout.js';
import { allProgress, boardRows } from './board-preview.js';
import { wrapTextWithAnsi, truncateToWidth } from '@earendil-works/pi-tui';
import { taskRows, selectTask, selectorState } from './task-selector.js';
import blessed from 'blessed';
import type { View } from './view.js';
import { safe } from './dialogs.js';
import { workspaceSection, type WorkspaceSection } from './workspace.js';

export const sections: WorkspaceSection[] = ['Details', 'Board Updates', 'Conversations'];
export function workspaceWidth(view: View): number { return taskNavigationWidth(Number(view.screen.width)); }
export function workspacePanels(view: View): blessed.Widgets.ListElement[] {
  return sections.map((section) => blessed.list({ parent: view.screen, hidden: true, left: 0, width: '32%',
    border: 'line', tags: false, keys: false, scrollable: true, padding: { top: section === 'Details' ? 1 : 0 },
    style: { fg: 'default', selected: { bold: true }, border: { fg: 'default' } } }));
}
export function renderNavigation(view: View): void {
  if (!view.screen.focused || view.screen.focused.detached) view.detail.focus();
  const sizes = taskNavigationHeights(Math.max(0, Number(view.screen.height) - 5));
  let top = 2;
  for (const [i, box] of view.workspacePanels.entries()) {
    const section = sections[i], active = section === view.workspaceSection;
    box.show(); box.top = top; box.height = sizes[i]; box.width = workspaceWidth(view); top += sizes[i];
    box.setLabel(` ${active && view.workspaceFocus === 'left' ? '▶ ' : ''}${i + 1} ${section === 'Details' ? 'Tasks · / search' : section} `);
    box.style.border.fg = active && view.workspaceFocus === 'left' ? 'cyan' : 'default';
    box.style.selected = { bold: active, inverse: active && view.workspaceFocus === 'left' };
    const selected = section === 'Board Updates' ? boardIndex(view) : section === 'Conversations' ?
      Math.max(0, view.rows().findIndex(r => r.key === view.selected)) : Math.max(0, taskRows(view).findIndex(r => r.key === selectorState(view).selected));
    setNavigationItems(box, navigationRows(view, section), selected, section === 'Board Updates');
  }
  view.taskSearch.show(); view.taskSearch.width = workspaceWidth(view) - 2;
  view.taskSearch.setContent(safe(`/ ${selectorState(view).query || 'Search tasks'}`));
  view.detail.left = workspaceWidth(view);
  view.detail.setLabel(view.workspaceFocus === 'right' ? ' ▶ Open · Esc returns left ' : ' Preview · Enter opens ');
  view.detail.style.border.fg = view.workspaceFocus === 'right' ? 'cyan' : 'default';
}
function navigationRows(view: View, section: WorkspaceSection): string[] {
  if (section === 'Details') return taskRows(view).map(row => row.label).concat(taskRows(view).length ? [] : ['No tasks · / search · n new']);
  if (!view.taskScope) return ['Select a task'];
  if (section === 'Conversations') return view.rows().map(r => r.label).concat(view.rows().length ? [] : ['No conversations · n new']);
  const s = view.boards.state(view.taskScope!.id);
  return boardRows(s);
}
export function boardIndex(view: View): number {
  const entries = view.taskScope ? view.boards.state(view.taskScope.id).entries : [];
  return Math.max(0, entries.findIndex(e => e.sequence === view.boardSequence) + 1);
}
export function moveWorkspace(view: View, delta: number): void {
  const section = view.workspaceSection, entries = view.taskScope ? view.boards.state(view.taskScope.id).entries : [];
  const length = section === 'Details' ? Math.max(1, taskRows(view).length) : section === 'Board Updates' ? entries.length + 1 : Math.max(1, view.rows().length);
  const index = section === 'Board Updates' ? boardIndex(view) : section === 'Conversations' ? Math.max(0, view.rows().findIndex(r => r.key === view.selected)) : Math.max(0, taskRows(view).findIndex(r => r.key === selectorState(view).selected));
  if (index + delta < 0 || index + delta >= length) {
    const next = sections[sections.indexOf(section) + delta];
    if (next) workspaceSection(view, next);
  } else if (section === 'Details') { selectTask(view, taskRows(view)[index + delta]?.key ?? ''); view.workspaceSection = 'Details'; }
  else if (section === 'Board Updates') view.boardSequence = entries[index + delta - 1]?.sequence ?? allProgress;
  else if (section === 'Conversations') view.selected = view.rows()[index + delta]?.key ?? '';
  view.follow = true;
}

function setNavigationItems(box: blessed.Widgets.ListElement, rows: string[], selected: number, compact: boolean): void {
  const items: string[] = []; let position = 0;
  rows.forEach((text, index) => {
    if (index === selected) position = items.length;
    const width = Math.max(2, Number(box.width) - 5);
    const lines = compact ? [truncateToWidth(safe(text), width)] : wrapTextWithAnsi(safe(text), width);
    items.push(...lines.map((line, part) => `${index === selected && !part ? '› ' : '  '}${line}`));
  });
  box.setItems(items); box.select(position);
}
