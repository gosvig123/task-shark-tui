import { allProgress } from './board-preview.js';
import blessed from 'blessed';
import { workspaceWidth } from './workspace-navigation.js';
import type { Task } from '../model.js';
import type { View } from './view.js';
import { safe, textInput } from './dialogs.js';
import { cursorInput } from './cursor-input.js';
import type { Config } from '../config.js';
import { selectDraftTask, selectDraftWorkspace } from './draft-selectors.js';

export interface ConversationDraft { text: string; title: string; workspace: string; model: string; task?: Task }
export function emptyDraft(task?: Task): ConversationDraft {
  return { text: '', title: '', workspace: '', model: '', task };
}
export function submitDraft(view: View, draft: ConversationDraft): boolean {
  if (!draft.text.trim()) return false;
  const c = view.runtime.store.create(draft.title, draft.workspace, draft.model, draft.task, draft.text);
  view.selected = c.id; view.taskScope = draft.task;
  view.workspaceSection = 'Conversations'; view.workspaceFocus = 'right'; view.boardSequence = allProgress;
  if (draft.task) void view.boards.load(draft.task.id);
  void view.runtime.send(c, draft.text);
  return true;
}
export async function editDraft(view: View, draft: ConversationDraft, config?: Config): Promise<boolean> {
  view.draft = draft;
  try {
    for (;;) {
      const action = await draftInput(view, draft);
      if (action === 'cancel') { view.notice = 'Conversation draft discarded. Nothing saved.'; return false; }
      if (action === 'settings') { await settings(view, draft); continue; }
      if (action === 'task') { await selectDraftTask(view, draft, config); continue; }
      if (action === 'workspace') { await selectDraftWorkspace(view, draft); continue; }
      try { if (submitDraft(view, draft)) return true; }
      catch (error) { view.notice = String(error); }
    }
  } finally { view.draft = undefined; view.detail.bottom = 3; }
}
type DraftAction = 'send' | 'cancel' | 'settings' | 'task' | 'workspace';
async function draftInput(view: View, draft: ConversationDraft): Promise<DraftAction> {
  const panel = blessed.box({ parent: view.screen, left: view.taskScope ? workspaceWidth(view) : '32%', right: 0, bottom: 3,
    height: 7, border: 'line', label: ' Message · Ctrl-W word · Ctrl-U clear all ', style: { border: { fg: 'cyan' } } });
  const commands: Record<string, DraftAction> = { o: 'settings', t: 'task', g: 'workspace' };
  let action: DraftAction = 'send';
  const resize = () => { panel.left = view.taskScope ? workspaceWidth(view) : '32%'; view.screen.render(); };
  view.screen.on('resize', resize); view.detail.bottom = 10; view.render();
  try {
    const value = await cursorInput(view.screen, { parent: panel, top: 0, left: 0, right: 0, bottom: 0 }, draft.text, true, safe, key => {
      const next = key.ctrl && key.name ? commands[key.name] : undefined;
      if (!next) return false;
      action = next; return true;
    });
    if (value === undefined) return 'cancel';
    draft.text = value; return action;
  } finally { view.screen.removeListener('resize', resize); panel.destroy(); }
}
async function settings(view: View, draft: ConversationDraft): Promise<void> {
  const title = await textInput(view.screen, 'Draft title (optional)', draft.title);
  if (title === undefined) return;
  const model = await textInput(view.screen, 'Pi model · provider/model or blank for Pi default', draft.model);
  if (model === undefined) return;
  Object.assign(draft, { title, model });
}
