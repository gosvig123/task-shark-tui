import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { TaskFilter } from './task-filters.js';

export const taskPreferencesFile = 'task-preferences.json';
const version = 1;
const schema = z.object({ version: z.literal(version), listFilter: z.string().optional(),
  taskFilter: z.enum(TaskFilter) });
export type TaskPreferencesValue = Pick<z.infer<typeof schema>, 'listFilter' | 'taskFilter'>;

export class TaskPreferences {
  readonly path: string;
  value: TaskPreferencesValue = { taskFilter: TaskFilter.all };
  notice = '';
  constructor(root: string) {
    this.path = join(root, taskPreferencesFile);
    try {
      if (existsSync(this.path)) this.value = schema.parse(JSON.parse(readFileSync(this.path, 'utf8')));
    } catch (error) {
      this.notice = `Cannot load task filters from ${this.path}: ${String(error)}. Select filters to save new preferences.`;
    }
  }
  save(value: TaskPreferencesValue): void {
    if (!this.notice && value.listFilter === this.value.listFilter && value.taskFilter === this.value.taskFilter) return;
    const temporary = `${this.path}.tmp`;
    writeFileSync(temporary, JSON.stringify({ version, listFilter: value.listFilter, taskFilter: value.taskFilter }), { mode: 0o600 });
    renameSync(temporary, this.path);
    this.value = { listFilter: value.listFilter, taskFilter: value.taskFilter }; this.notice = '';
  }
}
