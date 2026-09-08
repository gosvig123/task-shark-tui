import { transcript } from './transcript.js';
import { safe } from './dialogs.js';
import { Status, type Conversation, type LiveState, type Task } from '../model.js';

export function taskDetails(task: Task, conversations: Conversation[]): string {
  const lines = [task.title, `Task List: ${task.ownerList}`, `State: ${task.completed ? 'Completed' : 'Pending'}`,
    `Due: ${task.dueDate || 'No date'} ${task.startTime ?? ''}`,
    `Estimate: ${task.estimateSeconds ? `${task.estimateSeconds / 60} minutes` : 'None'} · Recurrence: ${task.recurrenceDays ?? 'None'}`, '', task.description || 'No notes.', '', 'Subtasks'];
  lines.push(...task.subtasks.map(t => `${t.completed ? '[x]' : '[ ]'} ${t.title}`));
  const attached = conversations.filter(c => c.task?.id === task.id);
  if (attached.length) lines.push('', 'Conversations', ...attached.map(c => `${c.status} · ${c.title}\n  ${c.workspace}`));
  return lines.join('\n');
}
export function conversationDetails(c: Conversation, live: LiveState, width = 80): string {
  const lines = [c.title, `Agent Workspace: ${c.workspace}`, `Model: ${c.model ?? 'Pi default'}`,
    `State: ${c.status}`, c.task ? `Task: ${c.task.title} · ${c.task.ownerList}` : 'General conversation', ''];
  const heading = safe(lines.join('\n'));
  lines.length = 0;
  if (c.error) lines.push(`${Status.failed}\n${c.error}`, '');
  for (const request of live.requests) lines.push(`Pi Request: ${request.title ?? request.method}`,
    request.message ?? '', 'Press m to answer the Pi Request.');
  if (c.queue.length) lines.push('', 'Queued Messages', ...c.queue.map((text, i) => `${i + 1}. ${text}`));
  lines.push('', 'm: message · a: mark reviewed · x: stop run');
  return [heading, transcript(c, live, width), safe(lines.join('\n'))].join('\n');
}
export const welcome = [
  'Task Shark', '', 'Browse tasks with t. Start a general conversation with c, then n.',
  'In Tasks: n creates a Pending task; l selects a Task List.', '',
  'Select a task, press 2, then n for a task-backed conversation.',
  'Existing Task Lists load automatically. f refreshes them.', '',
  'Pi runs in each conversation’s fixed Agent Workspace.',
  'Switch conversations while work continues. Completed work goes to For Review.', '',
  'Live Pi uses your configured credentials and tools. Model calls can cost money.',
  'Approval prompts come from your Pi extensions; this app is not a sandbox.',
].join('\n');
