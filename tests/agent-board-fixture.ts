import { cpSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { AgentBoardHelper } from '../src/agent-board-helper.js';
import { SharedBoardClient } from '../src/board.js';

export function boardFixture(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), 'agent-board-test-'));
  const resources = join(home, 'helper'), root = join(home, 'board');
  mkdirSync(resources);
  for (const name of ['cli.mjs', 'store.mjs', 'storage.mjs']) {
    cpSync(join('/Applications/TasksWidget.app/Contents/Resources/TaskBoardMCP', name), join(resources, name));
  }
  const env = { HOME: home, PATH: process.env.PATH, TASKSHARK_BOARD_ROOT: root,
    TASKSHARK_MCP_RESOURCE_DIR: resources, TASKSHARK_ACTOR_KIND: 'human',
    TASKSHARK_THREAD_ID: 'stale-thread', PI_SESSION_ID: 'stale-session', TASKSHARK_TASK_ID: 'stale-task' };
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const agent = (taskID = 'task-a', threadID = 'thread-a') =>
    new AgentBoardHelper({ taskID, threadID, root, helper: join(resources, 'cli.mjs') }, env);
  return { home, resources, root, env, agent, human: new SharedBoardClient(resources, root, env) };
}
