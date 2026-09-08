import { localDate } from '../task-today.js';
import { randomUUID } from 'node:crypto';
import type { Task } from '../model.js';
import type { Config } from '../config.js';
import { applyTaskPatch, deleteTask, mutateTask, readTask, type TaskPatch } from '../task-mutations.js';
import { choose, textInput } from './dialogs.js';
import { replaceCatalogTask } from './task-edit.js';
import { refreshTasks } from './refresh.js';
import type { View } from './view.js';
import { deduplicate } from '../tasks.js';

const dueTodayAction = 'Set due date to today', clearDateAction = 'Clear due date';
export async function taskActions(view: View, config: Config): Promise<void> {
  if (!view.taskScope) { view.notice = 'Select a task in Tasks first.'; return; }
  const task = config.demo ? structuredClone(view.taskScope) : readTask(config.root, view.taskScope.id);
  const action = await choose(view.screen, `Task actions · ${task.title}`, [task.completed ? 'Reopen' : 'Complete',
    'Subtasks', dueTodayAction, clearDateAction, 'Delete task']);
  if (!action) return;
  if (action === 'Delete task') { await confirmDelete(view, config, task); return; }
  const changes = action === dueTodayAction ? { dueDate: localDate() } : action === clearDateAction ? { dueDate: '' } :
    action === 'Subtasks' ? await editSubtasks(view, task) : { completed: !task.completed };
  if (!changes) return;
  await saveTaskChanges(view, config, task, changes);
}
export async function toggleTaskCompletion(view: View, config: Config): Promise<void> {
  if (!view.taskScope || view.workspaceSection !== 'Details') return;
  const task = config.demo ? structuredClone(view.taskScope) : readTask(config.root, view.taskScope.id);
  await saveTaskChanges(view, config, task, { completed: !task.completed });
}
async function saveTaskChanges(view: View, config: Config, task: Task, changes: TaskPatch): Promise<void> {
  const expected = Object.fromEntries(Object.keys(changes).map(key => [key, task[key as keyof Task] ?? '']));
  const result = config.demo ? { task: applyTaskPatch(task, expected, changes), notice: 'Demo task saved in memory.' } :
    await mutateTask(config.root, task.id, { expected, changes });
  if (!config.demo) await refreshTasks(view, config);
  replaceCatalogTask(view, result.task); view.notice = result.notice;
}
async function confirmDelete(view: View, config: Config, task: Task): Promise<void> {
  if (await choose(view.screen, `Delete task: ${task.title}? Conversations stay saved.`, ['Keep task', 'Delete task']) !== 'Delete task') return;
  if (!config.demo) deleteTask(config.root, task);
  for (const [list, tasks] of view.catalog.byList) view.catalog.byList.set(list, tasks.filter(item => item.id !== task.id));
  view.catalog.tasks = deduplicate([...view.catalog.byList.values()].flat()); view.taskScope = undefined;
  if (!config.demo) await refreshTasks(view, config);
  view.notice = 'Task deleted. Existing conversations are unchanged.';
}
async function editSubtasks(view: View, task: Task): Promise<TaskPatch | undefined> {
  const labels = task.subtasks.map((item, index) => `${index + 1}. ${item.completed ? '[x]' : '[ ]'} ${item.title}`);
  const selected = await choose(view.screen, 'Subtasks', ['Add subtask', ...labels]);
  if (!selected) return;
  const subtasks = structuredClone(task.subtasks);
  if (selected === 'Add subtask') {
    const title = await textInput(view.screen, 'New subtask title');
    if (title === undefined) return;
    subtasks.push({ id: randomUUID(), title: title.trim(), completed: false });
  } else {
    const index = labels.indexOf(selected), item = subtasks[index];
    const action = await choose(view.screen, item.title, [item.completed ? 'Reopen' : 'Complete', 'Rename', 'Delete subtask']);
    if (!action) return;
    if (action === 'Rename') { const title = await textInput(view.screen, 'Subtask title', item.title); if (title === undefined) return; item.title = title.trim(); }
    else if (action === 'Delete subtask') {
      if (await choose(view.screen, `Delete subtask: ${item.title}?`, ['Keep subtask', 'Delete subtask']) !== 'Delete subtask') return;
      subtasks.splice(index, 1);
    } else item.completed = !item.completed;
  }
  return { subtasks };
}
