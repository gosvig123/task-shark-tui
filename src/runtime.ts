import { EventEmitter } from 'node:events';
import { Status, liveState, localRoles, type Conversation, type LiveState } from './model.js';
import { applyEvent, updateStatus, interruptOutput } from './events.js';
import { type Transport, RpcClient } from './rpc.js';
import { type Wire } from './wire.js';
import { transcriptMessage } from './transcript-state.js';
import { Store } from './store.js';
import { piArguments } from './pi-launch.js';
import { AgentBoardRpc } from './agent-board-rpc.js';
import type { ConversationNamer } from './conversation-namer.js';

export type ClientFactory = (c: Conversation, sessions: string) => Transport;
export class Runtime extends EventEmitter {
  readonly states = new Map<string, LiveState>();
  private clients = new Map<string, Transport>();
  private ready = new Map<string, Promise<Transport>>();
  private timers = new Set<NodeJS.Timeout>();
  private closing = false;
  constructor(readonly store: Store, private factory: ClientFactory, private namer?: ConversationNamer) { super(); }
  state(c: Conversation): LiveState {
    if (!this.states.has(c.id)) this.states.set(c.id, liveState());
    return this.states.get(c.id)!;
  }
  changed(persist = true): boolean {
    if (persist) {
      try { this.store.save(); } catch (error) { this.emit('fatal', error); return false; }
    }
    this.emit('change');
    return true;
  }
  private async connect(c: Conversation): Promise<Transport> {
    if (this.ready.has(c.id)) return this.ready.get(c.id)!;
    const client = this.factory(c, this.store.sessions(c));
    this.clients.set(c.id, client);
    client.on('event', wire => { if (this.clients.get(c.id) === client) this.event(c, wire); });
    client.on('failure', error => { if (this.clients.get(c.id) === client) void this.failed(c, error); });
    const ready = this.initialize(c, client);
    this.ready.set(c.id, ready);
    return ready;
  }
  private async initialize(c: Conversation, client: Transport): Promise<Transport> {
    const state = await client.request('get_state');
    if (!state.data?.sessionFile && !c.demo) throw new Error('Pi did not return a session file.');
    c.sessionFile = state.data?.sessionFile;
    const history = await client.request('get_messages');
    if (!c.demo) c.messages = (history.data?.messages ?? []).map(transcriptMessage)
      .concat(c.messages.filter(m => localRoles.has(m.role)));
    this.changed();
    return client;
  }
  async send(c: Conversation, text: string): Promise<void> {
    if (!text.trim() || this.closing) return;
    const live = this.state(c);
    if (live.running) { c.queue.push(text); this.changed(); return; }
    c.inFlight = text;
    live.running = true; live.agentStarted = false;
    const generation = ++live.generation;
    c.error = undefined;
    c.status = Status.running;
    if (!this.changed()) { live.running = false; return; }
    try {
      const client = await this.connect(c);
      await client.request('prompt', { message: text }, 0);
      this.namer?.start(c, text, () => this.changed());
      if (generation === live.generation && !live.agentStarted && live.running) {
        const state = await client.request('get_state');
        if (!state.data?.isStreaming && !live.requests.length) this.settled(c);
      }
    } catch (error) { if (!this.closing && generation === live.generation) await this.failed(c, error); }
  }
  private event(c: Conversation, wire: Wire): void {
    if (this.closing) return;
    applyEvent(c, this.state(c), wire);
    if (c.task && wire.type === 'tool_execution_end' && wire.toolName === 'board_post' && wire.isError === false) {
      this.emit('board-post', c.task.id);
    }
    if (wire.type === 'extension_ui_request' && wire.timeout) this.expireRequest(c, wire);
    if (wire.type === 'agent_settled') this.settled(c);
    else this.changed(wire.type !== 'message_update' && wire.type !== 'tool_execution_update');
  }
  private expireRequest(c: Conversation, wire: Wire): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      const live = this.state(c);
      if (!live.requests.some(request => request.id === wire.id)) return;
      live.requests = live.requests.filter(request => request.id !== wire.id);
      updateStatus(c, live);
      this.changed();
    }, wire.timeout);
    this.timers.add(timer);
  }
  private settled(c: Conversation): void {
    const live = this.state(c);
    live.running = false;
    live.requests = [];
    if (c.error) {
      this.store.preserveSubmission(c); this.store.preserveQueue(c); interruptOutput(c, live);
    } else c.inFlight = undefined;
    updateStatus(c, live);
    this.changed();
    if (!c.error && c.queue.length) {
      const next = c.queue.shift()!;
      void this.send(c, next);
    }
  }
  answer(c: Conversation, id: string, fields: Record<string, unknown>): void {
    const live = this.state(c);
    if (!live.requests.some(request => request.id === id)) throw new Error('Pi Request expired.');
    this.clients.get(c.id)?.respond(id, fields);
    live.requests = live.requests.filter(request => request.id !== id);
    updateStatus(c, live);
    this.changed();
  }
  acknowledge(c: Conversation): void {
    if (c.status === Status.review) { c.status = Status.finished; this.changed(); }
  }
  async abort(c: Conversation): Promise<void> {
    c.queue = [];
    const client = this.clients.get(c.id);
    if (!client) return;
    try {
      for (const request of this.state(c).requests) client.respond(request.id, { cancelled: true });
      this.state(c).requests = [];
      await client.request('clear_queue');
      await client.request('abort');
      await this.failed(c, new Error('Run stopped. Send a new message to resume.'));
    } catch (error) { await this.failed(c, error); }
  }
  private async failed(c: Conversation, error: unknown): Promise<void> {
    if (this.closing) return;
    c.error = String(error);
    this.store.preserveSubmission(c);
    this.store.preserveQueue(c);
    const live = this.state(c);
    live.generation++;
    interruptOutput(c, live);
    live.running = false;
    live.requests = [];
    c.status = Status.needsInput;
    const client = this.clients.get(c.id);
    this.clients.delete(c.id);
    this.ready.delete(c.id);
    this.changed();
    await client?.stop();
  }
  async close(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    this.namer?.close();
    for (const timer of this.timers) clearTimeout(timer);
    for (const c of this.store.conversations) {
      this.store.preserveSubmission(c); this.store.preserveQueue(c);
      interruptOutput(c, this.state(c));
    }
    this.changed();
    await Promise.all([...this.clients.values()].map(client => client.stop()));
    this.changed();
  }
}
export function realFactory(binary: string): ClientFactory {
  return (c, sessions) => c.task ? new AgentBoardRpc(binary, c, sessions) :
    new RpcClient(binary, piArguments(c, sessions), c.workspace);
}
