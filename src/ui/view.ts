import { NavigationMemory, restoreScroll } from './navigation-memory.js';
import { workspacePanels, renderNavigation } from './workspace-navigation.js';
import { Boards } from '../board-state.js';
import { workspaceContent, workspaceFooter, type WorkspaceSection, type WorkspaceReturn } from './workspace.js';
import type { ConversationDraft } from './conversation-draft.js';
import blessed from 'blessed';
import { Status, sidebarSection, conversationSectionOrder, type Conversation, type Task } from '../model.js';
import type { Runtime } from '../runtime.js';
import { conversationDetails, taskDetails, welcome } from './content.js';
import { safe } from './dialogs.js';
import type { TaskCatalog } from '../tasks.js';
import { selectionStyle } from './styles.js';
import { filterTasks, taskLabel, TaskFilter, type TaskFilterValue } from './task-filters.js';

export const Tab = { conversations: 'Conversations', tasks: 'Tasks', review: 'For Review Inbox' } as const;
export interface Row { key: string; label: string; conversation?: Conversation; task?: Task }
export class View {
  readonly screen = blessed.screen({ smartCSR: true, fullUnicode: true, title: 'Task Shark',
    autoPadding: true, dockBorders: true });
  readonly header = blessed.box({ parent: this.screen, top: 0, height: 2, style: { fg: 'cyan' } });
  readonly list = blessed.list({ parent: this.screen, top: 2, bottom: 3, left: 0, width: '32%',
    border: 'line', keys: false, tags: false, style: { selected: selectionStyle } });
  readonly detail = blessed.box({ parent: this.screen, top: 2, bottom: 3, left: '32%', right: 0,
    border: 'line', scrollable: true, alwaysScroll: true, tags: false, scrollbar: { ch: '│' } });
  readonly footer = blessed.box({ parent: this.screen, bottom: 0, height: 3, style: { fg: 'gray' } });
  tab: string = Tab.conversations;
  catalog: TaskCatalog = { tasks: [], lists: [], currentList: '', byList: new Map() };
  listFilter?: string;
  taskFilter: TaskFilterValue = TaskFilter.all;
  taskScope?: Task;
  workspaceSection: WorkspaceSection = 'Details';
  workspaceFocus: 'left' | 'right' = 'left';
  boardSequence?: number;
  readonly workspacePanels = workspacePanels(this);
  workspaceReturn?: WorkspaceReturn;
  readonly navigation = new NavigationMemory();
  readonly todayRemovals = new Set<string>();
  pendingScroll?: number;
  readonly boards: Boards;
  query = '';
  selected = '';
  draft?: ConversationDraft;
  busy = false;
  refreshing = false;
  refreshAbort?: AbortController;
  notice = '';
  follow = true;
  private pendingRender?: NodeJS.Timeout;
  constructor(readonly runtime: Runtime) {
    this.boards = new Boards(() => this.schedule(), runtime.store.demo);
    runtime.on('change', () => this.schedule());
    this.screen.on('resize', () => this.render());
  }
  schedule(): void {
    this.pendingRender ??= setTimeout(() => { this.pendingRender = undefined; this.render(); }, 40);
  }
  rows(): Row[] {
    if (this.tab === Tab.tasks) return filterTasks(
      this.listFilter ? this.catalog.byList.get(this.listFilter) ?? [] : this.catalog.tasks, this.taskFilter, this.query)
      .map(task => ({ key: `${task.ownerList}/${task.id}`, label: taskLabel(task), task }));
    const rank: readonly string[] = conversationSectionOrder;
    return this.runtime.store.conversations.filter(c => this.include(c))
      .sort((a, b) => rank.indexOf(sidebarSection(a)) - rank.indexOf(sidebarSection(b)) || b.updatedAt.localeCompare(a.updatedAt))
      .map(conversation => ({ key: conversation.id, conversation,
        label: `${sidebarSection(conversation)} · ${conversation.pinned ? conversation.status + ' · ' : ''}${conversation.status === Status.running ? '▶ ' : ''}${conversation.title}` }));
  }
  private matches(text: string): boolean { return text.toLowerCase().includes(this.query.toLowerCase()); }
  private include(c: Conversation): boolean {
    if (this.tab === Tab.review && c.status !== Status.review) return false;
    if (this.taskScope && (c.task?.id !== this.taskScope.id || c.task?.ownerList !== this.taskScope.ownerList)) return false;
    return this.matches(`${c.title} ${c.workspace} ${c.task?.title ?? ''}`);
  }
  current(): Row | undefined { const rows = this.rows(); return rows.find(r => r.key === this.selected) ?? rows[0]; }
  move(delta: number): void {
    const rows = this.rows();
    const index = Math.max(0, rows.findIndex(r => r.key === this.selected));
    this.selected = rows[Math.max(0, Math.min(rows.length - 1, index + delta))]?.key ?? '';
    this.follow = true;
    this.render();
  }
  switchTab(tab: string): void {
    this.navigation.tab(this, tab);
    this.render();
  }
  private renderWorkspace(): void {
    this.selected = this.current()?.key ?? '';
    const board = this.boards.state(this.taskScope!.id);
    if (board.loaded && !board.entries.some(e => e.sequence === this.boardSequence)) this.boardSequence = board.entries[0]?.sequence;
    this.list.hide(); renderNavigation(this);
    this.header.setContent(safe(` TASK SHARK · Task Workspace · ${this.taskScope!.ownerList}\n ${this.taskScope!.title} · ${this.workspaceSection}`));
    this.detail.setContent(this.draft ? safe(`New Conversation · unsaved\nTask: ${this.taskScope!.title}\nAgent Workspace: ${this.draft.workspace || 'New private directory (created on send)'}`) : workspaceContent(this));
    if (this.follow) this.detail.setScrollPerc(!this.draft && this.workspaceSection === 'Conversations' && this.current()?.conversation ? 100 : 0);
    this.footer.setContent(safe(this.draft ? ' New Conversation · unsaved\n Ctrl-S send · Ctrl-T task · Ctrl-W workspace · Ctrl-O settings\n Esc discard' : workspaceFooter(this))); this.footer.style.fg = 'default';
    restoreScroll(this); this.screen.render();
  }
  render(): void {
    if (this.taskScope) { this.renderWorkspace(); return; }
    this.workspacePanels.forEach(panel => panel.hide()); this.detail.setLabel(''); this.detail.style.border.fg = 'default';
    this.list.show(); this.detail.left = '32%';
    if (this.catalog.lists.length && this.listFilter && !this.catalog.lists.includes(this.listFilter)) this.listFilter = undefined;
    const rows = this.rows(), row = this.current();
    this.selected = row?.key ?? '';
    this.list.setItems(rows.map(r => safe(r.label)));
    this.list.select(Math.max(0, rows.findIndex(r => r.key === this.selected)));
    const conversations = this.runtime.store.conversations;
    const reviews = conversations.filter(c => c.status === Status.review).length;
    const needs = conversations.filter(c => c.status === Status.needsInput).length;
    this.header.setContent(safe(` TASK SHARK ${this.runtime.store.demo ? '· OFFLINE DEMO' : '· LIVE PI'}   [c] Conversations   [t] Tasks   [r] For Review (${reviews})\n ${this.tab === Tab.tasks ? `Tasks · ${this.taskFilter} · Due ↓ · List: ${this.listFilter ?? 'All Lists'} · Active: ${this.catalog.currentList || 'not loaded'}` : this.tab} · Needs Input ${needs}${this.query ? ` · Search: ${this.query}` : ''}`));
    const detail = this.draft ? `New Conversation · unsaved\nTask: ${this.draft.task ? this.draft.task.title + ' · ' + this.draft.task.ownerList : 'General (no task)'}\nAgent Workspace: ${this.draft.workspace || 'New private directory (created on send)'}\n\nCtrl-T choose task · Ctrl-W choose workspace\nCtrl-O title and model` : row?.task ? taskDetails(row.task, conversations) : row?.conversation ?
      conversationDetails(row.conversation, this.runtime.state(row.conversation), Number(this.detail.width) - 3) : this.tab === Tab.tasks ?
        'No tasks match the current filters.\nPress o to change the task filter, / to search, or Esc to clear all filters.' : welcome;
    this.detail.setContent(!this.draft && row?.conversation ? detail : safe(detail));
    if (this.follow) this.detail.setScrollPerc(row?.conversation ? 100 : 0);
    this.footer.setContent(safe(this.draft ? ` New Conversation · unsaved · ${this.draft.task ? 'Task: ' + this.draft.task.title : 'General'}\n Ctrl-S send · Ctrl-T task · Ctrl-W workspace · Ctrl-O settings · Esc discard\n ${this.notice}` : ` ↑↓ select · Enter open · n new · g general · m message · i input · a reviewed · p pin/unpin\n / search · l lists · o filters · f refresh · d details · PgUp/PgDn scroll · End follow · ? help · q quit\n ${this.notice}`));
    restoreScroll(this); this.screen.render();
  }
  destroy(): void { this.refreshAbort?.abort(); clearTimeout(this.pendingRender); this.screen.destroy(); }
}
