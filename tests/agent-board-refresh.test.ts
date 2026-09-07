import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Boards } from '../src/board-state.js';
import type { BoardClient, BoardEntry } from '../src/board.js';
import { Runtime } from '../src/runtime.js';
import { Store } from '../src/store.js';
import { temporary, waitFor } from './helpers.js';

class Client extends EventEmitter {
  async request() { return { type: 'response', success: true, data: { isStreaming: true, messages: [] } }; }
  respond() {}
  async stop() {}
}
const entry: BoardEntry = { schemaVersion: 1, sequence: 1, id: 'entry', requestId: 'request',
  createdAt: '2026-09-07T00:00:00Z', kind: 'progress', body: 'Agent progress', actorKind: 'agent',
  source: 'Pi', threadID: 'thread', sessionID: 'session' };
test('successful Board post refreshes its attached task, never reviews or refreshes general/error events', async t => {
  const store = new Store(temporary(t), true), clients = new Map<string, Client>();
  const runtime = new Runtime(store, c => { const client = new Client(); clients.set(c.id, client); return client; });
  const refreshed: string[] = [];
  runtime.on('board-post', id => refreshed.push(id));
  const task = { id: 'a', title: 'A', ownerList: 'Work', completed: false, subtasks: [] };
  const a = store.create('A', store.root, '', task), b = store.create('B', store.root, '', { ...task, id: 'b' });
  const general = store.create('General', store.root, '');
  await Promise.all([a, b, general].map(c => runtime.send(c, 'fixture')));
  const event = { type: 'tool_execution_end', toolCallId: 'call', toolName: 'board_post', isError: false };
  clients.get(a.id)!.emit('event', { ...event, isError: true });
  clients.get(general.id)!.emit('event', event); assert.deepEqual(refreshed, []);
  clients.get(a.id)!.emit('event', event); clients.get(b.id)!.emit('event', event);
  assert.deepEqual(refreshed, ['a', 'b']); await runtime.close();
});
test('Board refresh coalesces posts during in-flight load and keeps task-local review state', async () => {
  const calls: string[] = []; let finish: (() => void) | undefined;
  const api: BoardClient = { read: async id => {
    calls.push(id);
    if (calls.length === 1) await new Promise<void>(resolve => { finish = resolve; });
    return { entries: [{ ...entry, body: id }], hasMore: false };
  }, review: async () => 0, post: async () => {}, mark: async () => assert.fail('Must not review') };
  const boards = new Boards(() => {}, false, api);
  const loading = boards.load('a');
  boards.refresh('a'); boards.refresh('a'); boards.refresh('b');
  assert.deepEqual(calls, ['a', 'b']); finish!(); await loading;
  await waitFor(() => !boards.state('a').loading && !boards.state('b').loading);
  assert.deepEqual(calls, ['a', 'b', 'a']);
  assert.equal(boards.state('a').entries[0].body, 'a'); assert.equal(boards.state('b').entries[0].body, 'b');
  assert.equal(boards.state('a').reviewed, 0); assert.equal(boards.state('b').reviewed, 0);
});
