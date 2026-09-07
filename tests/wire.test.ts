import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { readJsonl, parseWire } from '../src/wire.js';
import { applyEvent } from '../src/events.js';
import { liveState, Status } from '../src/model.js';
import { Store } from '../src/store.js';
import { temporary } from './helpers.js';
import { safe } from '../src/ui/dialogs.js';

test('JSONL handles fragmented UTF-8, CRLF and Unicode separators inside strings', () => {
  const stream = new PassThrough(), lines: string[] = [];
  readJsonl(stream, line => lines.push(line));
  const text = JSON.stringify({ type: 'test', text: '世界\u2028\u2029' });
  const bytes = Buffer.from(text + '\r\n' + text + '\n');
  for (const byte of bytes) stream.write(Buffer.from([byte]));
  assert.deepEqual(lines, [text, text]);
  assert.equal(parseWire(lines[0]).type, 'test');
  assert.throws(() => parseWire('{}'));
  stream.end();
});
test('agent_end is not settled; authoritative message_end replaces streaming text', t => {
  const c = new Store(temporary(t), true).create('Test', '', ''), live = liveState();
  applyEvent(c, live, { type: 'agent_start' });
  applyEvent(c, live, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'partial' } });
  assert.equal(live.partial, 'partial');
  applyEvent(c, live, { type: 'message_end', message: { role: 'assistant', content: 'complete' } });
  applyEvent(c, live, { type: 'agent_end' });
  assert.equal(c.status, Status.running);
  assert.equal(live.partial, '');
  assert.equal(c.messages[0].text, 'complete');
  applyEvent(c, live, { type: 'agent_settled' });
  assert.equal(c.status, Status.review);
});
test('terminal content cannot emit control sequences', () => {
  assert.equal(safe('\x1b[2Jhello\x07\x1b]0;bad title\x07'), 'hello');
});
