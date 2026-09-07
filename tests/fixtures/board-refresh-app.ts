import { EventEmitter } from 'node:events';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Store } from '../../src/store.js';
import { Runtime } from '../../src/runtime.js';
import { View } from '../../src/ui/view.js';
import { bindKeys } from '../../src/ui/keys.js';
import { Boards } from '../../src/board-state.js';
import { demoTasks } from '../../src/demo.js';
import type { BoardEntry } from '../../src/board.js';

class Client extends EventEmitter {
  async request() { return { type: 'response', success: true, data: { isStreaming: true, messages: [] } }; }
  respond() {}
  async stop() {}
}
const root = process.env.HOME!, client = new Client(), store = new Store(join(root, 'app'), true);
const runtime = new Runtime(store, () => client), view = new View(runtime);
const entries: BoardEntry[] = [{ schemaVersion: 1, sequence: 1, id: 'one', requestId: 'request-one',
  createdAt: '2026-09-07T00:00:00Z', kind: 'note', body: 'Original entry', actorKind: 'agent',
  source: 'Pi', threadID: 'thread', sessionID: 'session' }];
let delayed = false, finish: (() => void) | undefined;
Object.defineProperty(view, 'boards', { value: new Boards(() => view.schedule(), false, {
  read: async id => {
    if (delayed && id === demoTasks[0].id) await new Promise<void>(resolve => { finish = resolve; });
    return { entries: id === demoTasks[0].id ? [...entries] : [], hasMore: false };
  }, review: async () => 0, mark: async () => { throw new Error('No automatic review permitted'); }, post: async () => {},
}) });
view.catalog = { tasks: demoTasks, lists: ['Task Shark Demo'], currentList: 'Task Shark Demo', byList: new Map([['Task Shark Demo', demoTasks]]) };
const render = view.screen.render.bind(view.screen);
view.screen.render = () => { const result = render(); writeFileSync(join(root, 'frame.txt'), String(view.screen.screenshot())); return result; };
const c = store.create('Running A', root, '', demoTasks[0]);
await runtime.send(c, 'Local fixture only');
async function shutdown() { await runtime.close(); view.destroy(); process.exit(); }
process.on('SIGTERM', () => { void shutdown(); });
bindKeys(view, { root, demo: true, pi: '/not-used', tasks: '/not-used' }, shutdown);
view.screen.key('z', () => {
  delayed = true;
  entries.push({ ...entries[0], sequence: 2, id: 'two', requestId: 'request-two', kind: 'progress', body: 'Agent posted progress' });
  client.emit('event', { type: 'tool_execution_end', toolName: 'board_post', toolCallId: 'post', isError: false });
});
view.screen.key('v', () => { delayed = false; finish?.(); });
view.switchTab('Tasks');
