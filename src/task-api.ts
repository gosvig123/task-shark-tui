import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { taskSchema } from './model.js';

export const taskConsentFlag = '--allow-task-reset';
export const taskSnapshotWarning = 'tasks-go lists and snapshots can rewrite today.md and daily reset state. ' +
  `Explicit reset authorization is required for this operation; standalone checks accept ${taskConsentFlag}.`;
const snapshotSchema = z.object({ schemaVersion: z.literal(1), revision: z.string().min(1),
  tasks: z.array(taskSchema), error: z.string().optional() });
const listsSchema = z.object({ schemaVersion: z.literal(1), revision: z.string().min(1),
  currentList: z.string(), lists: z.array(z.string().min(1)) });
const responseSchema = z.object({ success: z.boolean(),
  error: z.object({ code: z.string(), message: z.string() }).optional() });
export type TaskSnapshot = z.infer<typeof snapshotSchema>;
export function parseTaskSnapshot(text: string): TaskSnapshot {
  const snapshot = snapshotSchema.parse(JSON.parse(text));
  if (snapshot.error) throw new Error(snapshot.error);
  return snapshot;
}
export function taskCommand(binary: string, args: string[], allowed: boolean, signal?: AbortSignal, input?: unknown): Promise<string> {
  if (!allowed) return Promise.reject(new Error(taskSnapshotWarning));
  return new Promise((resolve, reject) => {
    const child = execFile(binary, ['api', ...args], { signal, timeout: 15_000,
      maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' }, (error, stdout) => error ? reject(error) : resolve(stdout));
    child.stdin?.on('error', () => { /* execFile reports a failed process through its callback. */ });
    child.stdin?.end(input === undefined ? undefined : JSON.stringify(input));
  });
}
export async function loadLists(binary: string, allowed = false, signal?: AbortSignal) {
  return listsSchema.parse(JSON.parse(await taskCommand(binary, ['lists'], allowed, signal)));
}
export async function loadTaskSnapshot(binary: string, list: string, allowed = false, signal?: AbortSignal) {
  return parseTaskSnapshot(await taskCommand(binary, ['snapshot', '--list', list], allowed, signal));
}
export interface TaskDraft { list: string; title: string; description: string }
export interface TaskCreation { confirmed: boolean; notice: string; snapshot?: TaskSnapshot }
export async function createTask(binary: string, draft: TaskDraft, allowed = false): Promise<TaskCreation> {
  if (!draft.title.trim()) throw new Error('Task title is required. Nothing was created.');
  const before = await loadTaskSnapshot(binary, draft.list, allowed);
  const request = { schemaVersion: 1, requestId: randomUUID(), operation: 'task.create', list: draft.list,
    expectedRevision: before.revision, changes: { title: draft.title.trim(), description: draft.description, completed: false } };
  let result: TaskCreation;
  try {
    const response = responseSchema.parse(JSON.parse(await taskCommand(binary, ['exec'], allowed, undefined, request)));
    result = response.success ? { confirmed: true, notice: `Created Pending task in ${draft.list}: ${draft.title.trim()}` } :
      { confirmed: false, notice: creationFailure(response.error?.code, response.error?.message) };
  } catch (error) { result = { confirmed: false, notice: creationFailure(undefined, String(error)) }; }
  try { result.snapshot = await loadTaskSnapshot(binary, draft.list, allowed); }
  catch (error) { result.notice += ` Source refresh failed: ${String(error)}`; }
  return result;
}
function creationFailure(code?: string, message = 'Unknown tasks-go error'): string {
  if (code === 'revision_conflict') return 'Task Lists changed. Nothing created; not retried. Refresh and review the source before starting creation again.';
  return `Creation not confirmed (${code ?? 'delivery uncertain'}): ${message}. It may have saved. Check the source list before creating again; not retried.`;
}
