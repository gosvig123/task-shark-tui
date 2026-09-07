#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
const extension = process.argv[process.argv.indexOf('--extension') + 1];
const state = { sessionFile: join(process.env.HOME, 'session.jsonl'), isStreaming: false };
createInterface({ input: process.stdin }).on('line', line => {
  const wire = JSON.parse(line);
  let data = state;
  if (wire.type === 'get_commands') data = { commands: existsSync(join(process.env.HOME, 'disable-board')) ? [] : [{
    name: 'taskshark-board-status', path: extension,
    description: JSON.stringify({ taskID: process.env.TASKSHARK_TASK_ID, threadID: process.env.TASKSHARK_THREAD_ID,
      tools: ['brief_read', 'board_read', 'board_post'] }),
  }] };
  if (wire.type === 'prompt') data = { messages: [{ role: 'assistant', content: JSON.stringify({
    env: process.env, args: process.argv.slice(2), prompt: wire.message,
  }) }] };
  process.stdout.write(JSON.stringify({ type: 'response', id: wire.id, success: true, command: wire.type, data }) + '\n');
});
