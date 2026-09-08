import { allProgress, previewEntries } from './board-preview.js';
import { snapshot, restore, taskKey, type NavigationSnapshot } from './navigation-memory.js';
import type { View } from './view.js';
import type { Task } from '../model.js';
import { boardKinds } from '../board.js';
import { canReview } from '../board-state.js';
import { choose, safe, textInput } from './dialogs.js';
import { taskDetails, conversationDetails } from './content.js';

export type WorkspaceSection = 'Details' | 'Board Updates' | 'Conversations';
export type WorkspaceReturn = NavigationSnapshot;
export function openWorkspace(view: View, task: Task, conversation = false): void {
  const selected = view.selected;
  view.workspaceReturn ??= snapshot(view); view.navigation.save(view);
  const remembered = view.navigation.tasks.get(taskKey(task));
  restore(view, remembered ?? { tab: 'Conversations', query: '', selected: '', taskFilter: view.taskFilter,
    follow: true, scroll: 0, section: 'Details', boardSequence: allProgress });
  view.taskScope = task; view.tab = 'Conversations'; view.query = ''; view.notice = '';
  if (conversation) { view.workspaceSection = 'Conversations'; view.selected = selected; view.follow = true; }
  view.workspaceFocus = conversation ? 'right' : 'left';
  if (!remembered) void view.boards.load(task.id);
}
export function workspaceSection(view: View, section: WorkspaceSection): void {
  if (!view.taskScope) return;
  view.workspaceSection = section; view.workspaceFocus = 'left'; view.follow = true; view.notice = '';
  if (section === 'Board Updates' && !view.boards.state(view.taskScope.id).loaded) void view.boards.load(view.taskScope.id);
}
export function workspaceContent(view: View): string {
  const task = view.taskScope;
  if (!task) return view.refreshing ? 'Loading Task Lists…' : 'No tasks match the current filters.\n/ search · l lists · o filters · n new task · f refresh';
  if (view.workspaceSection === 'Details') return safe(taskDetails(task, view.runtime.store.conversations));
  if (view.workspaceSection === 'Board Updates') return boardContent(view);
  const c = view.current()?.conversation;
  return c ? conversationDetails(c, view.runtime.state(c), Number(view.detail.width) - 3) :
    'Conversations\n\nNo conversations for this task. Press n to start one.';
}
function boardContent(view: View): string {
  const s = view.boards.state(view.taskScope!.id);
  const count = s.entries.filter(e => e.sequence > s.reviewed).length;
  const entries = previewEntries(s, view.boardSequence);
  const aggregate = !s.entries.some(entry => entry.sequence === view.boardSequence);
  const lines = [`Board Updates · ${count}${s.earlier ? '+' : ''} unread`,
    aggregate ? `All progress · ${s.entries.length} loaded updates · all kinds` : `Update #${view.boardSequence}`,
    `a reviews all ${s.entries.length} loaded updates.`, ''];
  if (s.loading) lines.push('Loading shared updates…', '');
  if (s.writing) lines.push('Saving…', '');
  if (s.earlier) lines.push('Showing latest 100 entries. Earlier updates exist in the task widget.', '');
  if (s.pending) lines.push('Uncertain submission retained. Press n to retry safely with the same request ID.', safe(s.pending.body), '');
  if (s.error) lines.push(safe(s.error), '');
  if (!s.entries.length) lines.push(s.loaded ? 'No Board Updates. Press n to post.' : 'Press f to load Board Updates.');
  if (s.entries.length && !canReview(s) && count) lines.push('Review disabled: earlier unread entries are not shown. Review them in the task widget.');
  for (const e of entries) lines.push(`\x1b[1m${e.sequence > s.reviewed ? '● NEW' : '○ Read'} · ${e.kind.toUpperCase()}  #${e.sequence}\x1b[22m`,
    '', safe(e.body), '', safe(`${e.actorKind === 'human' ? 'Human' : 'Agent'} · ${e.createdAt}${e.source && e.source.toLowerCase() !== e.actorKind ? '\n' + e.source : ''}`), '', '────────────────────', '');
  return lines.join('\n');
}
export async function postBoard(view: View): Promise<void> {
  const id = view.taskScope!.id, s = view.boards.state(id);
  if (s.loading || s.writing) return;
  if (s.pending) {
    if (await choose(view.screen, 'Retry retained Board Update? Same request ID prevents duplicates.', ['Cancel', 'Retry']) === 'Retry') void view.boards.retry(id);
    return;
  }
  const kind = await choose(view.screen, 'Board Update kind', [...boardKinds]);
  if (!kind) return;
  let body = '';
  for (;;) {
    const value = await textInput(view.screen, `${kind} · Board Update · Ctrl-S post · 4000 characters / 16384 bytes maximum`, body, true);
    if (!value?.trim()) return;
    body = value;
    if (body.length <= 4000 && Buffer.byteLength(body) <= 16384) break;
    view.notice = 'Update is too long. Shorten the retained text before posting.';
  }
  void view.boards.post(id, kind as typeof boardKinds[number], body);
}
export function workspaceFooter(view: View): string {
  const controls = view.workspaceSection === 'Board Updates' ? 'n post/retry · a review loaded · f refresh · PgUp/PgDn scroll' :
    view.workspaceSection === 'Details' ? 'n task · e edit · / search · l lists · o filters · f refresh · q quit' :
      'n new · m message · a review · q quit';
  const notice = view.taskScope && view.todayRemovals?.has(taskKey(view.taskScope)) ? 'Date saved; Today removal pending. e retries removal only.' : view.notice;
  return ` 1/2/3 sections · ${view.workspaceFocus === 'left' ? '↑↓ preview · Enter open · Esc clear search' : '↑↓ scroll · Esc left'}\n ${controls}\n ${notice}`;
}
