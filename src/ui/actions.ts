import { selectorState, searchTasks, conversationTask } from './task-selector.js';
import { snapshot, restore } from './navigation-memory.js';
import { openWorkspace, workspaceSection } from './workspace.js';
import { editDraft, emptyDraft } from './conversation-draft.js';
import { choose, textInput } from './dialogs.js';
import { Tab, type View } from './view.js';
import { taskDetails } from './content.js';
import type { Config } from '../config.js';
import { TaskFilter } from './task-filters.js';
import { chooseSearchable } from './list-search.js';

export async function createConversation(view: View, general = false, config?: Config): Promise<void> {
  const origin = { state: snapshot(view), task: view.taskScope, back: view.workspaceReturn };
  const task = general ? undefined : view.taskScope;
  if (!task) view.switchTab(Tab.conversations);
  view.taskScope = task; view.workspaceReturn = task ? origin.back : undefined;
  view.query = ''; view.selected = ''; view.workspaceSection = 'Conversations'; view.workspaceFocus = 'right';
  view.notice = '';
  if (!await editDraft(view, emptyDraft(task), config)) {
    restore(view, origin.state); view.taskScope = origin.task; view.workspaceReturn = origin.back;
  } else if (view.taskScope) view.workspaceReturn ??= origin.state;
}
export async function compose(view: View, c = view.current()?.conversation): Promise<void> {
  if (!c) { view.notice = 'Select or create a conversation first.'; return; }
  const text = await textInput(view.screen, `Message · ${c.title}`, '', true);
  if (text?.trim()) { view.follow = true; void view.runtime.send(c, text); }
}
export async function answer(view: View): Promise<void> {
  const c = view.current()?.conversation;
  const request = c && view.runtime.state(c).requests[0];
  if (!c || !request) { view.notice = 'No pending Pi Request in this conversation.'; return; }
  const title = `${request.title ?? 'Pi Request'}${request.message ? ` · ${request.message}` : ''}`;
  let value: string | undefined;
  if (request.method === 'confirm') value = await choose(view.screen, 'Pi confirmation', ['No', 'Yes'], title);
  else if (request.method === 'select') value = await choose(view.screen, title, request.options ?? []);
  else value = await textInput(view.screen, title, request.prefill ?? '', request.method === 'editor');
  const fields = value === undefined ? { cancelled: true } : request.method === 'confirm' ?
    { confirmed: value === 'Yes' } : { value };
  view.runtime.answer(c, request.id, fields);
}
export async function stopRun(view: View): Promise<void> {
  const c = view.current()?.conversation;
  if (!c) return;
  const choice = await choose(view.screen, 'Stop this run and discard Queued Messages?', ['Keep running', 'Stop']);
  if (choice === 'Stop') await view.runtime.abort(c);
}
export async function selectTaskFilter(view: View): Promise<void> {
  const selected = await chooseSearchable(view.screen, 'Task filter · due today and overdue show Pending tasks',
    Object.values(TaskFilter), String);
  if (selected === undefined) return;
  if (view.tab !== Tab.tasks && !view.taskScope) view.switchTab(Tab.tasks);
  selectorState(view).taskFilter = selected; view.follow = true;
}
export async function search(view: View): Promise<void> {
  if (view.taskScope || view.tab === Tab.tasks) { await searchTasks(view); return; }
  const text = await textInput(view.screen, 'Search · blank clears filter', view.query);
  if (text !== undefined) { view.query = text; view.selected = ''; view.follow = true; }
}
export function open(view: View): void {
  const c = view.current()?.conversation;
  if (c) {
    const target = c.task && conversationTask(view, c.task);
    if (target) { view.workspaceReturn = target.state; openWorkspace(view, target.task, true); }
    else { view.switchTab(Tab.conversations); view.query = ''; view.selected = c.id; }
    view.runtime.acknowledge(c);
  }
  view.follow = true;
}
export async function details(view: View): Promise<void> {
  if (view.taskScope) { workspaceSection(view, 'Details'); return; }
  const task = view.current()?.task ?? view.taskScope ?? view.current()?.conversation?.task;
  if (!task) { view.notice = 'This is a general conversation.'; return; }
  await choose(view.screen, 'Task Workspace · Details (read-only)',
    taskDetails(task, view.runtime.store.conversations).split('\n').filter(Boolean));
}
export async function quit(view: View, shutdown: () => Promise<void>): Promise<void> {
  if (view.boards.writing) { view.notice = 'Board Updates is still saving. Wait for the result before quitting.'; return; }
  if (view.boards.pending && await choose(view.screen, 'Uncertain Board Update retained only for this launch. Check shared history before posting again after restart.',
    ['Stay', 'Quit']) !== 'Quit') return;
  const active = [...view.runtime.states.values()].some(s => s.running || s.requests.length);
  if (active && await choose(view.screen, 'Quit stops active Pi processes. Saved sessions remain.', ['Stay', 'Quit']) !== 'Quit') return;
  await shutdown();
}
