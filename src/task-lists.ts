import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { database } from './task-database.js';
import { snapshot } from './task-api.js';

export function taskListName(value: string): string {
  const name = z.string().trim().min(1).max(100).regex(/^[^\x00-\x1f\x7f]+$/).parse(value);
  if (name.toLowerCase() === 'today') throw new Error('Today is reserved. Choose another Task List name.');
  return name;
}
export type ListAction = 'create' | 'rename' | 'activate' | 'delete';
export function manageTaskList(root: string, action: ListAction, name: string, replacement?: string): void {
  name = taskListName(name);
  database(root, db => {
    if (action === 'create') { insertList(db, name); return; }
    const row = db.prepare('SELECT active FROM task_lists WHERE name = ?').get(name);
    if (!row) throw new Error('Task List was removed. Refresh and choose another list.');
    if (action === 'activate') {
      db.prepare('UPDATE task_lists SET active = 0 WHERE active = 1').run();
      db.prepare('UPDATE task_lists SET active = 1 WHERE name = ?').run(name); return;
    }
    if (action === 'rename') { renameList(db, name, taskListName(replacement ?? ''), row.active === 1); return; }
    if (row.active === 1) throw new Error('Set another Active Task List before deleting this list.');
    if (snapshot(db, name).tasks.length) throw new Error('Delete tasks first. Only empty Task Lists can be deleted.');
    db.prepare('DELETE FROM task_lists WHERE name = ?').run(name);
  });
}
function insertList(db: DatabaseSync, name: string): void {
  if (db.prepare('SELECT name FROM task_lists WHERE name = ?').get(name)) throw new Error('Task List already exists. Choose another name.');
  db.prepare('INSERT INTO task_lists(name) VALUES (?)').run(name);
}
function renameList(db: DatabaseSync, name: string, replacement: string, active: boolean): void {
  if (name === replacement) return;
  insertList(db, replacement);
  for (const task of snapshot(db, name).tasks) {
    db.prepare('UPDATE tasks SET owner = ?, data = ? WHERE id = ?').run(replacement, JSON.stringify({ ...task, ownerList: replacement }), task.id);
  }
  db.prepare('DELETE FROM task_lists WHERE name = ?').run(name);
  if (active) db.prepare('UPDATE task_lists SET active = 1 WHERE name = ?').run(replacement);
}
