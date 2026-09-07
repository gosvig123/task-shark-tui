import { editDraft, emptyDraft } from './conversation-draft.js';
import { choose, textInput } from './dialogs.js';
import { Tab, type View } from './view.js';
import { taskDetails } from './content.js';
import type { Config } from '../config.js';
import { TaskFilter } from './task-filters.js';
import { chooseSearchable } from './list-search.js';

export async function createConversation(view: View, general = false, config?: Config): Promise<void> {
  const task = general ? undefined : view.taskScope;
  view.switchTab(Tab.conversations);
  view.taskScope = task;
  view.notice = '';
  await editDraft(view, emptyDraft(task), config);
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
  if (view.tab !== Tab.tasks) view.switchTab(Tab.tasks);
  view.taskFilter = selected; view.selected = '';
}
export async function search(view: View): Promise<void> {
  const text = await textInput(view.screen, 'Search · blank clears filter', view.query);
  if (text !== undefined) { view.query = text; view.selected = ''; }
}
export function open(view: View): void {
  const task = view.current()?.task;
  if (task) { view.taskScope = task; view.tab = Tab.conversations; view.selected = ''; }
  else {
    const c = view.current()?.conversation;
    if (c) { view.tab = Tab.conversations; view.runtime.acknowledge(c); }
  }
  view.follow = true;
}
export async function details(view: View): Promise<void> {
  const task = view.current()?.task ?? view.taskScope ?? view.current()?.conversation?.task;
  if (!task) { view.notice = 'This is a general conversation.'; return; }
  await choose(view.screen, 'Task Workspace · Details (read-only)',
    taskDetails(task, view.runtime.store.conversations).split('\n').filter(Boolean));
}
export async function quit(view: View, shutdown: () => Promise<void>): Promise<void> {
  const active = [...view.runtime.states.values()].some(s => s.running || s.requests.length);
  if (active && await choose(view.screen, 'Quit stops active Pi processes. Saved sessions remain.', ['Stay', 'Quit']) !== 'Quit') return;
  await shutdown();
}
