import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

const schema = `
CREATE TABLE IF NOT EXISTS task_lists (name TEXT PRIMARY KEY, active INTEGER NOT NULL DEFAULT 0);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_list ON task_lists(active) WHERE active = 1;
CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES task_lists(name), data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS today (task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS board_entries (task_id TEXT NOT NULL, sequence INTEGER NOT NULL, request_key TEXT NOT NULL,
 data TEXT NOT NULL, PRIMARY KEY(task_id, sequence), UNIQUE(task_id, request_key));
CREATE TABLE IF NOT EXISTS board_reviews (task_id TEXT PRIMARY KEY, sequence INTEGER NOT NULL CHECK(sequence >= 0));
INSERT INTO task_lists(name, active) SELECT 'Inbox', 1 WHERE NOT EXISTS (SELECT 1 FROM task_lists);
`;
export function database<T>(root: string, action: (db: DatabaseSync) => T): T {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const path = join(root, 'tasks.sqlite'), db = new DatabaseSync(path);
  let transaction = false;
  try {
    chmodSync(path, 0o600);
    db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    db.exec('BEGIN IMMEDIATE'); transaction = true;
    db.exec(schema);
    const result = action(db);
    db.exec('COMMIT'); transaction = false;
    return result;
  } catch (error) { if (transaction) db.exec('ROLLBACK'); throw error; }
  finally { db.close(); }
}
