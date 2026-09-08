import { mkdirSync, readFileSync, writeFileSync, renameSync, statSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { conversationSchema, defaultConversationTitle, Status, LocalRole, type Conversation, type Task } from './model.js';
import { expandPath } from './config.js';

const indexSchema = z.object({ version: z.literal(1), conversations: z.array(conversationSchema) });
export class Store {
  readonly index: string;
  readonly conversations: Conversation[];
  constructor(readonly root: string, readonly demo: boolean) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    this.index = join(root, 'conversations.json');
    this.conversations = this.load();
  }
  private load(): Conversation[] {
    if (!existsSync(this.index)) return [];
    const { conversations } = indexSchema.parse(JSON.parse(readFileSync(this.index, 'utf8')));
    for (const c of conversations) {
      if (c.demo !== this.demo) throw new Error('Storage mode mismatch; use a separate data directory.');
      if (c.status === Status.running || c.status === Status.needsInput || c.inFlight) this.interrupted(c);
    }
    return conversations;
  }
  private interrupted(c: Conversation): void {
    c.status = Status.needsInput;
    c.error = 'Previous run ended or input expired. Send a new message to resume.';
    this.preserveSubmission(c);
    this.preserveQueue(c);
  }
  preserveSubmission(c: Conversation): void {
    if (!c.inFlight) return;
    c.messages.push({ role: LocalRole.unsentSubmission,
      text: `Delivery failed or is uncertain. Check history before manual resubmission:\n\n${c.inFlight}` });
    c.inFlight = undefined;
  }
  preserveQueue(c: Conversation): void {
    if (!c.queue.length) return;
    c.messages.push({ role: LocalRole.unsentQueue, text: c.queue.join('\n\n') });
    c.error = `${c.error ?? ''} Queued Messages were not replayed; copy them from the transcript to send again.`;
    c.queue = [];
  }
  save(): void {
    const text = JSON.stringify({ version: 1, conversations: this.conversations }, null, 2);
    const temporary = `${this.index}.tmp`;
    writeFileSync(temporary, text, { mode: 0o600 });
    renameSync(temporary, this.index);
  }
  create(title: string, workspace: string, model: string, task?: Task, firstMessage?: string): Conversation {
    const id = randomUUID();
    const directory = workspace ? expandPath(workspace) : join(this.root, 'workspaces', id);
    if (!workspace) mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (!statSync(directory).isDirectory()) throw new Error('Agent Workspace must be a directory.');
    const c: Conversation = {
      id, title: title.trim() || task?.title || defaultConversationTitle, workspace: directory,
      model: model.trim() || undefined, task: task ? structuredClone(task) : undefined,
      demo: this.demo, status: Status.finished, updatedAt: new Date().toISOString(), messages: [], queue: [],
      inFlight: firstMessage, needsGeneratedTitle: !title.trim(),
    };
    this.conversations.unshift(c);
    try { this.save(); }
    catch (error) {
      this.conversations.shift();
      if (!workspace) rmSync(directory, { recursive: true, force: true });
      throw error;
    }
    return c;
  }
  togglePin(c: Conversation): void {
    const previous = c.pinned;
    c.pinned = !previous;
    try { this.save(); }
    catch (error) { c.pinned = previous; throw error; }
  }
  sessions(c: Conversation): string {
    const path = join(this.root, 'sessions', c.id);
    mkdirSync(path, { recursive: true, mode: 0o700 });
    return path;
  }
}
