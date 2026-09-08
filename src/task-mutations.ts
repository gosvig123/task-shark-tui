import { isDeepStrictEqual } from 'node:util';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { taskSchema, type Task } from './model.js';
import { database } from './task-database.js';
import { saveTask } from './task-api.js';
import { changesFor, editable } from './task-edit.js';

const subtask = z.object({ id: z.string().trim().min(1).max(512), title: z.string().trim().min(1).max(1000), completed: z.boolean() }).strict();
export const taskPatchSchema = z.object({ title: z.string().trim().min(1).max(1000), description: z.string().max(100000),
  dueDate: z.string().refine(value => value === value.trim(), 'Date must not contain surrounding whitespace.'), completed: z.boolean(), subtasks: z.array(subtask).max(1000)
    .refine(items => new Set(items.map(item => item.id)).size === items.length, 'Subtask IDs must be unique.') }).partial().strict();
export const taskUpdateSchema = z.object({ expected: taskPatchSchema, changes: taskPatchSchema }).strict();
export type TaskPatch = z.infer<typeof taskPatchSchema>;
export function currentTask(db: DatabaseSync, id: string): Task {
  const row = db.prepare('SELECT data FROM tasks WHERE id = ?').get(id);
  if (!row) throw new Error('Task was deleted. No changes saved.');
  return taskSchema.parse(JSON.parse(String(row.data)));
}
export function readTask(root: string, id: string): Task { return database(root, db => currentTask(db, id)); }
export function applyTaskPatch(current: Task, expected: TaskPatch, changes: TaskPatch): Task {
  expected = taskPatchSchema.parse(expected); changes = taskPatchSchema.parse(changes);
  const keys = Object.keys(changes) as (keyof TaskPatch)[];
  if (!keys.length || keys.length !== Object.keys(expected).length || keys.some(key => !(key in expected))) {
    throw new Error('Supply the same nonempty fields in expected and changes. Read the current task first.');
  }
  const values = { ...current, description: current.description ?? '', dueDate: current.dueDate ?? '' };
  if (keys.some(key => !isDeepStrictEqual(values[key], expected[key]))) throw new Error('Task changed. Read the current task and review before retrying.');
  const next = { ...current, ...changes };
  changesFor(current, { ...editable(current), ...Object.fromEntries(['title', 'description', 'dueDate'].filter(key => key in changes).map(key => [key, changes[key as keyof TaskPatch]])) });
  return taskSchema.parse(next);
}
export async function mutateTask(root: string, id: string, params: unknown): Promise<{ task: Task; notice: string }> {
  const { expected, changes } = taskUpdateSchema.parse(params);
  const task = database(root, db => {
    const current = currentTask(db, id), next = applyTaskPatch(current, expected, changes);
    saveTask(db, next); return next;
  });
  return { task, notice: 'Task saved.' };
}
export function deleteTask(root: string, original: Task): void {
  database(root, db => {
    const current = currentTask(db, original.id);
    if (!isDeepStrictEqual({ ...current, placement: undefined }, { ...original, placement: undefined })) {
      throw new Error('Task changed. Open Task actions again and review before deleting.');
    }
    db.prepare('DELETE FROM tasks WHERE id = ?').run(original.id);
  });
}
