import { randomUUID } from 'node:crypto';
import type { Task } from './model.js';
import { loadTaskSnapshot, taskCommand, type TaskSnapshot } from './task-api.js';
export const todayList = 'today';
export const removeFromTodayOperation = 'task.removeFromToday';
export const directTodayNotice = 'This task is stored directly in Today. Its date can change, but it will stay in Today; nothing is deleted or moved.';
export interface TodayRemoval { complete: boolean; notice: string; today?: TaskSnapshot }
export async function removeTodayReference(binary: string, task: Task, allowed = false): Promise<TodayRemoval> {
  if (task.ownerList === todayList) return { complete: true, notice: 'Date saved; task stored directly in Today was kept there.' };
  try {
    const source = await loadTaskSnapshot(binary, task.ownerList, allowed);
    if (!source.tasks.some(t => t.id === task.id && t.ownerList === task.ownerList)) throw new Error('Canonical source task is missing.');
    const today = await loadTaskSnapshot(binary, todayList, allowed);
    const reference = today.tasks.find(t => t.id === task.id);
    if (!reference) return { complete: true, today, notice: 'Date saved; task is not in Today. Source task preserved.' };
    if (reference.ownerList !== task.ownerList || reference.placement !== 'reference') throw new Error('Today entry is not a matching source reference. Nothing removed.');
    const response = JSON.parse(await taskCommand(binary, ['exec'], allowed, undefined, { schemaVersion: 1,
      requestId: randomUUID(), operation: removeFromTodayOperation, list: todayList, taskId: task.id,
      expectedRevision: today.revision, changes: {} }));
    if (response.success !== true) throw new Error(response.error?.message ?? 'Removal response was not successful.');
    const after = await loadTaskSnapshot(binary, todayList, allowed);
    if (after.tasks.some(t => t.id === task.id)) throw new Error('Reference is still in Today after removal.');
    return { complete: true, today: after, notice: 'Date saved; Today reference removed. Source task preserved.' };
  } catch (error) { return { complete: false, notice: `Date saved; Today removal failed or is uncertain: ${String(error)}. Not retried. e retries removal only; do not resave the date.` }; }
}
