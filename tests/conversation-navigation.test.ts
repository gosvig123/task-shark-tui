import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import blessed from 'blessed';
import { PassThrough } from 'node:stream';
import { setImmediate } from 'node:timers/promises';
import { View, Tab } from '../src/ui/view.js';
import { open } from '../src/ui/actions.js';
import { bindKeys } from '../src/ui/keys.js';
import { Status } from '../src/model.js';
import { runtimeFixture } from './helpers.js';

function setup(t: TestContext) {
  const { runtime, store, root } = runtimeFixture(t);
  const input = new PassThrough(), output = new PassThrough();
  Object.assign(output, { columns: 100, rows: 32, isTTY: true }); output.resume();
  const original = blessed.screen;
  blessed.screen = options => original({ ...options, input, output, terminal: 'xterm' });
  let view: View;
  try { view = new View(runtime); } finally { blessed.screen = original; }
  view.boards.load = async () => {};
  bindKeys(view, { root, demo: false, pi: '', tasks: '' }, async () => {});
  t.after(() => { view.destroy(); input.destroy(); output.destroy(); });
  return { view, runtime, store, input };
}
function visible(view: View): string {
  return view.screen.screenshot(0, Number(view.screen.width), 0, Number(view.screen.height)).replace(/\x1b\[[0-9;]*m/g, '');
}
async function key(input: PassThrough, value: string) { input.write(value); await setImmediate(); }

for (const taskBacked of [false, true]) {
  test(`g has no shortcut; c then n starts a General Conversation: task-backed=${taskBacked}`, async t => {
    const { view, input, active, store } = conversations(t, taskBacked);
    await key(input, 'g');
    assert.equal(Boolean(view.draft), false); assert.equal(view.busy, false);
    assert.equal(view.selected, active.id); assert.equal(store.conversations.length, 2);
    await key(input, 'c'); await key(input, 'n');
    assert.ok(view.draft); assert.equal(view.draft.task, undefined);
    await key(input, 'g');
    assert.match(view.screen.focused.getContent(), /g/);
    await key(input, '\x1b');
    assert.equal(view.draft, undefined); assert.equal(store.conversations.length, 2);
  });
}

function conversations(t: TestContext, taskBacked = false) {
  const fixture = setup(t), { view, runtime, store } = fixture;
  const task = taskBacked ? { id: 'task', ownerList: 'Work', title: 'Task', completed: false, subtasks: [] } : undefined;
  if (task) view.catalog = { tasks: [task], lists: ['Work'], currentList: 'Work', byList: new Map([['Work', [task]]]) };
  const active = store.create('Active conversation', '', '', task);
  const other = store.create('Other conversation', '', '', task);
  active.updatedAt = '2026-01-01T00:00:00Z'; other.updatedAt = '2026-01-02T00:00:00Z';
  other.messages.push({ role: 'assistant', text: Array.from({ length: 500 }, (_, i) => `Other output ${i}`).join('\n') });
  active.status = Status.running; runtime.state(active).running = true;
  runtime.state(active).partial = Array.from({ length: 80 }, (_, i) => `Live output ${i}`).join('\n');
  view.selected = active.id;
  if (task) { open(view); view.workspaceFocus = 'left'; }
  view.render();
  return { ...fixture, active, other };
}
for (const taskBacked of [false, true]) for (const enter of [false, true]) {
  test(`return from longer transcript: task-backed=${taskBacked}, Enter=${enter}`, async t => {
    const { view, input, active, other } = conversations(t, taskBacked);
    assert.match(visible(view), /Live output 79/);
    for (let attempt = 0; attempt < 3; attempt++) {
      await key(input, '\x1b[A');
      assert.equal(view.selected, other.id); assert.match(visible(view), /Other output 499/);
      await key(input, '\x1b[B');
      if (enter) await key(input, '\r');
      assert.equal(view.selected, active.id); assert.match(visible(view), /Live output 79/);
      if (taskBacked && enter) await key(input, '\x1b');
    }
  });
}
test('live transcript shrink clamps scroll while growth retains a manually selected position', async t => {
  const { view, runtime, active, input } = conversations(t);
  await key(input, '\x1b[5~');
  const position = view.detail.childBase;
  assert.equal(view.follow, false);
  runtime.state(active).partial += '\nMore live output'; view.render();
  assert.equal(view.detail.childBase, position);
  runtime.state(active).partial = 'Short live output'; view.render();
  assert.equal(view.detail.childBase, 0); assert.match(visible(view), /Short live output/);
});
test('Service Tabs retain manual scroll after leaving a running conversation', async t => {
  const { view, input, active } = conversations(t);
  await key(input, '\x1b[5~');
  const position = view.detail.childBase;
  view.switchTab(Tab.review); view.switchTab(Tab.conversations);
  assert.equal(view.selected, active.id); assert.equal(view.detail.childBase, position);
  assert.equal(view.follow, false);
});
