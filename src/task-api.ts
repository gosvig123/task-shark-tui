import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { taskSchema, type Task } from './model.js';
import { database } from './task-database.js';

export interface TaskSnapshot { tasks: Task[] }
export interface TaskDraft { list: string; title: string; description: string; dueDate?: string }
export interface TaskCreation { confirmed: boolean; notice: string; snapshot?: TaskSnapshot }
export function snapshot(db: DatabaseSync, list: string): TaskSnapshot {
  if (list !== 'today' && !db.prepare('SELECT name FROM task_lists WHERE name = ?').get(list)) throw new Error('Task List was removed.');
  const rows = list === 'today' ? db.prepare('SELECT data FROM tasks JOIN today ON tasks.id = today.task_id ORDER BY tasks.rowid').all() :
    db.prepare('SELECT data FROM tasks WHERE owner = ? ORDER BY rowid').all(list);
  return { tasks: rows.map(row => ({ ...taskSchema.parse(JSON.parse(String(row.data))), placement: list === 'today' ? 'reference' : 'direct' })) };
}
export async function loadTaskSnapshot(root: string, list: string): Promise<TaskSnapshot> {
  return database(root, db => snapshot(db, list));
}
export function saveTask(db: DatabaseSync, task: Task): void {
  const value = taskSchema.parse(task);
  db.prepare('UPDATE tasks SET data = ? WHERE id = ? AND owner = ?').run(JSON.stringify(value), value.id, value.ownerList);
}
export async function createTask(root: string, draft: TaskDraft): Promise<TaskCreation> {
  if (!draft.title.trim()) throw new Error('Task title is required. Nothing was created.');
  return database(root, db => {
    const list = draft.list === 'today' ? String(db.prepare('SELECT name FROM task_lists WHERE active = 1').get()!.name) : draft.list;
    snapshot(db, list);
    const task = taskSchema.parse({ id: randomUUID(), ownerList: list, title: draft.title.trim(),
      description: draft.description, dueDate: draft.dueDate, completed: false });
    db.prepare('INSERT INTO tasks(id, owner, data) VALUES (?, ?, ?)').run(task.id, list, JSON.stringify(task));
    if (draft.list === 'today') db.prepare('INSERT INTO today(task_id) VALUES (?)').run(task.id);
    return { confirmed: true, notice: `Created Pending task in ${list}: ${task.title}`, snapshot: snapshot(db, draft.list) };
  });
}
