// Throwaway fixture state. Never imports Runtime, Store, Pi, or tasks-go.
export const kinds = ['Note', 'Progress', 'Decision', 'Blocker', 'Handoff'] as const;
export interface Update { sequence: number; kind: string; body: string; actor: string; source: string; time: string }
export interface BoardTask { title: string; notes: string; subtasks: string[]; entries: Update[]; reviewed: number }
export const tasks: BoardTask[] = [
  { title: 'Prepare sample release', notes: 'A fictional task for exploring Board Updates.',
    subtasks: ['[x] Draft release notes', '[ ] Review the sample package'], reviewed: 2,
    entries: kinds.map((kind, i) => ({ sequence: i + 1, kind, actor: i % 2 ? 'Agent' : 'Human',
      source: i % 2 ? 'Release conversation' : 'Human', time: `09:0${i}`,
      body: ['Keep the release small and reversible.', 'Draft notes are ready for review.',
        'Use the existing package format for this release.', 'The sample package still needs a reviewer.',
        'Next: review the package, then record the release decision here.'][i] })) },
  { title: 'Plan sample documentation', notes: 'An empty Board Updates feed, separate from the first task.',
    subtasks: ['[ ] Choose an outline'], entries: [], reviewed: 0 },
];
export function append(task: BoardTask, kind: string, body: string, agent = false): void {
  if (!body.trim()) return;
  task.entries.push({ sequence: (task.entries.at(-1)?.sequence ?? 0) + 1, kind, body: body.trim(),
    actor: agent ? 'Agent' : 'Human', source: agent ? 'Simulated conversation' : 'Human', time: 'Now' });
}
export function entryText(entry: Update, task: BoardTask): string {
  return `#${entry.sequence} ${entry.kind} · ${entry.actor} · ${entry.source} · ${entry.time}` +
    `${entry.sequence > task.reviewed ? ' · Unread' : ' · Reviewed'}\n${entry.body}`;
}
export function details(task: BoardTask): string {
  return `Details\nTask List: Prototype\nState: Pending\n\n${task.notes}\n\nSubtasks\n${task.subtasks.join('\n')}`;
}
export function feed(task: BoardTask): string {
  return task.entries.map(e => entryText(e, task)).join('\n\n') || 'No Board Updates. Press n to add an update.';
}
