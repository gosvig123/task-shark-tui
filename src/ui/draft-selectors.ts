import { statSync } from 'node:fs';
import type { Config } from '../config.js';
import { expandPath } from '../config.js';
import type { Task, Conversation } from '../model.js';
import type { ConversationDraft } from './conversation-draft.js';
import type { View } from './view.js';
import { chooseSearchable } from './list-search.js';
import { textInput } from './dialogs.js';
import { refreshTasks } from './refresh.js';
import { filterTasks, TaskFilter, taskLabel } from './task-filters.js';

export async function selectDraftTask(view: View, draft: ConversationDraft, config?: Config): Promise<void> {
  if (!view.catalog.lists.length && config) await refreshTasks(view, config);
  const options: { label: string; task?: Task }[] = [
    { label: 'General conversation (no task)' },
    ...filterTasks(view.catalog.tasks, TaskFilter.all).map(task => ({ label: taskLabel(task), task })),
  ];
  const selected = await chooseSearchable(view.screen, 'Conversation task · search all loaded tasks', options, option => option.label);
  if (selected !== undefined) draft.task = selected.task;
}
const WorkspaceKind = { private: 'private', custom: 'custom', existing: 'existing' } as const;
export interface WorkspaceChoice { label: string; kind: typeof WorkspaceKind[keyof typeof WorkspaceKind]; path: string }
export function workspaceChoices(conversations: Conversation[], current: string): WorkspaceChoice[] {
  const paths = new Set([current, process.cwd(), ...conversations.map(c => c.workspace)].filter(Boolean));
  return [
    { label: 'New private directory', kind: WorkspaceKind.private, path: '' },
    { label: 'Enter a directory path…', kind: WorkspaceKind.custom, path: '' },
    ...[...paths].map(path => ({ label: path, kind: WorkspaceKind.existing, path })),
  ];
}
export async function selectDraftWorkspace(view: View, draft: ConversationDraft): Promise<void> {
  const options = workspaceChoices(view.runtime.store.conversations, draft.workspace);
  const selected = await chooseSearchable(view.screen, 'Agent Workspace', options, option => option.label);
  if (selected === undefined) return;
  const path = selected.kind === WorkspaceKind.custom ?
    await textInput(view.screen, 'Agent Workspace · existing directory path', draft.workspace) : selected.path;
  if (path === undefined) return;
  try {
    if (selected.kind === WorkspaceKind.custom && !path.trim()) throw new Error('Enter a directory path.');
    if (path && !statSync(expandPath(path)).isDirectory()) throw new Error('The path is not a directory.');
    draft.workspace = path ? expandPath(path) : '';
    view.notice = '';
  } catch (error) { view.notice = `Cannot select Agent Workspace ${path}: ${String(error)} Choose an existing directory with Ctrl-W.`; }
}
