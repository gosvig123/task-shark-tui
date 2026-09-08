import blessed from 'blessed';
import type { Conversation } from '../model.js';
import { contentText } from '../wire.js';
import { choose, safe } from './dialogs.js';
import type { View } from './view.js';

const userRole = 'user';
const tasksTab = 'Tasks';
const conversationsSection = 'Conversations';
function showsConversation(view: View): boolean {
  if (view.draft) return false;
  if (view.taskScope || view.tab === tasksTab) return !!view.taskScope && view.workspaceSection === conversationsSection;
  return true;
}
export function originalGoal(conversation?: Conversation): string {
  const first = conversation?.messages.find(message => (message.pi?.role ?? message.role) === userRole);
  return first ? safe(first.pi ? contentText(first.pi.content) : first.text) : '';
}
export function goalPanel(view: View) {
  return blessed.box({ parent: view.screen, hidden: true, top: 2, height: 4, right: 0,
    border: 'line', tags: false, label: ' Original goal · Ctrl-G full message ', style: { border: { fg: 'cyan' } } });
}
export function renderContentLayout(view: View): void {
  if (view.fullWidth) {
    view.list.hide(); view.taskSearch.hide(); view.workspacePanels.forEach(panel => panel.hide());
    view.detail.left = 0;
  }
  const conversation = showsConversation(view) ? view.current()?.conversation : undefined;
  const goal = originalGoal(conversation);
  view.goal.hide(); view.detail.top = 2;
  if (!goal) return;
  view.goal.show(); view.goal.left = view.detail.left;
  view.goal.height = Number(view.screen.height) < 24 ? 3 : 4;
  view.goal.setContent(goal.replace(/\s+/g, ' ').trim());
  view.detail.top = 2 + Number(view.goal.height);
}
export function toggleContentWidth(view: View): void {
  view.pendingScroll = view.detail.childBase;
  view.fullWidth = !view.fullWidth;
  if (view.fullWidth) view.workspaceFocus = 'right';
}
export async function showOriginalGoal(view: View): Promise<void> {
  if (!showsConversation(view)) return;
  const goal = originalGoal(view.current()?.conversation);
  if (goal) await choose(view.screen, 'Original goal · first user message', ['Close'], goal);
}
