import { allProgress } from './board-preview.js';
import type { View } from './view.js';
import type { Task } from '../model.js';
import { TaskFilter, type TaskFilterValue } from './task-filters.js';
import type { WorkspaceSection } from './workspace.js';

export interface NavigationSnapshot {
  tab: string; query: string; selected: string; listFilter?: string; taskFilter: TaskFilterValue;
  follow: boolean; scroll: number; section: WorkspaceSection; boardSequence?: number;
}
export function snapshot(view: View): NavigationSnapshot {
  return { tab: view.tab, query: view.query, selected: view.selected, listFilter: view.listFilter,
    taskFilter: view.taskFilter, follow: view.follow, scroll: view.detail.childBase,
    section: view.workspaceSection, boardSequence: view.boardSequence };
}
export function restore(view: View, value: NavigationSnapshot): void {
  Object.assign(view, { tab: value.tab, query: value.query, selected: value.selected, listFilter: value.listFilter,
    taskFilter: value.taskFilter, follow: value.follow, workspaceSection: value.section,
    boardSequence: value.boardSequence ?? allProgress, workspaceFocus: 'left', pendingScroll: value.scroll });
}
export function taskKey(task: Task): string { return JSON.stringify([task.ownerList, task.id]); }
export class NavigationMemory {
  readonly tabs = new Map<string, NavigationSnapshot>();
  readonly tasks = new Map<string, NavigationSnapshot>();
  save(view: View): void {
    if (view.taskScope) {
      this.tasks.set(taskKey(view.taskScope), snapshot(view));
      if (view.workspaceReturn) this.tabs.set('Tasks', { ...view.workspaceReturn });
    }
    else this.tabs.set(view.tab, snapshot(view));
  }
  invalidateLists(lists: string[]): void {
    for (const value of [...this.tabs.values(), ...this.tasks.values()]) {
      if (value.listFilter && !lists.includes(value.listFilter)) value.listFilter = undefined;
    }
  }
  tab(view: View, tab: string): void {
    this.save(view); view.taskScope = undefined; view.workspaceReturn = undefined;
    restore(view, this.tabs.get(tab) ?? { tab, query: '', selected: '', taskFilter: TaskFilter.all,
      follow: true, scroll: 0, section: 'Details' });
  }
}
export function restoreScroll(view: View): void {
  if (view.pendingScroll === undefined) return;
  // With blessed alwaysScroll, getScroll includes a cursor offset; retain the viewport base instead.
  if (!view.follow) { view.detail.resetScroll(); view.detail.scroll(view.pendingScroll); }
  view.pendingScroll = undefined;
}
