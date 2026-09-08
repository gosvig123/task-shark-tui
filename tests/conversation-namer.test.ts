import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversationNamer, normalizedTitle, piTitleGenerator } from '../src/conversation-namer.js';
import { Store } from '../src/store.js';
import { Runtime } from '../src/runtime.js';
import { fakeFactory, temporary, waitFor } from './helpers.js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

test('generated titles refresh and persist without blocking message delivery', async t => {
  const root = temporary(t), store = new Store(root, false);
  let finish!: (title: string) => void;
  const namer = new ConversationNamer(() => new Promise(resolve => { finish = resolve; }));
  const runtime = new Runtime(store, fakeFactory, namer);
  t.after(() => runtime.close());
  const c = store.create('', '', '');
  await runtime.send(c, 'Help repair the login screen');
  await waitFor(() => !!finish);
  assert.equal(c.title, 'New conversation');
  let changes = 0;
  runtime.on('change', () => changes++);
  finish('Repair Login Screen');
  await waitFor(() => c.title === 'Repair Login Screen');
  assert.ok(changes > 0);
  assert.equal(new Store(root, false).conversations[0].title, c.title);
  assert.equal(c.needsGeneratedTitle, false);
});

test('task conversations get distinct names; explicit titles and demo stay unchanged', async t => {
  const store = new Store(temporary(t), false);
  const task = { id: 'task', title: 'Shared task', completed: false, ownerList: 'Work', subtasks: [] };
  const c = store.create('', '', '', task);
  const manual = store.create(task.title, '', '', task);
  const demo = { ...c, id: 'demo', demo: true };
  let calls = 0;
  const namer = new ConversationNamer(async () => { calls++; return 'Repair Login'; });
  namer.start(c, 'repair login', () => {});
  namer.start(c, 'duplicate', () => {});
  namer.start(manual, 'do not rename', () => {});
  namer.start(demo, 'do not run', () => {});
  await waitFor(() => c.title === 'Repair Login');
  namer.start(c, 'later message', () => {});
  assert.equal(calls, 1);
  assert.equal(manual.title, task.title);
});

test('failure keeps fallback; retry uses first user message', async t => {
  const c = new Store(temporary(t), false).create('', '', '');
  c.messages.push({ role: 'user', text: 'Original request' });
  let calls = 0;
  const namer = new ConversationNamer(async prompt => {
    assert.equal(prompt, 'Original request');
    if (++calls === 1) throw new Error('unavailable');
    return 'Original Work';
  });
  namer.start(c, 'Later request', () => assert.fail('failure must not rename'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(c.title, 'New conversation');
  assert.equal(c.needsGeneratedTitle, true);
  namer.start(c, 'Another request', () => {});
  await waitFor(() => c.title === 'Original Work');
});

test('shutdown cancels pending naming and ignores late results', async t => {
  const c = new Store(temporary(t), false).create('', '', '');
  let finish!: (title: string) => void;
  let signal!: AbortSignal;
  const namer = new ConversationNamer((_, abort) => {
    signal = abort;
    return new Promise(resolve => { finish = resolve; });
  });
  namer.start(c, 'request', () => assert.fail('closed'));
  await waitFor(() => !!finish);
  namer.close();
  assert.equal(signal.aborted, true);
  finish('Late Title');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(c.title, 'New conversation');
});

test('title normalization handles empty, quoted, multiline and long output', () => {
  assert.equal(normalizedTitle('  \n"Repair Login."\nExtra text'), 'Repair Login');
  assert.equal(normalizedTitle(' \n'), undefined);
  assert.equal(normalizedTitle('x'.repeat(100))?.length, 64);
});

test('naming process uses isolated flags, configured model and bounded stdin', async t => {
  const binary = join(temporary(t), 'namer');
  writeFileSync(binary, `#!/usr/bin/env node
const assert = require('node:assert/strict');
const args = process.argv.slice(2);
for (const flag of ['--no-tools', '--no-session', '--no-extensions', '--no-skills',
  '--no-prompt-templates', '--no-context-files', '--no-approve']) assert.ok(args.includes(flag));
assert.equal(args[args.indexOf('--model') + 1], 'test-model');
let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  assert.ok(input.includes('x'.repeat(4000)));
  assert.ok(!input.includes('x'.repeat(4001)));
  console.log('"Generated Title"');
});
`, { mode: 0o700 });
  const generate = piTitleGenerator(binary, 'test-model');
  assert.equal(await generate('x'.repeat(5000), new AbortController().signal), 'Generated Title');
  assert.equal(await piTitleGenerator('/missing/pi')('request', new AbortController().signal), undefined);
});
