import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configuration } from '../src/config.js';
import { loadTasks } from '../src/tasks.js';
import { RpcClient } from '../src/rpc.js';

async function checkLocal(): Promise<void> {
  const config = configuration();
  const root = mkdtempSync(join(tmpdir(), 'task-shark-handshake-'));
  console.log(`Local SQLite: ${(await loadTasks(root)).length} tasks in a fresh temporary store.`);
  const client = new RpcClient(config.pi, ['--mode', 'rpc', '--no-extensions', '--no-skills',
    '--no-prompt-templates', '--no-context-files', '--session-dir', root], root);
  client.on('failure', error => console.error(error.message));
  try {
    const state = await client.request('get_state');
    const history = await client.request('get_messages');
    if (!state.data?.sessionFile || history.data?.messages?.length !== 0) throw new Error('Unexpected Pi handshake.');
    console.log('Pi: get_state + get_messages passed. Empty private session; no prompt or model call.');
  } finally { await client.stop(); rmSync(root, { recursive: true, force: true }); }
}
checkLocal().catch(error => { console.error(String(error)); process.exitCode = 1; });
