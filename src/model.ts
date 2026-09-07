import { z } from 'zod';
import type { PiMessage } from './wire.js';

export const Status = {
  needsInput: 'Needs Input', running: 'Running', review: 'For Review', finished: 'Finished',
} as const;
export const LocalRole = {
  unsentQueue: 'Unsent Queued Messages', unsentSubmission: 'Unsent Submission', interrupted: 'Interrupted output',
} as const;
export const localRoles = new Set<string>(Object.values(LocalRole));
export const taskSchema = z.object({
  id: z.string(), title: z.string(), completed: z.boolean(), ownerList: z.string(),
  description: z.string().optional(), dueDate: z.string().optional(),
  startTime: z.string().optional(), estimateSeconds: z.number().optional(),
  recurrenceDays: z.number().optional(), placement: z.string().optional(),
  subtasks: z.array(z.object({ id: z.string(), title: z.string(), completed: z.boolean() })).default([]),
});
export type Task = z.infer<typeof taskSchema>;
export const messageSchema = z.object({ role: z.string(), text: z.string(),
  pi: z.custom<PiMessage>(value => !!value && typeof value === 'object' &&
    'role' in value && typeof value.role === 'string').optional() });
export type TranscriptMessage = z.infer<typeof messageSchema>;
export const conversationSchema = z.object({
  id: z.string().uuid(), title: z.string(), workspace: z.string(), model: z.string().optional(),
  task: taskSchema.optional(), sessionFile: z.string().optional(), demo: z.boolean(),
  status: z.enum(Object.values(Status)), updatedAt: z.string(), pinned: z.boolean().optional(),
  messages: z.array(messageSchema), error: z.string().optional(),
  queue: z.array(z.string()).default([]), inFlight: z.string().optional(),
});
export type Conversation = z.infer<typeof conversationSchema>;
export interface PiRequest {
  id: string; method: string; title?: string; message?: string; options?: string[];
  prefill?: string; placeholder?: string; timeout?: number;
}
export interface LiveState {
  requests: PiRequest[]; partial: string; activity: Map<string, string>;
  streaming?: PiMessage; tools: Map<string, PiMessage>;
  running: boolean; generation: number; agentStarted: boolean;
}
export const dialogMethods = new Set(['select', 'confirm', 'input', 'editor']);
export function liveState(): LiveState {
  return { requests: [], partial: '', activity: new Map(), tools: new Map(), running: false, generation: 0, agentStarted: false };
}
export const ConversationSection = { pinned: 'Pinned', today: 'Today', recent: 'Recent' } as const;
export const conversationSectionOrder = [ConversationSection.pinned, Status.needsInput, Status.review,
  ConversationSection.today, ConversationSection.recent];
export function sidebarSection(c: Conversation): string {
  if (c.pinned) return ConversationSection.pinned;
  if (c.status === Status.needsInput || c.status === Status.review) return c.status;
  return new Date(c.updatedAt).toDateString() === new Date().toDateString()
    ? ConversationSection.today : ConversationSection.recent;
}
