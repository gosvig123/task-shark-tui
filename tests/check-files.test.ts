import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { temporary } from './helpers.js';

test('file limits ignore recognized images but reject long text and unknown encodings', t => {
  const cwd = temporary(t), script = resolve('scripts/check-files.py');
  writeFileSync(join(cwd, 'image.png'), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 255]));
  mkdirSync(join(cwd, 'docs'));
  writeFileSync(join(cwd, 'docs/task-shark-architecture.visual-check.json'), '[\n' + '0,\n'.repeat(201) + '0]');
  writeFileSync(join(cwd, 'docs/task-shark-architecture.html'), '<div></div>\n'.repeat(201));
  writeFileSync(join(cwd, 'valid.txt'), 'text\n');
  assert.match(execFileSync('python3', [script], { cwd, encoding: 'utf8' }), /All/);
  writeFileSync(join(cwd, 'valid.txt'), 'line\n'.repeat(201));
  const long = spawnSync('python3', [script], { cwd, encoding: 'utf8' });
  assert.notEqual(long.status, 0); assert.match(long.stderr, /valid.txt: exceeds 200 lines/);
  writeFileSync(join(cwd, 'valid.txt'), Buffer.from([255]));
  const encoding = spawnSync('python3', [script], { cwd, encoding: 'utf8' });
  assert.notEqual(encoding.status, 0); assert.match(encoding.stderr, /valid.txt: unexpected non-UTF-8 text/);
});
