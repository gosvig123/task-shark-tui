import type { View } from './view.js';
import { Tab } from './view.js';
import { answer, compose, createConversation, details, open, quit, search, selectTaskFilter, stopRun } from './actions.js';
import { choose } from './dialogs.js';
import type { Config } from '../config.js';
import { createTaskFromView, selectTaskList } from './task-creation.js';
import { allowTasks, refreshTasks } from './refresh.js';
import { TaskFilter } from './task-filters.js';

const help = [
  'c / t / r: Conversations / Tasks / For Review Inbox',
  'Up / Down: select · Enter: open task conversations or mark a conversation read',
  'n: new task in Tasks; new conversation in Conversations/Task Workspace · g: general',
  'Drafts: Ctrl-T task · Ctrl-W workspace · Ctrl-O title/model · Escape cancels · first message saves',
  'm: message; Ctrl-S sends, Enter adds a line, Esc cancels, Ctrl-U clears',
  'i: answer the selected conversation’s Pi Request; Esc cancels that request',
  'a: mark reviewed · p: pin/unpin selected conversation · x: stop selected run and clear its Queued Messages',
  'd: task details · /: search · l: Task Lists · o: task filters · f: refresh/allow tasks · Escape: clear filters',
  'PageUp/PageDown: scroll transcript · End: follow live output',
  'q or Ctrl-C: quit (confirmation if active); work stops but sessions persist',
  'Demo: include input, select, or editor in a message to test that Pi Request',
  'Pi tools run with your account permissions. Only extensions request approvals.',
];
export function bindKeys(view: View, config: Config, shutdown: () => Promise<void>): void {
  const actions: Record<string, () => void | Promise<void>> = {
    c: () => view.switchTab(Tab.conversations), t: () => view.switchTab(Tab.tasks), r: () => view.switchTab(Tab.review),
    up: () => view.move(-1), down: () => view.move(1), enter: () => open(view),
    n: () => view.tab === Tab.tasks ? createTaskFromView(view, config) : createConversation(view, false, config),
    g: () => createConversation(view, true, config), m: () => compose(view), l: () => selectTaskList(view, config),
    o: () => selectTaskFilter(view), i: () => answer(view), x: () => stopRun(view), d: () => details(view), '/': () => search(view),
    a: () => { const c = view.current()?.conversation; if (c) view.runtime.acknowledge(c); },
    p: () => { const c = view.current()?.conversation; if (c) view.runtime.store.togglePin(c); },
    f: async () => { if (await allowTasks(view, config)) void refreshTasks(view, config); },
    q: () => quit(view, shutdown), 'C-c': () => quit(view, shutdown),
    escape: () => { view.query = ''; view.taskScope = undefined; view.listFilter = undefined; view.taskFilter = TaskFilter.all; },
    pageup: () => scroll(view, -10), pagedown: () => scroll(view, 10),
    end: () => { view.follow = true; }, '?': async () => { await choose(view.screen, 'Controls', help); },
  };
  for (const [key, action] of Object.entries(actions)) view.screen.key(key, () => { void runAction(view, action); });
}
function scroll(view: View, lines: number): void { view.follow = false; view.detail.scroll(lines); }
async function runAction(view: View, action: () => void | Promise<void>): Promise<void> {
  if (view.busy) return;
  view.busy = true;
  try { await action(); } catch (error) { view.notice = String(error); }
  finally { view.busy = false; view.render(); }
}
