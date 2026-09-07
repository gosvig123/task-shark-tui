import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Store } from '../src/store.js';
import { Runtime } from '../src/runtime.js';
import { temporary } from './helpers.js';

test('conversation creation persists the first message before any Pi connection', async t => {
  const root = temporary(t), store = new Store(root, false);
  let connections = 0;
  const runtime = new Runtime(store, () => {
    connections++;
    const saved = JSON.parse(readFileSync(store.index, 'utf8')).conversations[0];
    assert.equal(saved.inFlight, 'Important first message');
    throw new Error('No Pi fixture');
  });
  const conversation = store.create('Draft completed', '', '', undefined, 'Important first message');
  assert.equal(connections, 0);
  assert.equal(existsSync(join(root, 'sessions')), false);
  const restarted = new Store(root, false).conversations[0];
  assert.match(restarted.messages[0].text, /Important first message/);
  await runtime.send(conversation, 'Important first message');
  assert.equal(connections, 1);
  assert.match(new Store(root, false).conversations[0].messages[0].text, /Important first message/);
  await runtime.close();
});
test('failed conversation save removes the new record and private workspace; never starts Pi', t => {
  const root = temporary(t), store = new Store(root, false);
  store.save = () => { throw new Error('disk full'); };
  assert.throws(() => store.create('New', '', '', undefined, 'First'), /disk full/);
  assert.deepEqual(store.conversations, []);
  assert.deepEqual(readdirSync(join(root, 'workspaces')), []);
  assert.equal(existsSync(store.index), false);
  assert.equal(existsSync(join(root, 'sessions')), false);
});
test('runtime does not deliver a message if durable submission saving fails', async t => {
  const store = new Store(temporary(t), false);
  const c = store.create('First', '', '', undefined, 'Input retained');
  let connections = 0;
  const runtime = new Runtime(store, () => { connections++; throw new Error('Must not connect'); });
  runtime.on('fatal', () => {});
  store.save = () => { throw new Error('disk full'); };
  await runtime.send(c, 'Input retained');
  assert.equal(connections, 0);
  assert.equal(new Store(store.root, false).conversations[0].messages[0].text.includes('Input retained'), true);
});
