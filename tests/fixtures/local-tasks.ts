import { localDate } from '../../src/task-today.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { database } from '../../src/task-database.js';

const root = process.argv[2];
database(join(root, 'demo'), db => {
  if (db.prepare('SELECT id FROM tasks LIMIT 1').get()) return;
  db.exec("UPDATE task_lists SET active = 0; INSERT OR IGNORE INTO task_lists VALUES ('Empty list', 1), ('Work', 0)");
  const task = JSON.parse(readFileSync(new URL('./tasks.json', import.meta.url), 'utf8')).tasks[0];
  task.dueDate = localDate();
  db.prepare('INSERT INTO tasks VALUES (?, ?, ?)').run(task.id, task.ownerList, JSON.stringify(task));
});
