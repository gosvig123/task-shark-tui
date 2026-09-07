import { transcript } from './transcript.js';
import { safe } from './dialogs.js';
import type { Conversation, LiveState, Task } from '../model.js';

export function taskDetails(task: Task, conversations: Conversation[]): string {
  const lines = [task.title, `Task List: ${task.ownerList}`, `State: ${task.completed ? 'Completed' : 'Pending'}`,
    `Due: ${task.dueDate || 'No date'} ${task.startTime ?? ''}`,
    `Estimate: ${task.estimateSeconds ? `${task.estimateSeconds / 60} minutes` : 'None'} · Recurrence: ${task.recurrenceDays ?? 'None'}`, '', task.description || 'No notes.', '', 'Subtasks'];
  lines.push(...task.subtasks.map(t => `${t.completed ? '[x]' : '[ ]'} ${t.title}`));
  lines.push('', 'Conversations');
  lines.push(...conversations.filter(c => c.task?.id === task.id && c.task.ownerList === task.ownerList)
    .map(c => `${c.status} · ${c.title}\n  ${c.workspace}`));
  lines.push('', 'Enter in Tasks: open Task Workspace · 3 in workspace: Conversations · n: new', 'e in Task Workspace: edit title, notes, and due date. Refresh may trigger tasks-go daily reset writes.');
  return lines.join('\n');
}
export function conversationDetails(c: Conversation, live: LiveState, width = 80): string {
  const lines = [c.title, `Agent Workspace: ${c.workspace}`, `Model: ${c.model ?? 'Pi default'}`,
    `State: ${c.status}`, c.task ? `Task: ${c.task.title} · ${c.task.ownerList}` : 'General conversation', ''];
  const heading = safe(lines.join('\n'));
  lines.length = 0;
  if (c.error) lines.push(`Needs Input\n${c.error}`, '');
  for (const request of live.requests) lines.push(`Pi Request: ${request.title ?? request.method}`,
    request.message ?? '', 'Press i to answer.');
  if (c.queue.length) lines.push('', 'Queued Messages', ...c.queue.map((text, i) => `${i + 1}. ${text}`));
  lines.push('', 'm: message · i: Pi Request · a: mark reviewed · x: stop run');
  return [heading, transcript(c, live, width), safe(lines.join('\n'))].join('\n');
}
export const welcome = [
  'Task Shark', '', 'Browse tasks with t. Start a general conversation with g.',
  'In Tasks: n creates a Pending task; l selects a Task List.', '',
  'Select a task, Enter, then n for a task-backed conversation.',
  'Existing Task Lists load automatically. f refreshes them.', '',
  'Pi runs in each conversation’s fixed Agent Workspace.',
  'Switch conversations while work continues. Completed work goes to For Review.', '',
  'Live Pi uses your configured credentials and tools. Model calls can cost money.',
  'Approval prompts come from your Pi extensions; this app is not a sandbox.',
].join('\n');
