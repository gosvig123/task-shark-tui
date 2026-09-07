import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { Transport } from './rpc.js';
import type { Wire } from './wire.js';
import type { Task } from './model.js';

export const demoTasks: Task[] = [
  { id: 'calendar', title: 'Fix calendar sync', ownerList: 'Task Shark Demo', completed: false,
    description: 'Find duplicate event subscriptions. This is fixture data, not a real task.',
    dueDate: '2026-09-10', subtasks: [{ id: 'test', title: 'Check cancelled meetings', completed: false }] },
  { id: 'release', title: 'Prepare release notes', ownerList: 'Task Shark Demo', completed: false,
    description: 'Summarize the terminal workbench changes.', subtasks: [] },
];
export class DemoClient extends EventEmitter implements Transport {
  private running = false;
  private timers = new Set<NodeJS.Timeout>();
  private requestId?: string;
  private requestKind = 'confirm';
  async request(type: string, fields: Record<string, unknown> = {}): Promise<Wire> {
    if (type === 'prompt') this.start(String(fields.message));
    if (type === 'abort') { await this.stop(); this.emit('event', { type: 'agent_settled' }); }
    return { type: 'response', success: true, command: type,
      data: { isStreaming: this.running, messages: [] } };
  }
  private emitEvent(wire: Record<string, unknown>): void { this.emit('event', wire); }
  private later(delay: number, action: () => void): void {
    const timer = setTimeout(() => { this.timers.delete(timer); action(); }, delay);
    this.timers.add(timer);
  }
  private start(text: string): void {
    this.running = true;
    this.emitEvent({ type: 'agent_start' });
    this.emitEvent({ type: 'message_end', message: { role: 'user', content: text } });
    this.later(200, () => this.emitEvent({ type: 'tool_execution_start', toolCallId: 'demo',
      toolName: 'read', args: { path: 'demo/calendar.ts' } }));
    this.later(600, () => this.emitEvent({ type: 'tool_execution_end', toolCallId: 'demo', toolName: 'read',
      result: { content: [{ type: 'text', text: 'Offline fixture: two subscriptions found.' }] } }));
    this.later(900, () => this.ask(text));
  }
  private ask(text: string): void {
    this.requestId = randomUUID();
    this.requestKind = /\b(input|select|editor)\b/.exec(text)?.[1] ?? 'confirm';
    this.emitEvent({ type: 'extension_ui_request', id: this.requestId, method: this.requestKind,
      title: 'Continue the offline demonstration?', message: text.includes('long approval') ?
        Array.from({ length: 80 }, (_, index) => `Approval detail ${index + 1}: no files or services will change.`).join('\n') :
        'No files or services will change.',
      options: ['Continue', 'Stop'], prefill: 'Demo notes' });
  }
  respond(id: string, fields: Record<string, unknown>): void {
    if (id !== this.requestId) throw new Error('Unknown demo request');
    this.requestId = undefined;
    this.finish(fields.cancelled ? 'Cancelled safely.' : 'Demo complete. No model calls or task mutations.');
  }
  private finish(text: string): void {
    this.emitEvent({ type: 'message_start', message: { role: 'assistant', content: [] } });
    const words = text.split(' ');
    words.forEach((word, index) => this.later(index * 90, () => this.emitEvent({
      type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: word + ' ' },
    })));
    this.later(words.length * 90, () => {
      this.emitEvent({ type: 'message_end', message: { role: 'assistant', content: text } });
      this.running = false;
      this.emitEvent({ type: 'agent_end' });
      this.emitEvent({ type: 'agent_settled' });
    });
  }
  async stop(): Promise<void> {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.running = false;
  }
}
