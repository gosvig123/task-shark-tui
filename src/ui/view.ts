import { LocalBoardClient } from '../local-board-client.js';
import { navigationWidth } from './layout.js';
import { setListContent } from './list-content.js';
import { setDetailContent } from './detail-content.js';
import { cacheDetailAttributes } from './detail-attributes.js';
import { reconcileTasks } from './task-selector.js';
import { NavigationMemory, restoreScroll } from './navigation-memory.js';
import { workspacePanels, renderNavigation } from './workspace-navigation.js';
import { Boards } from '../board-state.js';
import { workspaceContent, workspaceFooter, type WorkspaceSection, type WorkspaceReturn } from './workspace.js';
import type { ConversationDraft } from './conversation-draft.js';
import blessed from 'blessed';
import { Status, type Conversation, type Task } from '../model.js';
import { conversationRows } from './conversation-sections.js';
import type { Runtime } from '../runtime.js';
import { conversationDetails, welcome } from './content.js';
import { safe } from './dialogs.js';
import type { TaskCatalog } from '../tasks.js';
import { selectionStyle } from './styles.js';
import { TaskFilter, type TaskFilterValue } from './task-filters.js';

export const Tab = { conversations: 'Conversations', tasks: 'Tasks', review: 'For Review Inbox' } as const;
export interface Row { key: string; label: string; section?: string; conversation?: Conversation; task?: Task }
export class View {
  readonly screen = blessed.screen({ smartCSR: true, fullUnicode: true, title: 'Task Shark',
    autoPadding: true, dockBorders: true });
  readonly header = blessed.box({ parent: this.screen, top: 0, height: 2, style: { fg: 'cyan' } });
  readonly list = blessed.list({ parent: this.screen, top: 2, bottom: 3, left: 0, width: '32%',
    padding: { top: 1 }, border: 'line', keys: false, tags: false, style: { selected: selectionStyle } });
  readonly detail = blessed.box({ parent: this.screen, top: 2, bottom: 3, left: '32%', right: 0,
    border: 'line', scrollable: true, alwaysScroll: true, tags: false, scrollbar: { ch: '│' } });
  readonly footer = blessed.box({ parent: this.screen, bottom: 0, height: 3, style: { fg: 'default' } });
  tab: string = Tab.conversations;
  catalog: TaskCatalog = { tasks: [], lists: [], currentList: '', byList: new Map() };
  listFilter?: string;
  taskFilter: TaskFilterValue = TaskFilter.all;
  taskScope?: Task;
  workspaceSection: WorkspaceSection = 'Details';
  workspaceFocus: 'left' | 'right' = 'left';
  readonly workspacePanels = workspacePanels(this);
  readonly taskSearch = blessed.box({ parent: this.screen, hidden: true, top: 3, left: 1, height: 1, style: { fg: 'default' } });
  workspaceReturn?: WorkspaceReturn;
  readonly navigation: NavigationMemory;
  readonly todayRemovals = new Set<string>();
  pendingScroll?: number;
  readonly boards: Boards;
  query = '';
  selected = '';
  readonly collapsedSections = new Set<string>();
  draft?: ConversationDraft;
  busy = false;
  refreshing = false;
  refreshAbort?: AbortController;
  notice = '';
  follow = true;
  private pendingRender?: NodeJS.Timeout;
  constructor(readonly runtime: Runtime) {
    cacheDetailAttributes(this.detail);
    this.navigation = new NavigationMemory(runtime.store.root);
    this.notice = this.navigation.preferences?.notice ?? '';
    this.boards = new Boards(() => this.schedule(), runtime.store.demo, new LocalBoardClient(runtime.store.root));
    runtime.on('change', () => this.schedule());
    runtime.on('board-post', (id: string) => this.boards.refresh(id));
    this.screen.on('resize', () => this.render());
  }
  schedule(): void {
    this.pendingRender ??= setTimeout(() => { this.pendingRender = undefined; this.render(); }, 40);
  }
  rows(): Row[] {
    return conversationRows(this.runtime.store.conversations.filter(c => this.include(c)),
      this.collapsedSections, !this.taskScope && this.tab !== Tab.tasks);
  }
  toggleSection(): void {
    const section = this.current()?.section;
    if (!section) return;
    if (this.collapsedSections.has(section)) this.collapsedSections.delete(section);
    else this.collapsedSections.add(section);
    this.follow = true;
  }
  private matches(text: string): boolean { return text.toLowerCase().includes(this.query.toLowerCase()); }
  private include(c: Conversation): boolean {
    if (this.tab === Tab.review && c.status !== Status.review) return false;
    if (this.taskScope && c.task?.id !== this.taskScope.id) return false;
    return this.matches(`${c.title} ${c.workspace} ${c.task?.title ?? ''}`);
  }
  current(): Row | undefined {
    const rows = this.rows().filter(row => row.conversation);
    return rows.find(r => r.key === this.selected) ?? rows[0];
  }
  move(delta: number, render = true): void {
    const rows = this.rows().filter(row => row.conversation);
    const index = Math.max(0, rows.findIndex(r => r.key === this.selected));
    this.selected = rows[Math.max(0, Math.min(rows.length - 1, index + delta))]?.key ?? '';
    this.follow = true;
    if (render) this.render();
  }
  switchTab(tab: string, render = true): void {
    this.navigation.tab(this, tab);
    if (render) this.render();
  }
  private renderWorkspace(): void {
    if (this.taskScope) this.selected = this.current()?.key ?? '';
    this.list.hide(); renderNavigation(this);
    this.header.setContent(safe(` TASK SHARK · Task Workspace · c/t/r tabs · ${this.workspaceReturn?.listFilter ?? this.listFilter ?? 'All Lists'}\n ${this.taskScope?.title ?? 'No tasks match'} · ${this.workspaceSection} · ${this.workspaceReturn?.taskFilter ?? this.taskFilter}`));
    setDetailContent(this.detail, this.draft ? safe(`New Conversation · unsaved\nTask: ${this.taskScope?.title ?? 'No tasks match'}\nAgent Workspace: ${this.draft.workspace || 'New private directory (created on send)'}`) : workspaceContent(this));
    if (this.follow) this.detail.setScrollPerc(!this.draft && this.workspaceSection === 'Conversations' && this.current()?.conversation ? 100 : 0);
    this.footer.setContent(safe(this.draft ? ' New Conversation · unsaved\n Ctrl-S send · Ctrl-T task · Ctrl-W workspace · Ctrl-O settings\n Esc discard' : workspaceFooter(this))); this.footer.style.fg = 'default';
    restoreScroll(this); this.screen.render();
  }
  render(): void {
    if (this.tab === Tab.tasks || this.taskScope) {
      reconcileTasks(this); this.navigation.persistFilters(this); this.renderWorkspace(); return;
    }
    this.workspacePanels.forEach(panel => panel.hide()); this.detail.setLabel(''); this.detail.style.border.fg = 'default';
    this.list.show(); this.list.width = this.detail.left = navigationWidth(Number(this.screen.width));
    this.taskSearch.show(); this.taskSearch.width = Number(this.list.width) - 2; this.taskSearch.setContent(safe(`/ ${this.query || 'Search conversations'}`));
    if (this.catalog.lists.length && this.listFilter && !this.catalog.lists.includes(this.listFilter)) this.listFilter = undefined;
    const rows = this.rows(), row = this.current();
    this.selected = row?.key ?? '';
    setListContent(this.list, rows.length ? rows.map(r => safe(r.label)) : ['No matching conversations']);
    this.list.select(Math.max(0, rows.findIndex(r => r.key === this.selected)));
    const conversations = this.runtime.store.conversations;
    const reviews = conversations.filter(c => c.status === Status.review).length;
    const needs = conversations.filter(c => c.status === Status.needsInput).length;
    this.header.setContent(safe(` TASK SHARK ${this.runtime.store.demo ? '· OFFLINE DEMO' : '· LIVE PI'}   [c] Conversations   [t] Tasks   [r] For Review (${reviews})\n ${this.tab} · Needs Input ${needs}`));
    const detail = this.draft ? `New Conversation · unsaved\nTask: ${this.draft.task ? this.draft.task.title + ' · ' + this.draft.task.ownerList : 'General (no task)'}\nAgent Workspace: ${this.draft.workspace || 'New private directory (created on send)'}\n\nCtrl-T choose task · Ctrl-W choose workspace\nCtrl-O title and model` : row?.conversation ?
      conversationDetails(row.conversation, this.runtime.state(row.conversation), Number(this.detail.width) - 3) : welcome;
    setDetailContent(this.detail, !this.draft && row?.conversation ? detail : safe(detail));
    if (this.follow) this.detail.setScrollPerc(row?.conversation ? 100 : 0);
    this.footer.setContent(safe(this.draft ? ` New Conversation · unsaved · ${this.draft.task ? 'Task: ' + this.draft.task.title : 'General'}\n Ctrl-S send · Ctrl-T task · Ctrl-W workspace · Ctrl-O settings · Esc discard\n ${this.notice}` : ` ↑↓ select · Enter open · m message · n new\n / search · a reviewed · p pin · ? help · q quit\n ${this.notice}`));
    restoreScroll(this); this.screen.render();
  }
  destroy(): void { this.refreshAbort?.abort(); clearTimeout(this.pendingRender); this.screen.destroy(); }
}
