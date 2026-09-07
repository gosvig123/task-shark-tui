import type { Conversation, LiveState, TranscriptMessage } from './model.js';
import { contentText, messageText, type PiMessage, type Wire } from './wire.js';

export function transcriptMessage(pi: PiMessage): TranscriptMessage {
  return { role: pi.role, text: messageText(pi), pi: structuredClone(pi) };
}
export function streamMessage(live: LiveState, wire: Wire): void {
  const event = wire.assistantMessageEvent;
  if (!event) return;
  live.streaming ??= { role: 'assistant', content: [] };
  const blocks = Array.isArray(live.streaming.content) ? live.streaming.content : [];
  live.streaming.content = blocks;
  const index = event.contentIndex ?? 0;
  const kind = event.type.split('_')[0];
  if (kind === 'toolcall') {
    blocks[index] ??= { type: 'toolCall', id: event.id, name: event.toolName, arguments: {} };
    if (event.toolCall) blocks[index] = structuredClone(event.toolCall);
    if (event.delta) blocks[index].argumentsText = (blocks[index].argumentsText ?? '') + event.delta;
  } else if (kind === 'text' || kind === 'thinking') {
    const block = blocks[index] ??= { type: kind, [kind]: '' };
    if (event.type.endsWith('_delta')) block[kind] = (block[kind] ?? '') + (event.delta ?? '');
    if (event.type.endsWith('_end') && event.content !== undefined) block[kind] = event.content;
  }
  live.partial = contentText(blocks.filter(b => b.type === 'text'));
}
export function toolEvent(c: Conversation, live: LiveState, wire: Wire): void {
  const id = wire.toolCallId ?? 'tool';
  const previous = live.tools.get(id);
  const pi: PiMessage = { role: 'toolResult', toolCallId: id, toolName: wire.toolName ?? previous?.toolName ?? 'tool',
    args: wire.args ?? previous?.args, ...(wire.result ?? wire.partialResult ?? {}), isError: wire.isError };
  live.tools.set(id, pi);
  if (wire.type !== 'tool_execution_end') return;
  c.messages.push(transcriptMessage(pi));
  live.tools.delete(id);
}
export function saveMessage(c: Conversation, pi: PiMessage): void {
  const existing = pi.role === 'toolResult' && pi.toolCallId ? c.messages.findIndex(m =>
    m.pi?.role === 'toolResult' && m.pi.toolCallId === pi.toolCallId) : -1;
  if (existing >= 0) c.messages[existing] = transcriptMessage({ ...c.messages[existing].pi, ...pi });
  else c.messages.push(transcriptMessage(pi));
}
