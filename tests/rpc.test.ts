import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { RpcClient } from '../src/rpc.js';
import { piArguments } from '../src/pi-launch.js';
import { Store } from '../src/store.js';
import { temporary } from './helpers.js';

test('RPC timeout rejects a command and shutdown reaps the unresponsive process', async t => {
  const root = temporary(t);
  const client = new RpcClient(process.execPath, ['-e', 'process.stdin.resume()'], root);
  client.on('failure', () => {});
  try { await assert.rejects(client.request('get_state', {}, 50), /timed out/); }
  finally { await client.stop(); }
});
test('RPC shutdown escalates when a process ignores SIGTERM', async t => {
  const root = temporary(t);
  const script = `process.on('SIGTERM',()=>{}); setInterval(()=>{},1000);` +
    `require('node:readline').createInterface({input:process.stdin}).on('line',line=>{` +
    `const r=JSON.parse(line); console.log(JSON.stringify({type:'response',id:r.id,success:true}));});`;
  const client = new RpcClient(process.execPath, ['-e', script], root);
  client.on('failure', () => {});
  await client.request('get_state');
  const started = Date.now();
  await client.stop();
  assert.ok(Date.now() - started >= 1400);
  assert.ok(Date.now() - started < 5000);
});
test('missing Pi executable becomes a visible error, not an unhandled event', async t => {
  const root = temporary(t), client = new RpcClient(join(root, 'missing-pi'), [], root);
  client.on('failure', () => {});
  try { await assert.rejects(client.request('get_state'), /ENOENT|not running/); }
  finally { await client.stop(); }
});
test('malformed RPC output rejects pending commands', async t => {
  const root = temporary(t);
  const client = new RpcClient(process.execPath, ['-e', 'console.log("not json");process.stdin.resume()'], root);
  client.on('failure', () => {});
  try { await assert.rejects(client.request('get_state'), /Invalid Pi output/); }
  finally { await client.stop(); }
});
test('missing session history is not silently replaced; empty rejected sessions may retry', t => {
  const root = temporary(t), c = new Store(root, false).create('Saved', root, '');
  c.sessionFile = join(root, 'missing.jsonl');
  assert.ok(piArguments(c, root).includes('--name'));
  c.messages.push({ role: 'user', text: 'Existing history' });
  assert.throws(() => piArguments(c, root), /session is missing/);
});
