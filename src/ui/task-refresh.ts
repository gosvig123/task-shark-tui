import { statSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '../config.js';
import { localDate } from '../task-today.js';
import type { View } from './view.js';
import { refreshTasks } from './refresh.js';

export function taskRevision(config: Config, now = new Date()): string {
  const day = localDate(now);
  if (config.demo) return day;
  return `${day}:${['tasks.sqlite', 'tasks.sqlite-wal'].map(name => fileRevision(join(config.root, name))).join(':')}`;
}
function fileRevision(path: string): string {
  try {
    const stat = statSync(path, { bigint: true });
    return `${stat.ino}:${stat.size}:${stat.mtimeNs}`;
  } catch { return 'missing'; }
}
export function watchTaskChanges(view: View, config: Config): () => void {
  let revision = taskRevision(config), running = false;
  const timer = setInterval(async () => {
    if (running || view.refreshing || revision === taskRevision(config)) return;
    running = true;
    const next = taskRevision(config);
    try {
      await refreshTasks(view, config, undefined, true);
      if (!view.notice.startsWith('Tasks unavailable:')) revision = next;
    } finally { running = false; }
  }, 1000);
  timer.unref();
  const stop = () => clearInterval(timer);
  view.screen.once('destroy', stop);
  return stop;
}
