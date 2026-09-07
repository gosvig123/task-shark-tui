import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { accessSync, constants } from 'node:fs';

export interface Config { root: string; demo: boolean; pi: string; tasks: string }
export function executable(name: string, candidates: string[]): string {
  const paths = [...(process.env.PATH ?? '').split(':').map(p => join(p, name)), ...candidates];
  return paths.find(path => {
    try { accessSync(path, constants.X_OK); return true; } catch { return false; }
  }) ?? name;
}
export function expandPath(path: string): string {
  return resolve(path.replace(/^~(?=\/|$)/, homedir()));
}
export function configuration(): Config {
  const home = homedir();
  const demo = process.argv.includes('--demo');
  const base = process.env.TASK_SHARK_DATA_DIR ?? join(home, '.local/share/task-shark-tui');
  return {
    root: expandPath(demo ? join(base, 'demo') : base), demo,
    pi: process.env.TASK_SHARK_PI ?? executable('pi', [join(home, '.pi/agent/bin/pi')]),
    tasks: process.env.TASK_SHARK_TASKS ?? executable('tasks', [join(home, '.local/bin/tasks')]),
  };
}
