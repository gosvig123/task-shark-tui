import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { AgentBoardHelper } from '../src/agent-board-helper.js';
import { LocalBoardClient } from '../src/local-board-client.js';
import { temporary } from './helpers.js';

export function boardFixture(t: TestContext) {
  const home = temporary(t), root = join(home, 'board');
  const brief = JSON.stringify({ id: 'task-a', title: 'Fixed task', description: 'Fixed notes' });
  const env = { HOME: home, PATH: process.env.PATH, TASKSHARK_BOARD_ROOT: root, TASKSHARK_TASK_BRIEF: brief,
    TASKSHARK_ACTOR_KIND: 'human', TASKSHARK_THREAD_ID: 'stale-thread', PI_SESSION_ID: 'stale-session', TASKSHARK_TASK_ID: 'stale-task' };
  const agent = (taskID = 'task-a', threadID = 'thread-a') => new AgentBoardHelper({ taskID, threadID, root, brief });
  return { home, root, env, agent, human: new LocalBoardClient(root) };
}
