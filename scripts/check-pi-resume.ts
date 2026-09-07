import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { configuration } from '../src/config.js';
import { Store } from '../src/store.js';
import { RpcClient } from '../src/rpc.js';
import { piArguments } from '../src/pi-launch.js';

function branchedFixture(file: string, cwd: string): void {
  const timestamp = new Date().toISOString();
  const entries = [{ type: 'session', version: 3, id: randomUUID(), timestamp, cwd },
    ...[['00000001', null, 'Root fixture'], ['00000002', '00000001', 'Abandoned branch'],
      ['00000003', '00000001', 'Active branch']].map(([id, parentId, content]) => ({
      type: 'message', id, parentId, timestamp, message: { role: 'user', content, timestamp: Date.now() },
    }))];
  writeFileSync(file, entries.map(entry => JSON.stringify(entry)).join('\n') + '\n');
}
async function check(): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'task-shark-resume-'));
  const store = new Store(root, false), c = store.create('Resume fixture', '', '');
  c.sessionFile = join(store.sessions(c), 'branched.jsonl');
  branchedFixture(c.sessionFile, c.workspace);
  const args = [...piArguments(c, store.sessions(c)), '--no-extensions', '--no-skills',
    '--no-context-files', '--no-prompt-templates'];
  const client = new RpcClient(configuration().pi, args, c.workspace);
  client.on('failure', error => console.error(error.message));
  try {
    const state = await client.request('get_state');
    assert.equal(realpathSync(state.data!.sessionFile!), realpathSync(c.sessionFile));
    const history = await client.request('get_messages');
    assert.deepEqual(history.data!.messages!.map(m => m.content), ['Root fixture', 'Active branch']);
    const result = await client.request('bash', { command: 'pwd -P' });
    assert.equal((result.data as { output: string }).output.trim(), realpathSync(c.workspace));
    console.log('Installed Pi resumed v3 JSONL active branch and ran pwd in the fixed Agent Workspace. No model call.');
  } finally { await client.stop(); rmSync(root, { recursive: true, force: true }); }
}
check().catch(error => { console.error(error); process.exitCode = 1; });
