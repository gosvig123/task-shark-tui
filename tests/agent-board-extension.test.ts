import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from '@earendil-works/pi-coding-agent';
import agentBoardExtension from '../src/agent-board-extension.js';
import { boardFixture } from './agent-board-fixture.js';
const installed = existsSync('/Applications/TasksWidget.app/Contents/Resources/TaskBoardMCP/cli.mjs');
function harness(t: import('node:test').TestContext, collisions: string[] = []) {
  const f = boardFixture(t), saved = { ...process.env }, tools: ToolDefinition[] = [];
  Object.assign(process.env, f.env, { TASKSHARK_TASK_ID: 'a', TASKSHARK_THREAD_ID: 'thread-a',
    TASKSHARK_BOARD_HELPER: join(f.resources, 'cli.mjs') });
  t.after(() => { for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]; Object.assign(process.env, saved); });
  let start: () => void = () => {}, ready = false;
  const pi = { on: (_event: string, handler: () => void) => { start = handler; },
    registerTool: (tool: ToolDefinition) => tools.push(tool),
    getAllTools: () => [...tools, ...collisions.map(name => ({ name, sourceInfo: { path: 'ambient-extension' } }))],
    getActiveTools: () => tools.map(tool => tool.name), registerCommand: () => { ready = true; } } as unknown as ExtensionAPI;
  agentBoardExtension(pi);
  const execute = (name: string, params: unknown) => tools.find(tool => tool.name === name)!.execute('call', params, undefined, undefined,
    { sessionManager: { getSessionId: () => 'actual-session' } } as unknown as ExtensionContext);
  return { ...f, tools, start: () => start(), ready: () => ready, execute };
}
test('extension exposes only Board contract, uses actual session and ignores later environment changes', { skip: !installed }, async t => {
  const f = harness(t); f.start(); assert.equal(f.ready(), true);
  assert.deepEqual(f.tools.map(tool => tool.name), ['brief_read', 'board_read', 'board_post']);
  process.env.TASKSHARK_TASK_ID = 'other'; process.env.TASKSHARK_THREAD_ID = 'other-thread';
  await f.execute('brief_read', {});
  await f.execute('board_post', { requestId: randomUUID(), kind: 'decision', body: 'Fixed scope' });
  const page = await f.human.read('a'); assert.equal(page.entries.length, 1);
  assert.equal(page.entries[0].threadID, 'thread-a'); assert.equal(page.entries[0].sessionID, 'actual-session');
  assert.equal((await f.human.read('other')).entries.length, 0);
  assert.match((await f.execute('board_read', {})).content[0].type, /text/);
  await assert.rejects(f.execute('board_post', { requestId: randomUUID(), kind: 'note', body: 'bad', actorKind: 'human' }));
});
test('extension refuses ambient Board tool collision without replacing or adding any tools', { skip: !installed }, t => {
  const f = harness(t, ['board_post']);
  assert.throws(() => f.start(), /collision.*board_post.*ambient-extension/);
  assert.equal(f.tools.length, 0); assert.equal(f.ready(), false); assert.equal(existsSync(f.root), false);
});
test('extension reports failed and malformed helper results as failed tool execution', { skip: !installed }, async t => {
  const f = harness(t); f.start();
  writeFileSync(join(f.resources, 'cli.mjs'), 'process.stderr.write("broken fixture"); process.exit(1);');
  await assert.rejects(f.execute('brief_read', {}), /broken fixture.*TASKSHARK_MCP_RESOURCE_DIR/);
  writeFileSync(join(f.resources, 'cli.mjs'), 'console.log("{}");');
  await assert.rejects(f.execute('board_post', { requestId: randomUUID(), kind: 'progress', body: 'Retained' }));
});
