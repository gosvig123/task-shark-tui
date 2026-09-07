#!/usr/bin/env node
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const input = args[1] === 'exec' ? JSON.parse(readFileSync(0, 'utf8')) : undefined;
appendFileSync(join(root, 'calls.jsonl'), JSON.stringify({ args, input }) + '\n');
const statePath = join(root, 'state.json');
const state = JSON.parse(readFileSync(statePath, 'utf8'));
const modePath = join(root, 'mode');
const mode = existsSync(modePath) ? readFileSync(modePath, 'utf8') : '';
const snapshot = list => ({ schemaVersion: 1, revision: `revision-${state.revision}`, tasks: state.byList[list] ?? [] });
function execute() {
  if (mode === 'conflict' || input.expectedRevision !== `revision-${state.revision}`)
    return { success: false, error: { code: 'revision_conflict', message: 'changed concurrently' } };
  state.revision++;
  if (input.operation === 'task.update') {
    const task = state.byList[input.list].find(t => t.id === input.taskId);
    if (!task) return { success: false, error: { code: 'not_found', message: 'Task missing' } };
    Object.assign(task, input.changes);
    if (input.list !== 'today' && 'dueDate' in input.changes && input.changes.dueDate !== new Date().toISOString().slice(0, 10)) {
      state.byList.today = state.byList.today.filter(t => t.id !== input.taskId);
    }
  } else state.byList[input.list].push({ id: `created-${state.revision}`, title: input.changes.title,
    description: input.changes.description, completed: false, ownerList: input.list, subtasks: [] });
  writeFileSync(statePath, JSON.stringify(state));
  if (mode === 'partial-failure') return { success: false, error: { code: 'migration_required', message: 'Today missing IDs after source write' } };
  return { success: true, snapshot: snapshot('today') };
}
function removeReference() {
  if (mode === 'remove-conflict') return { success: false, error: { code: 'revision_conflict', message: 'Removal conflict' } };
  const ref = state.byList.today.find(t => t.id === input.taskId);
  if (!ref || ref.ownerList === 'today') return { success: false, error: { code: 'bad_request', message: 'Not a reference' } };
  state.byList.today = state.byList.today.filter(t => t.id !== input.taskId); state.revision++;
  writeFileSync(statePath, JSON.stringify(state));
  return { success: true };
}
let result;
if (args[0] !== 'api') throw new Error('Expected api command');
if (args[1] === 'lists') result = { schemaVersion: 1, revision: `revision-${state.revision}`,
  lists: Object.keys(state.byList), currentList: state.currentList };
else if (args[1] === 'snapshot') result = snapshot(args[3]);
else if (args[1] === 'exec' && input.operation === 'task.removeFromToday') result = removeReference();
else if (args[1] === 'exec' && ['task.create', 'task.update'].includes(input.operation)) result = execute();
else throw new Error('Unsupported fixture command');
if ((mode === 'malformed' && args[1] === 'exec') || (mode === 'remove-uncertain' && input?.operation === 'task.removeFromToday')) console.log('{bad');
else console.log(JSON.stringify(result));
