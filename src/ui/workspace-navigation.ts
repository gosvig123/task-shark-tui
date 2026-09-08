import { taskNavigationWidth, taskNavigationHeights } from './layout.js';
import { setListContent } from './list-content.js';
import { navigationLines } from './navigation-lines.js';
import { taskRows, selectTask, selectorState } from './task-selector.js';
import blessed from 'blessed';
import type { View } from './view.js';
import { safe } from './dialogs.js';
import { workspaceSection, type WorkspaceSection } from './workspace.js';

export const sections: WorkspaceSection[] = ['Details', 'Conversations'];
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
    box.setLabel(navigationLabel(view, section));
    box.style.border.fg = active && view.workspaceFocus === 'left' ? 'cyan' : 'default';
    box.style.selected = { bold: active, inverse: active && view.workspaceFocus === 'left' };
    const selected = section === 'Conversations' ?
      Math.max(0, view.rows().findIndex(r => r.key === view.selected)) : Math.max(0, taskRows(view).findIndex(r => r.key === selectorState(view).selected));
    setNavigationItems(box, navigationRows(view, section), selected, false);
  }
  view.taskSearch.show(); view.taskSearch.width = workspaceWidth(view) - 2;
  view.taskSearch.setContent(safe(`/ ${selectorState(view).query || 'Search tasks'}`));
  view.detail.left = workspaceWidth(view);
  view.detail.setLabel(view.workspaceFocus === 'right' ? ' ▶ Open · Esc returns left ' : ' Preview · Enter opens ');
  view.detail.style.border.fg = view.workspaceFocus === 'right' ? 'cyan' : 'default';
}
export function navigationLabel(view: View, section: WorkspaceSection): string {
  const focused = section === view.workspaceSection && view.workspaceFocus === 'left';
  const count = view.taskScope ? view.runtime.store.conversations.filter(c => c.task?.id === view.taskScope!.id).length : 0;
  const title = section === 'Details' ? '[1] Tasks · / search' : `[2] Conversations (${count})`;
  return ` ${focused ? '▶ ' : ''}${title} `;
}
function navigationRows(view: View, section: WorkspaceSection): string[] {
  if (section === 'Details') return taskRows(view).map(row => row.label).concat(taskRows(view).length ? [] : ['No tasks · / search · n new']);
  if (!view.taskScope) return ['Select a task'];
  if (section === 'Conversations') return view.rows().map(r => r.label).concat(view.rows().length ? [] : ['No conversations · n new']);
  return [];
}
export function moveWorkspace(view: View, delta: number): void {
  const section = view.workspaceSection;
  const length = section === 'Details' ? Math.max(1, taskRows(view).length) : Math.max(1, view.rows().length);
  const index = section === 'Conversations' ? Math.max(0, view.rows().findIndex(r => r.key === view.selected)) : Math.max(0, taskRows(view).findIndex(r => r.key === selectorState(view).selected));
  if (index + delta < 0 || index + delta >= length) {
    const next = sections[sections.indexOf(section) + delta];
    if (next) workspaceSection(view, next);
  } else if (section === 'Details') { selectTask(view, taskRows(view)[index + delta]?.key ?? ''); view.workspaceSection = 'Details'; }
  else if (section === 'Conversations') view.selected = view.rows()[index + delta]?.key ?? '';
  view.follow = true;
}

function setNavigationItems(box: blessed.Widgets.ListElement, rows: string[], selected: number, compact: boolean): void {
  const items: string[] = []; let position = 0;
  navigationLines(box, rows, compact).forEach((lines, index) => {
    if (index === selected) position = items.length;
    items.push(...lines.map((line, part) => `${index === selected && !part ? '› ' : '  '}${line}`));
  });
  setListContent(box, items); box.select(position);
}
