import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import blessed from 'blessed';
import { PassThrough } from 'node:stream';
import { setImmediate } from 'node:timers/promises';
import { View, Tab } from '../src/ui/view.js';
import { open } from '../src/ui/actions.js';
import { bindKeys } from '../src/ui/keys.js';
import { ConversationSection, Status } from '../src/model.js';
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
  bindKeys(view, { root, demo: false, pi: '' }, async () => {});
  t.after(() => { view.destroy(); input.destroy(); output.destroy(); });
  return { view, runtime, store, input, root };
}
test('arrow navigation skips every conversation section header and clamps at both ends', async t => {
  const { view, store, input } = setup(t);
  const items = Array.from({ length: 5 }, (_, i) => store.create(`Conversation ${i}`, '', ''));
  items.forEach(c => { c.status = Status.finished; });
  items[0]!.pinned = true; items[1]!.status = Status.needsInput; items[2]!.status = Status.review;
  items[3]!.updatedAt = new Date().toISOString(); items[4]!.updatedAt = '2000-01-01T00:00:00Z';
  view.render();
  assert.equal(view.selected, items[0]!.id);
  assert.equal(view.rows().filter(row => row.section).length, 5);
  await key(input, '\x1b[A'); assert.equal(view.selected, items[0]!.id);
  for (const item of items.slice(1)) {
    await key(input, '\x1b[B'); assert.equal(view.selected, item.id);
  }
  await key(input, '\x1b[B'); assert.equal(view.selected, items[4]!.id);
  for (const item of items.slice(0, -1).reverse()) {
    await key(input, '\x1b[A'); assert.equal(view.selected, item.id);
  }
  view.selected = `section:${ConversationSection.pinned}`; view.render();
  assert.equal(view.selected, items[0]!.id);
  view.query = 'no matches'; view.render(); await key(input, '\x1b[B');
  assert.equal(view.selected, ''); assert.equal(view.current(), undefined);
});
function visible(view: View): string {
  return view.screen.screenshot(0, Number(view.screen.width), 0, Number(view.screen.height)).replace(/\x1b\[[0-9;]*m/g, '');
}
async function key(input: PassThrough, value: string) { input.write(value); await setImmediate(); }

for (const taskBacked of [false, true]) {
  test(`g manages Task Lists; c then n starts a General Conversation: task-backed=${taskBacked}`, async t => {
    const { view, input, active, store } = conversations(t, taskBacked);
    await key(input, 'g');
    assert.equal(Boolean(view.draft), false); assert.equal(view.busy, true);
    assert.match(visible(view), /Manage Task Lists/); await key(input, '\x1b');
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
test('navigation keys draw once per action', async t => {
  const { view, input } = conversations(t);
  const render = view.render.bind(view); let draws = 0;
  view.render = () => { draws++; render(); };
  for (const value of ['\x1b[A', '\x1b[B', 'r', 'c', 't']) {
    draws = 0; await key(input, value); assert.equal(draws, 1);
  }
});
test('Service Tabs retain manual scroll after leaving a running conversation', async t => {
  const { view, input, active } = conversations(t);
  await key(input, '\x1b[5~');
  const position = view.detail.childBase;
  view.switchTab(Tab.review); view.switchTab(Tab.conversations);
  assert.equal(view.selected, active.id); assert.equal(view.detail.childBase, position);
  assert.equal(view.follow, false);
});

test('renaming a Task List retains conversation attachment and opens the current task', async t => {
  const { view, store, root } = { ...setup(t) };
  const { createTask } = await import('../src/task-api.js');
  const { manageTaskList } = await import('../src/task-lists.js');
  const { loadTaskCatalog } = await import('../src/tasks.js');
  const { taskDetails } = await import('../src/ui/content.js');
  const result = await createTask(root, { list: 'Inbox', title: 'Attached task', description: '' });
  const task = result.snapshot!.tasks[0], c = store.create('Attached conversation', '', '', task);
  manageTaskList(root, 'rename', 'Inbox', 'Renamed'); view.catalog = await loadTaskCatalog(root);
  view.selected = c.id; open(view);
  assert.equal(view.taskScope?.ownerList, 'Renamed');
  assert.equal(view.rows().some(row => row.conversation?.id === c.id), true);
  assert.match(taskDetails(view.taskScope!, store.conversations), /Attached conversation/);
  assert.equal(c.task?.ownerList, 'Inbox');
});

test('task preview loads all pages and explicitly reviews more than 100 updates', async t => {
  const { view, input, root } = setup(t);
  const { Boards } = await import('../src/board-state.js');
  const { LocalBoardClient } = await import('../src/local-board-client.js');
  const { randomUUID } = await import('node:crypto');
  const client = new LocalBoardClient(root);
  for (let i = 1; i <= 101; i++) await client.post('task', 'note', `Update ${i}`, randomUUID());
  Object.assign(view, { boards: new Boards(() => view.render(), false, client) });
  view.taskScope = { id: 'task', ownerList: 'Inbox', title: 'Task', completed: false, subtasks: [] };
  view.catalog = { tasks: [view.taskScope], lists: ['Inbox'], currentList: 'Inbox', byList: new Map([['Inbox', [view.taskScope]]]) };
  view.workspaceSection = 'Details'; view.workspaceFocus = 'right';
  await view.boards.load('task');
  assert.equal(view.boards.state('task').entries.length, 101);
  assert.match(view.detail.getContent(), /Update 1\n/);
  assert.equal(await client.review('task'), 0);
  await key(input, 'a'); assert.equal(await client.review('task'), 101);
});
