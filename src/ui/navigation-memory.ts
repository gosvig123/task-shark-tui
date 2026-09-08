import { TaskPreferences } from './task-preferences.js';
import type { View } from './view.js';
import type { Task } from '../model.js';
import { TaskFilter, type TaskFilterValue } from './task-filters.js';
import type { WorkspaceSection } from './workspace.js';

const tasksTab = 'Tasks';
export interface NavigationSnapshot {
  tab: string; query: string; selected: string; listFilter?: string; taskFilter: TaskFilterValue;
  follow: boolean; scroll: number; section: WorkspaceSection;
}
export function snapshot(view: View): NavigationSnapshot {
  return { tab: view.tab, query: view.query, selected: view.selected, listFilter: view.listFilter,
    taskFilter: view.taskFilter, follow: view.follow, scroll: view.detail.childBase,
    section: view.workspaceSection };
}
export function restore(view: View, value: NavigationSnapshot): void {
  Object.assign(view, { tab: value.tab, query: value.query, selected: value.selected, listFilter: value.listFilter,
    taskFilter: value.taskFilter, follow: value.follow, workspaceSection: value.section,
    workspaceFocus: 'left', pendingScroll: value.scroll });
}
export function taskKey(task: Task): string { return JSON.stringify([task.ownerList, task.id]); }
export class NavigationMemory {
  readonly tabs = new Map<string, NavigationSnapshot>();
  readonly tasks = new Map<string, NavigationSnapshot>();
  readonly preferences?: TaskPreferences;
  constructor(root?: string) {
    if (!root) return;
    this.preferences = new TaskPreferences(root);
    this.tabs.set(tasksTab, { tab: tasksTab, query: '', selected: '', ...this.preferences.value,
      follow: true, scroll: 0, section: 'Details' });
  }
  persistFilters(view: View): void {
    if (!this.preferences || (!view.taskScope && view.tab !== tasksTab)) return;
    try { this.preferences.save(view.workspaceReturn ?? view); }
    catch (error) {
      view.notice = `Cannot save task filters to ${this.preferences.path}: ${String(error)}. Check directory permissions and try again.`;
    }
  }
  save(view: View): void {
    this.persistFilters(view);
    if (view.taskScope) {
      this.tasks.set(taskKey(view.taskScope), snapshot(view));
      if (view.workspaceReturn) this.tabs.set(tasksTab, { ...view.workspaceReturn });
    }
    else this.tabs.set(view.tab, snapshot(view));
  }
  invalidateLists(lists: string[]): void {
    for (const value of [...this.tabs.values(), ...this.tasks.values()]) {
      if (value.listFilter && !lists.includes(value.listFilter)) value.listFilter = undefined;
    }
  }
  tab(view: View, tab: string): void {
    this.save(view); view.taskScope = undefined; view.workspaceReturn = undefined; view.fullWidth = false;
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
