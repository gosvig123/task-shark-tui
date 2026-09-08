import { selectorState } from './task-selector.js';
import { Tab, type View } from './view.js';
import { postBoard, workspaceSection } from './workspace.js';
import { moveWorkspace } from './workspace-navigation.js';

// Workspace keys run through the same modal guard as the global controls.
export async function workspaceKey(view: View, key: string): Promise<boolean> {
  if (!view.taskScope && view.tab !== Tab.tasks) return false;
  if (key === 'escape') {
    if (view.workspaceFocus === 'right') view.workspaceFocus = 'left';
    else selectorState(view).query = '';
    return true;
  }
  if (['1', '2', '3'].includes(key)) { workspaceSection(view, ['Details', 'Board Updates', 'Conversations'][Number(key) - 1] as typeof view.workspaceSection); return true; }
  if (key === 'enter') {
    if (view.workspaceFocus === 'left' && view.workspaceSection === 'Conversations') {
      const c = view.current()?.conversation; if (c) view.runtime.acknowledge(c);
    }
    view.workspaceFocus = 'right'; view.notice = ''; return true;
  }
  if (key === 'up' || key === 'down') {
    if (view.workspaceFocus === 'left') moveWorkspace(view, key === 'up' ? -1 : 1);
    else { view.follow = false; view.detail.scroll(key === 'up' ? -1 : 1); }
    return true;
  }
  return interactionKey(view, key);
}
async function interactionKey(view: View, key: string): Promise<boolean> {
  const section = view.workspaceSection;
  if (section === 'Board Updates') {
    if (key === 'end') { view.follow = false; view.detail.setScrollPerc(100); return true; }
    if (key === 'n') { await postBoard(view); return true; }
    if (key === 'f') { void view.boards.load(view.taskScope!.id); return true; }
    if (key === 'a' && view.workspaceFocus === 'right') { void view.boards.mark(view.taskScope!.id); return true; }
  }
  if (['m', 'x', 'p', 'a'].includes(key) && (view.workspaceFocus === 'left' || section !== 'Conversations')) {
    view.notice = 'Enter opens the preview for interaction. Board review: a reviews all loaded entries.'; return true;
  }
  return false;
}
