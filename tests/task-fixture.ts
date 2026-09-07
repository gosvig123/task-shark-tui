import { chmodSync, copyFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { temporary } from './helpers.js';

export function taskFixture(t: TestContext) {
  const root = temporary(t), binary = join(root, 'tasks.mjs');
  copyFileSync(new URL('./fixtures/fake-tasks.mjs', import.meta.url), binary);
  chmodSync(binary, 0o700);
  const tasks = JSON.parse(readFileSync(new URL('./fixtures/tasks.json', import.meta.url), 'utf8')).tasks;
  writeFileSync(join(root, 'state.json'), JSON.stringify({ revision: 1, currentList: 'Empty list',
    byList: { Work: [tasks[0]], today: [tasks[1]], 'Empty list': [] } }));
  const calls = () => existsSync(join(root, 'calls.jsonl')) ? readFileSync(join(root, 'calls.jsonl'), 'utf8')
    .trim().split('\n').map(line => JSON.parse(line)) : [];
  return { root, binary, calls };
}
