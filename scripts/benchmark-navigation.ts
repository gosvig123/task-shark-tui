import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import blessed from 'blessed';
import { PassThrough } from 'node:stream';
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { View, Tab } from '../src/ui/view.js';
import { moveWorkspace } from '../src/ui/workspace-navigation.js';
import { runtimeFixture } from '../tests/helpers.js';
import { selectorState } from '../src/ui/task-selector.js';

const taskCount = Number(process.env.BENCH_TASKS ?? 1000);
const conversationCount = Number(process.env.BENCH_THREADS ?? 2);
const messageCount = Number(process.env.BENCH_MESSAGES ?? 100);

function screenOptions(options: blessed.Widgets.IScreenOptions) {
  const input = new PassThrough(), output = new PassThrough();
  Object.assign(output, { columns: 120, rows: 40, isTTY: true }); output.resume();
  return { ...options, input, output, terminal: 'xterm' };
}
function measure(action: () => void): number {
  const start = performance.now();
  for (let i = 0; i < 10; i++) action();
  return (performance.now() - start) / 10;
}
function fixture(t: TestContext) {
  const { runtime, store } = runtimeFixture(t), original = blessed.screen;
  blessed.screen = options => original(screenOptions(options ?? {}));
  let view: View;
  try { view = new View(runtime); } finally { blessed.screen = original; }
  t.after(() => view.destroy()); view.boards.load = async () => {};
  const c = store.create('Long conversation', '', '');
  c.messages = Array.from({ length: messageCount }, (_, i) => ({ role: 'assistant',
    text: `## Message ${i}\n\n${'Some **formatted** text with a [link](https://example.com).\n'.repeat(15)}\n\`\`\`ts\nconst result = 42;\n\`\`\`` }));
  if (process.env.BENCH_CONVERSATIONS) {
    const data = JSON.parse(readFileSync(process.env.BENCH_CONVERSATIONS, 'utf8'));
    c.messages = data.conversations.sort((a: typeof c, b: typeof c) => b.messages.length - a.messages.length)[0].messages;
  }
  for (let i = 2; i < conversationCount; i++) {
    store.conversations.push({ ...c, id: `bench-${i}`, title: `Conversation ${i}`, messages: c.messages.slice(0, 10) });
  }
  view.selected = c.id; view.render();
  return view;
}
test('navigation benchmark', t => {
  const view = fixture(t), transcript = measure(() => view.render());
  const selected = view.selected, other = view.runtime.store.create('Short conversation', '', '');
  const switching = measure(() => {
    view.selected = other.id; view.render(); view.selected = selected; view.render();
  }) / 2;
  view.catalog.tasks = Array.from({ length: taskCount }, (_, i) => ({ id: String(i), ownerList: 'Work',
    title: `Task ${i} with a useful descriptive title`, completed: false, subtasks: [] }));
  view.catalog.lists = ['Work']; view.catalog.byList.set('Work', view.catalog.tasks);
  view.switchTab(Tab.tasks);
  const tasks = measure(() => { moveWorkspace(view, 1); view.render(); });
  const search = measure(() => {
    selectorState(view).query = 'Task 99'; view.render();
    selectorState(view).query = ''; view.render();
  }) / 2;
  t.diagnostic(`${conversationCount} conversations / ${messageCount} long transcript messages / ${taskCount} tasks`);
  t.diagnostic(`Average render: long conversation ${transcript.toFixed(1)}ms; conversation switch ${switching.toFixed(1)}ms; task navigation ${tasks.toFixed(1)}ms; search/clear ${search.toFixed(1)}ms`);
  assert.ok(transcript < 50, `Unchanged transcript costs ${transcript.toFixed(1)}ms per render`);
  assert.ok(tasks < (taskCount > 1000 ? 500 : 50), `Task navigation costs ${tasks.toFixed(1)}ms per render`);
});
