import { mkdirSync, existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';

const argument = name => process.argv[process.argv.indexOf(name) + 1];
const directory = argument('--session-dir');
mkdirSync(directory, { recursive: true });
const file = process.argv.includes('--session') ? argument('--session') : join(directory, 'fixture.jsonl');
if (!existsSync(file)) writeFileSync(file, JSON.stringify({ type: 'session', version: 3,
  id: randomUUID(), timestamp: new Date().toISOString(), cwd: process.cwd() }) + '\n');
const entries = readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line));
let parentId = entries.at(-1)?.type === 'message' ? entries.at(-1).id : null;
const messages = entries.filter(entry => entry.type === 'message').map(entry => entry.message);
let running = false;
let pending;
const timers = new Set();
const emit = wire => process.stdout.write(JSON.stringify(wire) + '\n');
const response = (wire, data = {}) => emit({ type: 'response', id: wire.id, command: wire.type, success: true, data });
function later(action) {
  const timer = setTimeout(() => { timers.delete(timer); action(); }, 50);
  timers.add(timer);
}
function save(message) {
  message.timestamp = Date.now();
  if (message.role === 'assistant') Object.assign(message, { api: 'openai-responses', provider: 'fixture',
    model: 'offline', stopReason: 'stop', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0,
      totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
  messages.push(message);
  const id = randomUUID().slice(0, 8);
  appendFileSync(file, JSON.stringify({ type: 'message', id, parentId,
    timestamp: new Date().toISOString(), message }) + '\n');
  parentId = id;
  emit({ type: 'message_end', message });
}
function start(wire) {
  if (wire.message === 'reject') return emit({ type: 'response', id: wire.id, success: false, error: 'Fixture rejection' });
  if (wire.message === 'crash') return process.exit(4);
  running = true;
  emit({ type: 'agent_start' });
  save({ role: 'user', content: wire.message });
  response(wire);
  later(() => ask(wire.message));
}
function ask(text) {
  emit({ type: 'tool_execution_start', toolCallId: 'call', toolName: 'read', args: { path: 'fixture.ts' } });
  emit({ type: 'tool_execution_update', toolCallId: 'call', toolName: 'read', partialResult: { content: [{ type: 'text', text: 'Partial' }] } });
  emit({ type: 'tool_execution_end', toolCallId: 'call', toolName: 'read', result: { content: [{ type: 'text', text: 'Fixture content' }] } });
  pending = { id: 'request', method: ['input', 'select', 'editor'].includes(text) ? text : 'confirm' };
  emit({ type: 'extension_ui_request', ...pending, title: 'Fixture approval', options: ['Allow', 'Block'], prefill: 'Notes' });
}
function finish(wire) {
  if (wire.id !== pending?.id) throw new Error('Wrong request id');
  pending = undefined;
  emit({ type: 'message_start', message: { role: 'assistant', content: [] } });
  emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Fixture 世界\u2028' } });
  later(() => {
    save({ role: 'assistant', content: [{ type: 'text', text: `Fixture complete: ${JSON.stringify(wire)}` }] });
    emit({ type: 'agent_end', willRetry: false });
    later(() => { running = false; emit({ type: 'agent_settled' }); });
  });
}
function boardCommands() {
  return process.env.TASKSHARK_TASK_ID ? [{ name: 'taskshark-board-status', path: argument('--extension'),
    description: JSON.stringify({ taskID: process.env.TASKSHARK_TASK_ID, threadID: process.env.TASKSHARK_THREAD_ID,
      tools: ['brief_read', 'board_read', 'board_post', 'task_read', 'task_update'] }) }] : [];
}
function command(wire) {
  if (wire.type === 'get_commands') return response(wire, { commands: boardCommands() });
  if (wire.type === 'get_state') return response(wire, { sessionFile: file, isStreaming: running });
  if (wire.type === 'get_messages') return response(wire, { messages });
  if (wire.type === 'prompt') return start(wire);
  if (wire.type === 'extension_ui_response') return finish(wire);
  if (wire.type === 'abort') {
    for (const timer of timers) clearTimeout(timer);
    running = false; emit({ type: 'agent_settled' });
  }
  response(wire);
}
createInterface({ input: process.stdin }).on('line', line => command(JSON.parse(line)));
