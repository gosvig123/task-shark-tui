import { directTodayNotice, todayList } from '../task-today.js';
import { taskKey } from './navigation-memory.js';
import { recoverToday, removeDemoToday } from './task-today.js';
import type { Task } from '../model.js';
import type { Config } from '../config.js';
import { loadTaskSnapshot } from '../task-api.js';
import { changesFor, editable, rebaseEdits, updateTask, type TaskEdits } from '../task-edit.js';
import { deduplicate } from '../tasks.js';
import { choose, choicePanel, textInput } from './dialogs.js';
import { refreshTasks } from './refresh.js';
import type { View } from './view.js';
interface Editor { original: Task; draft: TaskEdits; blocked: boolean; notice: string }
const labels = { title: 'Title', description: 'Notes', dueDate: 'Due date (YYYY-MM-DD; blank clears)' };
export function replaceCatalogTask(view: View, task: Task): void {
  for (const [list, tasks] of view.catalog.byList) view.catalog.byList.set(list, tasks.map(t =>
    t.id === task.id && t.ownerList === task.ownerList ? { ...structuredClone(task), placement: t.placement } : t));
  view.catalog.tasks = deduplicate([...view.catalog.byList.values()].flat());
  if (view.taskScope?.id === task.id && view.taskScope.ownerList === task.ownerList) view.taskScope = structuredClone(task);
}
async function latest(view: View, config: Config, task: Task): Promise<Task> {
  if (config.demo) return structuredClone(task);
  const snapshot = await loadTaskSnapshot(config.tasks, task.ownerList, true);
  const current = snapshot.tasks.find(t => t.id === task.id && t.ownerList === task.ownerList);
  if (!current) throw new Error('Task no longer exists in its source list.');
  return current;
}
export async function editTask(view: View, config: Config): Promise<void> {
  if (!view.taskScope) { view.notice = 'Open a Task Workspace before editing.'; return; }
  if (view.todayRemovals.has(taskKey(view.taskScope))) { await recoverToday(view, config, view.taskScope); return; }
  const focus = view.workspaceFocus;
  view.notice = 'Loading current task details…'; view.render();
  try {
    const original = await latest(view, config, view.taskScope);
    const editor: Editor = { original, draft: editable(original), blocked: false, notice: 'Choose a field. Blank notes/date clears it. Save applies only changed fields.' };
    await editLoop(view, config, editor);
  } finally { view.workspaceFocus = focus; }
}
async function editLoop(view: View, config: Config, editor: Editor): Promise<void> {
  for (;;) {
    const fields = Object.keys(labels) as (keyof TaskEdits)[];
    const choices = fields.map(field => `${labels[field]}: ${editor.draft[field].replace(/\n/g, ' ').slice(0, 45) || '(empty)'}`);
    choices.push(editor.blocked ? 'Review latest source' : 'Save', 'Cancel');
    const choice = await editChoice(view, editor, choices);
    if (!choice || choice === 'Cancel') { view.notice = 'Task edit cancelled. Nothing else written.'; return; }
    try {
      if (choice === 'Save' && await save(view, config, editor)) return;
      else if (choice === 'Review latest source') await reviewSource(view, config, editor);
      else if (choices.indexOf(choice) < fields.length) {
        const field = fields[choices.indexOf(choice)];
        const value = await textInput(view.screen, labels[field], editor.draft[field], field === 'description');
        if (value !== undefined) editor.draft[field] = value;
      }
    } catch (error) { editor.notice = String(error); }
  }
}
function editChoice(view: View, editor: Editor, choices: string[]): Promise<string | undefined> {
  return new Promise(resolve => {
    const { panel, list, body } = choicePanel(view.screen, 'Edit task · ' + editor.original.title, choices, editor.notice + (editor.original.ownerList === todayList ? '\n\n' + directTodayNotice : ''));
    list.height = choices.length; if (body) body.bottom = choices.length + 2;
    const finish = (choice?: string) => { panel.destroy(); view.screen.render(); resolve(choice); };
    list.on('select', (_item, index: number) => finish(choices[index]));
    list.key('escape', () => finish()); list.focus(); view.screen.render();
  });
}
async function save(view: View, config: Config, editor: Editor): Promise<boolean> {
  const changes = changesFor(editor.original, editor.draft);
  if (!Object.keys(changes).length) { replaceCatalogTask(view, editor.original); view.notice = 'No task changes. Nothing written.'; return true; }
  const result = config.demo ? { saved: true, notice: 'Demo task updated in memory.',
    snapshot: { tasks: [{ ...editor.original, ...changes }] } } : await updateTask(config.tasks, editor.original, editor.draft, true);
  editor.notice = result.notice; editor.blocked = !result.saved;
  if (!result.saved) return false;
  const task = result.snapshot?.tasks.find(t => t.id === editor.original.id && t.ownerList === editor.original.ownerList);
  if (!task) { editor.blocked = true; editor.notice = 'Saved result is missing from source. Review latest source before retrying.'; return false; }
  if (!config.demo) await refreshTasks(view, config);
  if (view.notice.startsWith('Tasks unavailable:') && 'todaySnapshot' in result && result.todaySnapshot) view.catalog.byList.set(todayList, result.todaySnapshot.tasks);
  if (config.demo && 'dueDate' in changes) result.notice = removeDemoToday(view, task);
  if ('todayPending' in result && result.todayPending) view.todayRemovals.add(taskKey(task));
  replaceCatalogTask(view, task); view.notice = result.notice;
  return true;
}
async function reviewSource(view: View, config: Config, editor: Editor): Promise<void> {
  const current = await latest(view, config, editor.original);
  const choice = await choose(view.screen, 'Review latest source before another save', ['Keep draft blocked', 'Rebase draft on this source'],
    `Latest source:\n${JSON.stringify(editable(current), null, 2)}\n\nRetained draft:\n${JSON.stringify(editor.draft, null, 2)}\nRebase keeps your edits; Save is still required. Check uncertain delivery here.`);
  if (choice === 'Rebase draft on this source') {
    editor.draft = rebaseEdits(editor.original, editor.draft, current);
    editor.original = current; editor.blocked = false; editor.notice = 'Draft retained against the displayed source. Review fields, then Save explicitly.';
  }
}
