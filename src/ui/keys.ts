import { toggleContentWidth, showOriginalGoal } from './content-layout.js';
import { taskActions, toggleTaskCompletion } from './task-controls.js';
import { taskListActions } from './task-list-controls.js';
import { editTask } from './task-edit.js';
import { workspaceKey } from './workspace-keys.js';
import type { View } from './view.js';
import { Tab } from './view.js';
import { compose, createConversation, details, open, quit, search, selectTaskFilter, stopRun } from './actions.js';
import { choose } from './dialogs.js';
import type { Config } from '../config.js';
import { createTaskFromView, selectTaskList } from './task-creation.js';
import { refreshTasks } from './refresh.js';
import { TaskFilter } from './task-filters.js';

const help = [
  'c / t / r: Conversations / Tasks / For Review Inbox',
  'Up / Down: select conversations, not section headers · Enter: open preview or mark a conversation read',
  'Task Workspace: 1/2 select stacked left sections; arrows preview items, Enter opens on right',
  'Escape: right pane to left sections; Escape on left clears search, keeps list and status',
  'Space in Tasks: complete/reopen selected task · Task List headings are skipped by arrows',
  'v: Task actions (complete, subtasks, Today, delete) · g: Manage Task Lists (create, rename, Active, delete)',
  'e in Task Workspace: edit title, notes, due date; Save explicitly, Escape cancels',
  'Task preview updates: u post/retry · a on right reviews all loaded board entries · f refreshes shared feed',
  'n: new task in Tasks selector; new conversation in Conversations',
  'Drafts: Ctrl-T task · Ctrl-W workspace · Ctrl-O title/model · Escape cancels · first message saves',
  'm: message; Ctrl-S sends, Enter adds a line, Esc cancels',
  'Text inputs: Alt-Backspace deletes previous word (also Ctrl-W outside drafts); Alt-D / Ctrl-Delete next; Ctrl-U clears all',
  'm answers a pending Pi Request; Esc cancels that request',
  'a: mark reviewed · p: pin/unpin selected conversation · x: stop selected run and clear its Queued Messages',
  'd: task details · /: search · l: Task Lists · o: task filters · f: refresh tasks · Escape: clear search',
  'z: toggle full-width content · Ctrl-G: read the full original goal (first user message)',
  'PageUp/PageDown: scroll transcript · End: follow live output',
  'q or Ctrl-C: quit (confirmation if active); work stops but sessions persist',
  'Demo: include input, select, or editor in a message to test that Pi Request',
  'Pi tools run with your account permissions. Only extensions request approvals.',
];
export function bindKeys(view: View, config: Config, shutdown: () => Promise<void>): void {
  const actions: Record<string, () => void | Promise<void>> = {
    c: () => view.switchTab(Tab.conversations, false), t: () => view.switchTab(Tab.tasks, false), r: () => view.switchTab(Tab.review, false),
    up: () => view.fullWidth ? scroll(view, -1) : view.move(-1, false), down: () => view.fullWidth ? scroll(view, 1) : view.move(1, false), enter: () => open(view),
    '1': () => {}, '2': () => {}, u: () => {}, b: () => {}, e: () => editTask(view, config),
    n: () => (view.tab === Tab.tasks || (view.taskScope && view.workspaceSection === 'Details')) ? createTaskFromView(view, config) : createConversation(view, false, config),
    space: () => toggleTaskCompletion(view, config),
    v: () => taskActions(view, config), g: () => taskListActions(view, config),
    m: () => compose(view), l: () => selectTaskList(view, config),
    o: () => selectTaskFilter(view), x: () => stopRun(view), d: () => details(view), '/': () => { view.fullWidth = false; view.render(); return search(view); },
    a: () => { const c = view.current()?.conversation; if (c) view.runtime.acknowledge(c); },
    z: () => toggleContentWidth(view), 'C-g': () => showOriginalGoal(view),
    p: () => { const c = view.current()?.conversation; if (c) view.runtime.store.togglePin(c); },
    f: () => { if (view.taskScope) view.boards.refresh(view.taskScope.id); void refreshTasks(view, config); },
    q: () => quit(view, shutdown), 'C-c': () => quit(view, shutdown),
    escape: () => { if (view.fullWidth) { toggleContentWidth(view); return; } view.query = ''; view.taskScope = undefined; view.listFilter = undefined; view.taskFilter = TaskFilter.all; view.follow = true; },
    pageup: () => scroll(view, -10), pagedown: () => scroll(view, 10),
    end: () => { view.follow = true; }, '?': async () => { await choose(view.screen, 'Controls', help); },
  };
  for (const [key, action] of Object.entries(actions)) view.screen.key(key, () => {
    void runAction(view, async () => { if (!await workspaceKey(view, key)) await action(); });
  });
}
function scroll(view: View, lines: number): void { view.follow = false; view.detail.scroll(lines); }
async function runAction(view: View, action: () => void | Promise<void>): Promise<void> {
  if (view.busy) return;
  view.busy = true;
  try { await action(); } catch (error) { view.notice = String(error); }
  finally { view.busy = false; view.render(); }
}
