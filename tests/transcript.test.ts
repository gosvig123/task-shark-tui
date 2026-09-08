import test from 'node:test';
import { AssistantMessageComponent } from '@earendil-works/pi-coding-agent';
import assert from 'node:assert/strict';
import { liveState, conversationSchema } from '../src/model.js';
import { applyEvent, interruptOutput } from '../src/events.js';
import { transcript } from '../src/ui/transcript.js';
import { conversationDetails } from '../src/ui/content.js';
import { safe } from '../src/ui/dialogs.js';
import { transcriptMessage } from '../src/transcript-state.js';
import { runtimeFixture, waitFor } from './helpers.js';
import { Store } from '../src/store.js';

function fixture() {
  const c = conversationSchema.parse({ id: '5fc9504d-9f3c-411c-bd18-a594e6cc23f3', title: 'Transcript',
    workspace: '/tmp', demo: true, status: 'Running', updatedAt: '', messages: [] });
  return { c, live: liveState() };
}
test('Pi transcript formats legacy Markdown and removes custom streaming labels', () => {
  const { c, live } = fixture();
  c.messages.push({ role: 'user', text: 'Hello' }, { role: 'assistant', text: '**Bold** and `code`' });
  live.partial = 'Streaming **answer**';
  const rendered = conversationDetails(c, live, 50);
  assert.match(rendered, /\x1b\[[0-9;]*m/);
  assert.match(safe(rendered), /Bold and code/);
  assert.match(safe(rendered), /Streaming answer/);
  assert.doesNotMatch(rendered, /Pi \(streaming\)|Activity\n|assistant\n/);
});
test('indexed thinking, text and tool arguments stream and final message is authoritative', () => {
  const { c, live } = fixture();
  for (const [contentIndex, type, delta] of [[0, 'thinking_delta', 'Reason'], [1, 'text_delta', '**Answer**']] as const) {
    applyEvent(c, live, { type: 'message_update', assistantMessageEvent: { type, delta, contentIndex } });
  }
  applyEvent(c, live, { type: 'message_update', assistantMessageEvent: {
    type: 'toolcall_start', contentIndex: 2, id: 'call', toolName: 'bash' } });
  applyEvent(c, live, { type: 'message_update', assistantMessageEvent: {
    type: 'toolcall_delta', contentIndex: 2, delta: '{"command":"echo' } });
  const rendered = safe(transcript(c, live, 60));
  assert.match(rendered, /Reason/); assert.match(rendered, /Answer/); assert.match(rendered, /echo/);
  applyEvent(c, live, { type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'Final' }] } });
  assert.equal(live.streaming, undefined); assert.equal(c.messages.length, 1);
  assert.equal(c.messages[0].pi?.content?.length, 1);
});
test('text and thinking start events render before their first delta', () => {
  for (const kind of ['text', 'thinking'] as const) {
    const { c, live } = fixture();
    applyEvent(c, live, { type: 'message_update', assistantMessageEvent: {
      type: `${kind}_start`, contentIndex: 0 } });
    assert.doesNotThrow(() => conversationDetails(c, live, 60));
    applyEvent(c, live, { type: 'message_update', assistantMessageEvent: {
      type: `${kind}_delta`, contentIndex: 0, delta: 'Visible content' } });
    assert.match(safe(conversationDetails(c, live, 60)), /Visible content/);
  }
});
test('saved empty text and thinking blocks do not crash the Pi renderer', () => {
  const { c, live } = fixture();
  c.messages.push(transcriptMessage({ role: 'assistant', content: [
    { type: 'text' }, { type: 'thinking' }, { type: 'text', text: 'Kept answer' }] }));
  const restored = conversationSchema.parse(JSON.parse(JSON.stringify(c)));
  assert.match(safe(conversationDetails(restored, live, 60)), /Kept answer/);
});
test('tool progress replaces cumulative output and saved result is not duplicated', () => {
  const { c, live } = fixture();
  applyEvent(c, live, { type: 'tool_execution_start', toolCallId: 'call', toolName: 'bash', args: { command: 'echo hi' } });
  applyEvent(c, live, { type: 'tool_execution_update', toolCallId: 'call', toolName: 'bash',
    partialResult: { content: [{ type: 'text', text: 'hi' }] } });
  assert.match(safe(transcript(c, live, 50)), /echo hi/);
  applyEvent(c, live, { type: 'tool_execution_end', toolCallId: 'call', toolName: 'bash', isError: true,
    result: { content: [{ type: 'text', text: 'failed' }], details: { exitCode: 1 } } });
  applyEvent(c, live, { type: 'message_end', message: { role: 'toolResult', toolCallId: 'call', toolName: 'bash',
    content: [{ type: 'text', text: 'failed' }], isError: true } });
  assert.equal(c.messages.length, 1); assert.equal(live.tools.size, 0);
  const restored = conversationSchema.parse(JSON.parse(JSON.stringify(c)));
  assert.deepEqual(restored.messages[0].pi?.args, { command: 'echo hi' });
  assert.match(safe(transcript(restored, live, 50)), /failed/);
});
test('untrusted terminal controls are removed before Pi formatting, including object keys', () => {
  const { c, live } = fixture();
  c.messages.push(transcriptMessage({ role: 'assistant', content: 'ok\x1b[31mRED\x1b]52;c;SECRET\x07\x1b[2J' }));
  c.messages.push(transcriptMessage({ role: 'toolResult', toolName: 'unknown', args: { '\x1b[31mKEY': 'value' } }));
  const output = transcript(c, live, 60);
  assert.doesNotMatch(output, /SECRET|\x1b\[31m|\x1b\[2J|\x1b\]/);
  assert.match(safe(output), /okRED/); assert.match(safe(output), /KEY/);
});
test('width changes reflow the transcript and interrupted thinking is kept', () => {
  const { c, live } = fixture();
  c.messages.push({ role: 'assistant', text: 'one two three four five six seven eight nine ten eleven twelve' });
  assert.ok(transcript(c, live, 20).split('\n').length > transcript(c, live, 70).split('\n').length);
  applyEvent(c, live, { type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: 'Kept thinking' } });
  interruptOutput(c, live);
  assert.match(safe(transcript(c, live, 60)), /Interrupted output\nKept thinking/);
  assert.equal(live.streaming, undefined);
});
test('unchanged saved messages render once, including messages without Pi metadata', () => {
  const { c, live } = fixture(), original = AssistantMessageComponent.prototype.render;
  let renders = 0;
  AssistantMessageComponent.prototype.render = function(width) { renders++; return original.call(this, width); };
  try {
    c.messages.push({ role: 'assistant', text: 'Saved answer' });
    transcript(c, live, 60); transcript(c, live, 60); assert.equal(renders, 1);
    live.partial = 'Streaming'; transcript(c, live, 60);
    live.partial += ' delta'; transcript(c, live, 60); assert.equal(renders, 3);
    c.messages[0].text = 'Changed answer'; transcript(c, live, 60); assert.equal(renders, 5);
  } finally { AssistantMessageComponent.prototype.render = original; }
});
test('cached transcript matches a fresh render after history and live output change', () => {
  const { c, live } = fixture();
  c.messages.push(transcriptMessage({ role: 'assistant', content: [
    { type: 'text', text: 'Original' }, { type: 'toolCall', id: 'call', name: 'bash', arguments: { command: 'echo original' } }] }));
  c.messages.push(transcriptMessage({ role: 'toolResult', toolCallId: 'call', toolName: 'bash', content: 'Original result' }));
  const compare = () => assert.equal(transcript(c, live, 60), transcript(structuredClone(c), structuredClone(live), 60));
  compare(); compare();
  const content = c.messages[0].pi!.content;
  assert.ok(Array.isArray(content)); content[1].arguments = { command: 'echo changed' };
  c.messages[1].pi!.content = 'Changed result'; compare();
  live.partial = 'First delta'; compare(); live.partial += ' next delta'; compare();
  c.messages.splice(0, 1); compare(); c.messages.length = 0; compare();
});
test('saved conversation retains structured Pi tool results on disk', async t => {
  const { store, runtime, root } = runtimeFixture(t);
  const c = store.create('History', root, '');
  await runtime.send(c, 'hello');
  await waitFor(() => runtime.state(c).requests.length > 0);
  const restored = new Store(root, false).conversations[0];
  assert.ok(restored.messages.some(m => m.pi?.role === 'toolResult'));
  assert.deepEqual(restored.messages.filter(m => m.pi), JSON.parse(JSON.stringify(c.messages.filter(m => m.pi))));
});
