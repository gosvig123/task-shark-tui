import { removeTodayReference } from './task-today.js';
import { randomUUID } from 'node:crypto';
import type { Task } from './model.js';
import { loadTaskSnapshot, taskCommand, type TaskSnapshot } from './task-api.js';
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
export interface TaskEditResult { saved: boolean; notice: string; snapshot?: TaskSnapshot; blocked?: boolean; todayPending?: boolean; todaySnapshot?: TaskSnapshot }
export async function updateTask(binary: string, original: Task, draft: TaskEdits, allowed = false): Promise<TaskEditResult> {
  const changes = changesFor(original, draft);
  if (!Object.keys(changes).length) return { saved: true, notice: 'No task changes.' };
  const before = await loadTaskSnapshot(binary, original.ownerList, allowed);
  const current = before.tasks.find(t => t.id === original.id && t.ownerList === original.ownerList);
  if (!current || Object.keys(changes).some(field => editable(current)[field as keyof TaskEdits] !== editable(original)[field as keyof TaskEdits])) {
    return { saved: false, blocked: true, snapshot: before, notice: 'Task changed externally or was removed. Review the latest source before saving.' };
  }
  let result: TaskEditResult;
  try {
    const response = JSON.parse(await taskCommand(binary, ['exec'], allowed, undefined, { schemaVersion: 1,
      requestId: randomUUID(), operation: 'task.update', list: original.ownerList, taskId: original.id,
      expectedRevision: before.revision, changes }));
    result = response.success === true ? { saved: true, notice: 'Task saved.' } : { saved: false, blocked: true,
      notice: response.error?.code === 'revision_conflict' ? 'Revision conflict. Not retried; review the latest source.' :
        `Save not confirmed: ${response.error?.message ?? 'Invalid response'}. Delivery may be uncertain; check the source before retrying.` };
  } catch (error) { result = { saved: false, blocked: true, notice: `Delivery uncertain: ${String(error)}. Not retried; check the source.` }; }
  return finishUpdate(binary, original, changes, result, allowed);
}
async function finishUpdate(binary: string, original: Task, changes: Partial<TaskEdits>, result: TaskEditResult, allowed: boolean): Promise<TaskEditResult> {
  try { result.snapshot = await loadTaskSnapshot(binary, original.ownerList, allowed); }
  catch (error) { result.notice += ` Source refresh failed: ${String(error)}`; result.blocked = true; result.saved = false; }
  if (result.saved && 'dueDate' in changes) {
    const removal = await removeTodayReference(binary, original, allowed);
    result.todayPending = !removal.complete; result.notice = removal.notice; result.todaySnapshot = removal.today;
  }
  return result;
}
