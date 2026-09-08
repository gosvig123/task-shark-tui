import blessed, { type Widgets } from 'blessed';
import type { Task } from '../model.js';
import { changesFor, type TaskEdits } from '../task-edit.js';
import { directTodayNotice, todayList } from '../task-today.js';
import { CursorEditor, type EditorKey } from './cursor-editor.js';
import { editorLines } from './cursor-input.js';
import { safe } from './dialogs.js';
export interface TaskEditor { original: Task; draft: TaskEdits; blocked: boolean; notice: string }
const fields = ['title', 'dueDate', 'description'] as const;
const labels = ['Title', 'Due date · YYYY-MM-DD · blank clears', 'Notes · Enter newline · blank clears'];
export class TaskFormState {
  focus = 0;
  error = '';
  editors: CursorEditor[];
  constructor(readonly editor: TaskEditor) { this.editors = fields.map(f => new CursorEditor(safe(editor.draft[f]), f === 'description')); }
  sync(): void { fields.forEach((f, i) => { this.editor.draft[f] = this.editors[i].value; }); }
  key(ch: string, key: EditorKey): 'save' | 'cancel' | undefined {
    if (key.name === 'escape') return 'cancel';
    if (key.ctrl && key.name === 's') return 'save';
    if (key.name === 'tab') { this.focus = (this.focus + (key.shift ? 4 : 1)) % 5; return; }
    if (key.name === 'enter' && this.focus >= 3) return this.focus === 3 ? 'save' : 'cancel';
    if (key.name === 'enter' && this.focus < 2) { this.focus++; return; }
    if (this.focus < 3) { this.editors[this.focus].key(safe(ch), key); this.sync(); this.error = ''; }
  }
  validate(): boolean {
    try { changesFor(this.editor.original, this.editor.draft); this.error = ''; return true; }
    catch (error) { this.error = (error as Error).message; this.focus = this.editor.draft.title.trim() ? 1 : 0; return false; }
  }
  rebase(): void {
    fields.forEach((f, i) => { if (this.editors[i].value !== this.editor.draft[f]) this.editors[i] = new CursorEditor(safe(this.editor.draft[f]), f === 'description'); });
  }
}
interface Form { panel: Widgets.BoxElement; boxes: Widgets.BoxElement[]; notice: Widgets.BoxElement; actions: Widgets.BoxElement }
function widgets(screen: Widgets.Screen): Form {
  const panel = blessed.box({ parent: screen, top: 0, left: 0, width: '100%', height: '100%', border: 'line',
    label: ' Edit task ', style: { fg: 'white', bg: 'black', border: { fg: 'cyan' } } });
  const boxes = labels.map((label, i) => blessed.box({ parent: panel, top: i * 4, left: 1, right: 1,
    ...(i === 2 ? { bottom: 8 } : { height: 4 }), border: 'line', label, tags: false, wrap: false }));
  const notice = blessed.box({ parent: panel, bottom: 3, height: 5, left: 2, right: 2, tags: false });
  const actions = blessed.box({ parent: panel, bottom: 0, height: 3, left: 2, right: 2, tags: false });
  return { panel, boxes, notice, actions };
}
function draw(form: Form, state: TaskFormState, screen: Widgets.Screen, busy: boolean): void {
  const compact = Number(screen.height) < 25;
  form.boxes.forEach((box, i) => {
    box.top = i * (compact ? 3 : 4); if (i < 2) box.height = compact ? 3 : 4; else box.bottom = compact ? 5 : 8;
    const layout = editorLines(state.editors[i], Math.max(2, Number(box.width) - 2));
    const height = Math.max(1, Number(box.height) - 2), top = Math.max(0, layout.row - height + 1);
    const content = layout.lines.slice(top, top + height).join('\n');
    box.setContent(state.focus === i ? content : content.replace(/\x1b\[(?:7|27)m/g, ''));
    box.style.border = { fg: state.focus === i ? 'cyan' : 'white' };
    box.setLabel(`${state.focus === i ? '▶ ' : ''}${state.error && state.focus === i ? fields[i] + ' · ' + state.error : labels[i]}`);
  });
  form.notice.height = compact ? 2 : 5;
  const { editor } = state;
  const changed = fields.some((f, i) => state.editors[i].value !== (f === 'dueDate' ? editor.original.dueDate?.slice(0, 10) ?? '' : editor.original[f] ?? ''));
  form.panel.setLabel(` Edit task${changed ? ' · Unsaved changes' : ''} `);
  form.notice.setContent(safe((busy ? 'Working…' : editor.notice) + (editor.original.ownerList === todayList ? '\n' + directTodayNotice : '')));
  const save = editor.blocked ? 'Review latest source' : 'Save';
  form.actions.setContent(`${state.focus === 3 ? '▶' : ' '} [ ${save} ]    ${state.focus === 4 ? '▶' : ' '} [ Cancel ]\nTab / Shift-Tab fields · Ctrl-S ${editor.blocked ? 'review' : 'save'} · Esc cancel\n←/→ cursor · Home/End · Ctrl-W word · Ctrl-U clear all`);
  screen.render();
}
export function taskEditForm(screen: Widgets.Screen, editor: TaskEditor, submit: () => Promise<boolean>): Promise<boolean> {
  return new Promise(resolve => {
    const previous = screen.focused, grabbed = screen.grabKeys, form = widgets(screen), state = new TaskFormState(editor);
    let busy = false;
    const render = () => draw(form, state, screen, busy);
    const finish = (saved: boolean) => {
      screen.removeListener('resize', render); form.panel.destroy(); screen.grabKeys = grabbed;
      if (previous && !previous.detached) previous.focus(); else screen.rewindFocus();
      screen.render(); resolve(saved);
    };
    form.panel.on('keypress', async (ch: string, key: EditorKey = {}) => {
      if (busy) return;
      const action = state.key(ch ?? '', key);
      if (action === 'cancel') { finish(false); return; }
      if (action === 'save' && (editor.blocked || state.validate())) {
        busy = true; render();
        try { if (await submit()) { finish(true); return; } state.rebase(); }
        catch (error) { editor.blocked = true; editor.notice = `${String(error)} Review latest source before retrying.`; }
        finally { busy = false; }
        form.panel.focus();
      }
      render(); });
    screen.grabKeys = true; form.panel.focus(); screen.on('resize', render); render();
  });
}
