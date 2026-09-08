import { database } from './task-database.js';
import type { Task } from './model.js';
import { snapshot, saveTask, type TaskSnapshot } from './task-api.js';
export const editFields = ['title', 'description', 'dueDate'] as const;
export type TaskEdits = Record<typeof editFields[number], string>;
export function editable(task: Task): TaskEdits {
  return { title: task.title, description: task.description ?? '', dueDate: task.dueDate?.slice(0, 10) ?? '' };
}
export function changesFor(task: Task, draft: TaskEdits): Partial<TaskEdits> {
  const values = { ...draft, title: draft.title.trim(), dueDate: draft.dueDate.trim() };
  if (!values.title) throw new Error('Title cannot be blank.');
  const date = values.dueDate;
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number(date.slice(0, 4)) < 1 ||
    !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new Error('Use a real date: YYYY-MM-DD, or blank to clear.');
  const before = editable(task);
  return Object.fromEntries(editFields.filter(field => draft[field] !== before[field] && before[field] !== values[field]).map(field => [field, values[field]]));
}
export function rebaseEdits(original: Task, draft: TaskEdits, current: Task): TaskEdits {
  return { ...editable(current), ...changesFor(original, draft) };
}
export interface TaskEditResult { saved: boolean; notice: string; snapshot?: TaskSnapshot; blocked?: boolean }
export async function updateTask(root: string, original: Task, draft: TaskEdits): Promise<TaskEditResult> {
  const changes = changesFor(original, draft);
  if (!Object.keys(changes).length) return { saved: true, notice: 'No task changes.' };
  const result = database(root, db => {
    const before = snapshot(db, original.ownerList);
    const current = before.tasks.find(t => t.id === original.id);
    if (!current || Object.keys(changes).some(field => editable(current)[field as keyof TaskEdits] !== editable(original)[field as keyof TaskEdits])) {
      return { saved: false, blocked: true, snapshot: before, notice: 'Task changed externally or was removed. Review the latest source before saving.' };
    }
    saveTask(db, { ...current, ...changes });
    return { saved: true, snapshot: snapshot(db, original.ownerList), notice: 'Task saved.' };
  });
  return result;
}
