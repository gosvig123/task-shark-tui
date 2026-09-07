// THROWAWAY: Which layout makes Board Updates usable inside a terminal Task Workspace?
// Three layouts share fictional, in-memory state. No production app imports this entry point.
import blessed from 'blessed';
import { tasks, kinds, append, details, feed, entryText } from './board-updates.prototype-state.js';
import { safe } from './dialogs.js';
const screen = blessed.screen({ smartCSR: true, fullUnicode: true, title: 'Board Updates prototype' });
const header = blessed.box({ parent: screen, top: 0, height: 3 });
const sidebar = blessed.box({ parent: screen, top: 3, bottom: 5, left: 0, width: '26%', border: 'line' });
const main = blessed.box({ parent: screen, top: 3, bottom: 5, left: '26%', right: 0 });
const footer = blessed.box({ parent: screen, bottom: 0, height: 5, style: { fg: 'cyan' } });
const names = ['A · Details then feed', 'B · Context beside feed', 'C · Update index and reader'];
let taskIndex = 0, variant = 0, selected = 0, kindIndex = 0, composing = false;
let panels: blessed.Widgets.BoxElement[] = [];
let scrollTarget: blessed.Widgets.BoxElement;
function panel(label: string, content: string, position: blessed.Widgets.BoxOptions = {}): blessed.Widgets.BoxElement {
  const box = blessed.box({ parent: main, top: 0, bottom: 0, left: 0, right: 0,
    border: 'line', label, scrollable: true, alwaysScroll: true, scrollbar: { ch: '│' }, ...position });
  box.setContent(safe(content)); panels.push(box); return box;
}
function layout(): void {
  const task = tasks[taskIndex];
  if (variant === 0) scrollTarget = panel(' Details / Board Updates ', `${details(task)}\n\nBoard Updates\n\n${feed(task)}`);
  if (variant === 1) {
    const narrow = Number(screen.width) < 90;
    panel(' Details ', details(task), narrow ? { height: '35%', bottom: undefined } : { width: '38%', right: undefined });
    scrollTarget = panel(' Board Updates ', feed(task), narrow ? { top: '35%' } : { left: '38%' });
  }
  if (variant === 2) {
    const index = task.entries.map((e, i) => `${i === selected ? '>' : ' '} #${e.sequence} ${e.kind}${e.sequence > task.reviewed ? ' *' : ''}`).join('\n');
    panel(' Board Updates ', index || 'No updates', { width: '35%', right: undefined });
    scrollTarget = panel(' Details / Selected update ', `${details(task)}\n\n${task.entries[selected] ? entryText(task.entries[selected], task) : 'Press n to add an update.'}`, { left: '35%' });
  }
}
function render(): void {
  panels.forEach(p => p.destroy()); panels = [];
  const task = tasks[taskIndex], unread = task.entries.filter(e => e.sequence > task.reviewed).length;
  header.setContent(`TASK SHARK · THROWAWAY PROTOTYPE · OFFLINE\nService Tabs: Conversations | Tasks\nTask Workspace: ${task.title}`);
  sidebar.setContent('Tasks · Prototype\n\n' + tasks.map((t, i) => `${i === taskIndex ? '> ' : '  '}${t.title}`).join('\n\n') + '\n\nConversations\nRelease conversation\n(fixture only)');
  layout();
  footer.setContent(`${names[variant]} · Left/Right or 1/2/3: layout · Tab: task\nState: task=${taskIndex + 1} entries=${task.entries.length} reviewed=${task.reviewed} unread=${unread} selected=${selected + 1}\nKind: ${kinds[kindIndex]} · k: cycle · n: post · a: simulate agent · r: mark reviewed\nUp/Down: select (C) or scroll · PgUp/PgDn: scroll · q: quit\nIn memory only. No Pi, real tasks, disk writes, or conversation review changes.`);
  screen.render();
}
function compose(): void {
  composing = true;
  const input = blessed.textarea({ parent: screen, top: 'center', left: 'center', width: '85%', height: 9,
    border: 'line', label: ` ${kinds[kindIndex]} · Ctrl-S post · Escape cancel `, keys: true, inputOnFocus: true });
  const close = () => { composing = false; input.destroy(); render(); };
  input.key('C-s', () => { append(tasks[taskIndex], kinds[kindIndex], safe(input.getValue())); close(); });
  input.key('escape', close);
  input.focus(); screen.render();
}
function navigate(key: string): void {
  if (key === 'left' || key === 'right') variant = (variant + (key === 'left' ? 2 : 1)) % 3;
  if (['1', '2', '3'].includes(key)) variant = Number(key) - 1;
  if (key === 'tab') { taskIndex = (taskIndex + 1) % tasks.length; selected = 0; }
  if (key === 'k') kindIndex = (kindIndex + 1) % kinds.length;
  if (key === 'r') tasks[taskIndex].reviewed = tasks[taskIndex].entries.at(-1)?.sequence ?? 0;
  if (key === 'a') append(tasks[taskIndex], 'Progress', 'Simulated agent update. No model was called.', true);
  if (key === 'up' || key === 'down') selected = Math.max(0, Math.min(tasks[taskIndex].entries.length - 1, selected + (key === 'up' ? -1 : 1)));
  render();
}
screen.on('keypress', (_ch, key) => {
  if (composing) return;
  if (key.name === 'q' || key.full === 'C-c') { screen.destroy(); return; }
  if (key.name === 'n') { compose(); return; }
  if (['pageup', 'pagedown'].includes(key.name) || (variant !== 2 && ['up', 'down'].includes(key.name))) {
    scrollTarget.scroll(['pageup', 'up'].includes(key.name) ? -3 : 3); screen.render(); return;
  }
  navigate(key.name ?? _ch);
});
screen.on('resize', render);
render();
