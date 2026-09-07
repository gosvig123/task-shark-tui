import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import blessed from 'blessed';
import { emptyDraft } from '../src/ui/conversation-draft.js';
import { selectDraftTask, selectDraftWorkspace, workspaceChoices } from '../src/ui/draft-selectors.js';
import type { View } from '../src/ui/view.js';
import type { Conversation } from '../src/model.js';

function setup() {
  const input = new PassThrough(), output = new PassThrough();
  Object.assign(output, { columns: 100, rows: 32, isTTY: true }); output.resume();
  const screen = blessed.screen({ input, output, terminal: 'xterm', fullUnicode: true });
  const tasks = ['Personal', 'Work'].map(ownerList => ({ id: 'same-id', title: 'Same title', ownerList, completed: false, subtasks: [] }));
  const view = { screen, catalog: { tasks, lists: ['Personal', 'Work'] },
    runtime: { store: { conversations: [] } }, notice: '' } as unknown as View;
  const key = (name: string, text = '') => screen.focused.emit('keypress', text, { name });
  return { view, key, close: () => { screen.destroy(); input.destroy(); output.destroy(); } };
}
test('draft task picker searches all tasks, retains exact identity, and can return to General', async () => {
  const ui = setup(), draft = emptyDraft(); draft.text = 'Keep my message';
  try {
    const pick = selectDraftTask(ui.view, draft);
    ui.key('w', 'work'); ui.key('enter'); await pick;
    assert.equal(draft.task, ui.view.catalog.tasks[1]);
    const cancel = selectDraftTask(ui.view, draft);
    ui.key('escape'); await cancel; assert.equal(draft.task, ui.view.catalog.tasks[1]);
    const general = selectDraftTask(ui.view, draft);
    ui.key('enter'); await general; assert.equal(draft.task, undefined);
    assert.equal(draft.text, 'Keep my message');
  } finally { ui.close(); }
});
test('workspace picker searches existing paths, preserves cancellation and offers private directory', async () => {
  const ui = setup(), draft = emptyDraft();
  try {
    const pick = selectDraftWorkspace(ui.view, draft);
    ui.key('p', process.cwd()); ui.key('enter'); await pick;
    assert.equal(draft.workspace, process.cwd());
    const cancel = selectDraftWorkspace(ui.view, draft);
    ui.key('escape'); await cancel; assert.equal(draft.workspace, process.cwd());
    const privateChoice = selectDraftWorkspace(ui.view, draft);
    ui.key('enter'); await privateChoice; assert.equal(draft.workspace, '');
  } finally { ui.close(); }
});
test('workspace choices deduplicate current and saved directories', () => {
  const saved = [{ workspace: process.cwd() }, { workspace: '/other' }] as Conversation[];
  const options = workspaceChoices(saved, process.cwd());
  assert.equal(options.filter(option => option.path === process.cwd()).length, 1);
  assert.ok(options.some(option => option.path === '/other'));
});
