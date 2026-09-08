import test from 'node:test';
import assert from 'node:assert/strict';
import { taskNavigationHeights } from '../src/ui/layout.js';
import { originalGoal, renderContentLayout, toggleContentWidth } from '../src/ui/content-layout.js';
import { conversationSchema } from '../src/model.js';
import type { View } from '../src/ui/view.js';

function conversation() {
  return conversationSchema.parse({ id: '5fc9504d-9f3c-411c-bd18-a594e6cc23f3', title: 'Chat',
    workspace: '/tmp', demo: true, status: 'Finished', updatedAt: '', messages: [
      { role: 'assistant', text: 'Welcome' }, { role: 'user', text: 'Original goal\nKeep all details.' },
      { role: 'user', text: 'Later request' },
    ] });
}
function panel() {
  return { hidden: false, left: 40, top: 2, height: 4, content: '',
    hide() { this.hidden = true; }, show() { this.hidden = false; },
    setContent(value: string) { this.content = value; } };
}
function fixture() {
  return { screen: { height: 32 }, detail: { ...panel(), childBase: 7 }, goal: panel(), list: panel(),
    taskSearch: panel(), workspacePanels: [panel(), panel()], current: () => ({ conversation: conversation() }),
    workspaceFocus: 'left', follow: false, selected: 'chat', fullWidth: false } as unknown as View;
}
test('conversation section grows from a compact empty state up to half the pane', () => {
  assert.deepEqual(taskNavigationHeights(27), [24, 3]);
  assert.deepEqual(taskNavigationHeights(27, 4), [21, 6]);
  assert.deepEqual(taskNavigationHeights(27, 100), [14, 13]);
  for (const height of [0, 1, 8, 15, 27]) {
    const [tasks, chats] = taskNavigationHeights(height, 100);
    assert.equal(tasks + chats, height); assert.ok(tasks >= chats && chats >= 0);
  }
});
test('original goal uses only the first user message, including structured Pi text', () => {
  const c = conversation();
  assert.equal(originalGoal(c), 'Original goal\nKeep all details.');
  c.messages[1].pi = { role: 'user', content: [{ type: 'text', text: 'Actual\n\x1b[31mgoal' }] };
  assert.equal(originalGoal(c), 'Actual\ngoal');
  assert.equal(originalGoal(undefined), '');
});
test('full-width mode hides navigation and retains selection and scroll position', () => {
  const view = fixture(); toggleContentWidth(view); renderContentLayout(view);
  assert.equal(view.detail.left, 0); assert.equal(view.list.hidden, true);
  assert.ok(view.workspacePanels.every(item => item.hidden));
  assert.equal(view.pendingScroll, 7); assert.equal(view.selected, 'chat'); assert.equal(view.follow, false);
  assert.equal(view.workspaceFocus, 'right');
  toggleContentWidth(view); assert.equal(view.fullWidth, false); assert.equal(view.pendingScroll, 7);
});
test('goal stays above the transcript and disappears for task details and drafts', () => {
  const view = fixture(); renderContentLayout(view);
  assert.equal(view.goal.hidden, false); assert.equal(view.detail.top, 6);
  assert.equal(view.goal.left, view.detail.left);
  view.screen.height = 20; renderContentLayout(view); assert.equal(view.detail.top, 5);
  view.taskScope = { id: 'task', title: 'Task', ownerList: 'Inbox', completed: false, subtasks: [] };
  view.workspaceSection = 'Details'; renderContentLayout(view);
  assert.equal(view.goal.hidden, true); assert.equal(view.detail.top, 2);
  view.workspaceSection = 'Conversations'; renderContentLayout(view); assert.equal(view.goal.hidden, false);
  view.draft = {} as View['draft']; renderContentLayout(view); assert.equal(view.goal.hidden, true);
});
