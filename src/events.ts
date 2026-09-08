import { Status, LocalRole, type Conversation, type LiveState, type PiRequest, dialogMethods } from './model.js';
import { messageText, type Wire } from './wire.js';

import { streamMessage, toolEvent, saveMessage, transcriptMessage } from './transcript-state.js';

export function updateStatus(c: Conversation, live: LiveState): void {
  c.status = c.error ? Status.failed : live.requests.length ? Status.needsInput :
    live.running ? Status.running : Status.review;
}
function message(wire: Wire, live: LiveState, c: Conversation): void {
  if (wire.type === 'message_start' && wire.message?.role === 'assistant') {
    live.partial = ''; live.streaming = structuredClone(wire.message);
  }
  if (wire.type === 'message_update') streamMessage(live, wire);
  if (wire.type !== 'message_end' || !wire.message) return;
  const value = wire.message;
  if (value.role === 'assistant') {
    live.partial = ''; live.streaming = undefined;
    c.error = ['error', 'aborted'].includes(value.stopReason ?? '') ? messageText(value) || 'Run aborted.' : undefined;
  }
  saveMessage(c, value);
}
export function interruptOutput(c: Conversation, live: LiveState): void {
  if (live.streaming) c.messages.push({ ...transcriptMessage(live.streaming), role: LocalRole.interrupted });
  else if (live.partial) c.messages.push({ role: LocalRole.interrupted, text: live.partial });
  for (const text of live.activity.values()) c.messages.push({ role: LocalRole.interrupted,
    text: text.replace(' · running', ' · interrupted') });
  for (const pi of live.tools.values()) c.messages.push({ ...transcriptMessage(pi), role: LocalRole.interrupted,
    text: `${pi.toolName} · interrupted\n${JSON.stringify(pi.args ?? {})}\n${messageText(pi)}` });
  live.partial = ''; live.streaming = undefined;
  live.activity.clear(); live.tools.clear();
}
export function applyEvent(c: Conversation, live: LiveState, wire: Wire): void {
  if (wire.type === 'agent_start') { live.running = true; live.agentStarted = true; }
  if (wire.type.startsWith('message_')) message(wire, live, c);
  if (wire.type.startsWith('tool_execution_')) toolEvent(c, live, wire);
  if (wire.type === 'extension_error') c.messages.push({ role: 'Extension error', text: wire.error ?? 'Unknown error' });
  if (wire.type === 'extension_ui_request') extensionRequest(c, live, wire);
  if (wire.type === 'agent_settled') { live.running = false; live.requests = []; }
  c.updatedAt = new Date().toISOString();
  updateStatus(c, live);
}
function extensionRequest(c: Conversation, live: LiveState, wire: Wire): void {
  if (wire.id && wire.method && dialogMethods.has(wire.method)) {
    live.requests.push(wire as unknown as PiRequest);
  } else if (wire.method === 'notify') {
    c.messages.push({ role: 'Pi notification', text: String(wire.message ?? '') });
  }
}
