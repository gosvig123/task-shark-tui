import type { Task } from './model.js';
import { snapshot, type TaskSnapshot } from './task-api.js';
import { database } from './task-database.js';
export const todayList = 'today';
export interface TodayRemoval { complete: boolean; notice: string; today?: TaskSnapshot }
export async function removeTodayReference(root: string, task: Task): Promise<TodayRemoval> {
  try {
    return database(root, db => {
      const current = db.prepare('SELECT owner FROM tasks WHERE id = ?').get(task.id);
      if (!current || current.owner !== task.ownerList) throw new Error('Canonical source task is missing or changed.');
      db.prepare('DELETE FROM today WHERE task_id = ?').run(task.id);
      return { complete: true, today: snapshot(db, todayList), notice: 'Date saved; Today reference removed. Source task preserved.' };
    });
  } catch (error) { return { complete: false, notice: `Date saved; Today removal failed: ${String(error)}. e retries removal only; do not resave the date.` }; }
}
