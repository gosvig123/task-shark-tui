import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { postBoard, readBoard, markBoard, reviewedBoard } from '../src/board-storage.js';
import { temporary } from './helpers.js';

const actor = { actorKind: 'human', source: 'Human', threadID: null, sessionID: null } as const;
test('Board SQLite serializes independent processes and deduplicates a shared retry', async t => {
  const root = temporary(t), requestId = randomUUID();
  const module = pathToFileURL(resolve('src/board-storage.ts')).href;
  const code = `import { postBoard } from ${JSON.stringify(module)};
    postBoard(process.argv[1], 'task', 'note', 'Concurrent', process.argv[2], ${JSON.stringify(actor)});`;
  await Promise.all(Array.from({ length: 4 }, () => promisify(execFile)(process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', code, root, requestId])));
  assert.equal(readBoard(root, 'task').entries.length, 1);
  assert.equal(readBoard(root, 'task').entries[0].sequence, 1);
  assert.equal(statSync(join(root, 'tasks.sqlite')).mode & 0o777, 0o600);
});
test('Board paging is ordered and review is monotonic, bounded and independent from posts', t => {
  const root = temporary(t);
  for (let i = 1; i <= 103; i++) postBoard(root, 'task', 'progress', `Update ${i}`, randomUUID(), actor);
  const recent = readBoard(root, 'task');
  assert.equal(recent.entries[0].sequence, 4); assert.equal(recent.entries.at(-1)!.sequence, 103); assert.equal(recent.hasMore, true);
  const first = readBoard(root, 'task', 0, 100), rest = readBoard(root, 'task', first.nextAfterSequence, 100);
  assert.equal(first.entries[0].sequence, 1); assert.equal(rest.entries.length, 3); assert.equal(rest.hasMore, false);
  assert.equal(reviewedBoard(root, 'task'), 0); assert.equal(markBoard(root, 'task', 100), 100);
  assert.equal(markBoard(root, 'task', 1), 100); assert.throws(() => markBoard(root, 'task', 104));
  assert.equal(reviewedBoard(root, 'other'), 0);
});
