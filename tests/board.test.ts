import { LocalBoardClient } from '../src/local-board-client.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { boardEntrySchema, type BoardClient } from '../src/board.js';
import { Boards, canReview } from '../src/board-state.js';
const fixture = { schemaVersion: 1, sequence: 1, id: randomUUID(), requestId: randomUUID(),
  createdAt: '2026-09-07T09:00:00Z', kind: 'note', body: 'Shared update', actorKind: 'human',
  source: 'Human', threadID: null, sessionID: null } as const;
function client(): BoardClient {
  return { read: async () => ({ entries: [boardEntrySchema.parse(fixture)], hasMore: false }),
    review: async () => 0, post: async () => {}, mark: async (_id, sequence) => sequence };
}
test('local SQLite shares entries, deduplicates appends and isolates task IDs', async t => {
  const root = mkdtempSync(join(tmpdir(), 'task-board-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const a = new LocalBoardClient(root), b = new LocalBoardClient(root), id = randomUUID();
  const request = randomUUID();
  await Promise.all([a.post(id, 'note', 'Shared', request), b.post(id, 'note', 'Shared', request),
    b.post(id, 'progress', 'Other', randomUUID())]);
  const page = await a.read(id);
  assert.deepEqual(page.entries.map(e => e.sequence), [1, 2]);
  assert.equal(page.entries.filter(e => e.body === 'Shared').length, 1);
  assert.equal((await b.read(randomUUID())).entries.length, 0);
  await a.mark(id, 2); await b.mark(id, 1); assert.equal(await b.review(id), 2);
  const restored = new Boards(() => {}, false, new LocalBoardClient(root));
  await restored.load(id); assert.equal(restored.state(id).entries.length, 2); assert.equal(restored.state(id).reviewed, 2);
  await assert.rejects(a.post(id, 'decision', 'Different', request), /conflicts/);
});
test('uncertain response retains request ID and content for an explicit deduplicated retry', async () => {
  const api = client(), calls: string[] = [];
  api.post = async (_id, _kind, _body, request) => { calls.push(request); if (calls.length === 1) throw new Error('response lost'); };
  const boards = new Boards(() => {}, false, api);
  await boards.post('task', 'note', 'Retained');
  assert.equal(boards.state('task').pending?.body, 'Retained');
  assert.match(boards.state('task').error!, /uncertain/);
  await boards.retry('task'); assert.equal(calls[0], calls[1]); assert.equal(boards.state('task').pending, undefined);
});
test('Board review is explicit and blocked for hidden unread entries', async () => {
  const api = client(), boards = new Boards(() => {}, false, api);
  await boards.load('task'); assert.equal(boards.state('task').reviewed, 0);
  assert.equal(canReview(boards.state('task')), true);
  await boards.mark('task'); assert.equal(boards.state('task').reviewed, 1);
  const state = boards.state('task'); state.earlier = true; state.reviewed = 0; state.entries[0].sequence = 5;
  assert.equal(canReview(state), false); await boards.mark('task'); assert.equal(state.reviewed, 0);
});
test('demo never invokes local database and state stays scoped by task ID', async () => {
  const api = client(); api.post = async () => { throw new Error('must not call'); };
  const boards = new Boards(() => {}, true, api);
  await boards.post('source-task', 'handoff', 'Offline'); await boards.load('source-task');
  assert.equal(boards.state('source-task').entries.length, 1); assert.equal(boards.state('other-task').entries.length, 0);
  await boards.mark('source-task'); assert.equal(boards.state('source-task').reviewed, 1);
});
test('all pages load chronologically and remain present after refresh', async () => {
  const api = client(), cursors: (number | undefined)[] = [];
  api.read = async (_id, before) => {
    cursors.push(before);
    const last = (before ?? 206) - 1, first = Math.max(1, last - 99);
    return { entries: Array.from({ length: last - first + 1 }, (_, i) => ({ ...fixture, sequence: first + i })), hasMore: first > 1 };
  };
  const boards = new Boards(() => {}, false, api);
  for (let i = 0; i < 2; i++) {
    await boards.load('task');
    assert.deepEqual(boards.state('task').entries.map(e => e.sequence), Array.from({ length: 205 }, (_, n) => n + 1));
    assert.equal(boards.state('task').earlier, false); assert.equal(boards.state('task').reviewed, 0);
  }
  assert.deepEqual(cursors, [undefined, 106, 6, undefined, 106, 6]);
});
test('invalid earlier pages stop loading and keep partial updates with an error', async () => {
  const api = client(); let calls = 0;
  api.read = async () => { calls++; return { entries: [{ ...fixture, sequence: 101 }], hasMore: true }; };
  const boards = new Boards(() => {}, false, api);
  await boards.load('task');
  assert.equal(calls, 2); assert.equal(boards.state('task').entries.length, 1);
  assert.match(boards.state('task').error!, /invalid earlier page/);
  assert.equal(boards.state('task').loading, false); assert.equal(canReview(boards.state('task')), false);
});
test('invalid local database errors stay visible', async t => {
  const root = mkdtempSync(join(tmpdir(), 'task-board-invalid-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'tasks.sqlite'), 'not a database');
  const boards = new Boards(() => {}, false, new LocalBoardClient(root));
  await boards.load('task'); assert.ok(boards.state('task').error); assert.equal(boards.state('task').loaded, false);
});
