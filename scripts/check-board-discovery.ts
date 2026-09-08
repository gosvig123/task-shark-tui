import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { executable } from '../src/config.js';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { readJsonl } from '../src/wire.js';
import { agentBoardTools, boardExtension, boardReady, boardStatusCommand } from '../src/agent-board-scope.js';

const home = mkdtempSync(join(tmpdir(), 'taskshark-discovery-'));
const binary = resolve(process.argv[2] ?? executable('pi', [join(homedir(), '.pi/agent/bin/pi')]));
const scope = { taskID: 'isolated-task-a', threadID: 'isolated-conversation-a' };
function environment(task: boolean): NodeJS.ProcessEnv {
  return { HOME: home, PATH: process.env.PATH, PI_CODING_AGENT_DIR: join(home, '.pi/agent'),
    PI_OFFLINE: '1', PI_TELEMETRY: '0', TASKSHARK_BOARD_ROOT: join(home, 'board'),
    ...(task ? { TASKSHARK_TASK_ID: scope.taskID, TASKSHARK_THREAD_ID: scope.threadID,
      TASKSHARK_TASK_BRIEF: JSON.stringify({ id: scope.taskID, title: 'Isolated task' }) } : {}) };
}
function probe(task: boolean, resumed = false): Promise<void> {
  return new Promise((done, reject) => {
    const args = ['--mode', 'rpc', ...(resumed ? ['--session', join(home, 'resume.jsonl')] : ['--no-session']),
      '--no-extensions', '--no-context-files', '--no-skills',
      '--no-prompt-templates', '--no-themes', ...(task ? ['--extension', boardExtension,
        '--extension', resolve('tests/fixtures/board-schema-probe.mjs')] : [])];
    const child = spawn(binary, args, { cwd: home, env: environment(task), stdio: 'pipe' });
    let stderr = '', received = false, schemaVerified = !task;
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`Discovery timed out: ${stderr}`)); }, 20_000);
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', () => { clearTimeout(timer); if (received) done(); else reject(new Error(`Discovery failed: ${stderr}`)); });
    readJsonl(child.stdout, line => {
      const wire = JSON.parse(line);
      if (wire.method === 'notify' && wire.message?.startsWith('Board JSON Schema validation passed')) {
        schemaVerified = true; console.log(wire.message);
      }
      if (wire.id !== 'discovery') return;
      try { assert.ok(schemaVerified, 'Real Pi schema validation must pass'); verify(wire, task); received = true; child.kill('SIGTERM'); }
      catch (error) { child.kill('SIGTERM'); reject(new Error(`${error}\n${stderr}`)); }
    });
    child.stdin.end(JSON.stringify({ id: 'discovery', type: 'get_commands' }) + '\n');
  });
}
function verify(wire: any, task: boolean): void {
  assert.equal(wire.success, true);
  const commands = wire.data.commands.filter((c: any) => c.name === boardStatusCommand);
  assert.equal(commands.length, task ? 1 : 0);
  if (task) {
    assert.equal(commands[0].description, boardReady(scope));
    assert.equal(commands[0].sourceInfo?.path ?? commands[0].path, boardExtension);
  }
  console.log(`${task ? 'Task' : 'General'} RPC discovery passed: ${task ? agentBoardTools.join(', ') : 'no Board integration'}`);
}
try {
  console.log(`Pi binary: ${resolve(binary)}; isolated HOME, offline, no prompt/model call.`);
  writeFileSync(join(home, 'resume.jsonl'), JSON.stringify({ type: 'session', version: 3,
    id: '00000000-0000-4000-a000-000000000002', timestamp: new Date().toISOString(), cwd: home }) + '\n', { mode: 0o600 });
  await probe(true); await probe(false); await probe(true, true);
  console.log('Resumed task RPC discovery passed with the same fixed task/conversation scope.');
} finally { rmSync(home, { recursive: true, force: true }); }
