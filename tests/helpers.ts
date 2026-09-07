import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import type { TestContext } from 'node:test';
import { Store } from '../src/store.js';
import { Runtime } from '../src/runtime.js';
import { RpcClient } from '../src/rpc.js';
import { piArguments } from '../src/pi-launch.js';

export function temporary(t: TestContext): string {
  const path = mkdtempSync(join(tmpdir(), 'task-shark-test-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}
export function runtimeFixture(t: TestContext): { store: Store; runtime: Runtime; root: string } {
  const root = mkdtempSync(join(tmpdir(), 'task-shark-test-'));
  const store = new Store(root, false);
  const runtime = new Runtime(store, fakeFactory);
  runtime.on('fatal', error => { throw error; });
  t.after(async () => { await runtime.close(); rmSync(root, { recursive: true, force: true }); });
  return { store, runtime, root };
}
export async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt++) {
    if (predicate()) return;
    await setTimeout(10);
  }
  throw new Error('Timed out waiting for fixture state');
}

export const fakeFactory: import('../src/runtime.js').ClientFactory = (c, sessions) =>
  new RpcClient(process.execPath, [resolve('tests/fixtures/fake-pi.mjs'), ...piArguments(c, sessions)], c.workspace);
