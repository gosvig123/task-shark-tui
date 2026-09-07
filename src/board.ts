import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { z } from 'zod';

export const boardKinds = ['note', 'progress', 'decision', 'blocker', 'handoff'] as const;
export const boardEntrySchema = z.object({ schemaVersion: z.literal(1), sequence: z.number().int().positive(),
  id: z.string(), requestId: z.string(), createdAt: z.string(), kind: z.enum(boardKinds), body: z.string(),
  actorKind: z.enum(['human', 'agent']), source: z.string().nullable(), threadID: z.string().nullable(), sessionID: z.string().nullable() });
export type BoardEntry = z.infer<typeof boardEntrySchema>;
export type BoardKind = typeof boardKinds[number];
export interface BoardPage { entries: BoardEntry[]; hasMore: boolean }
export interface BoardClient {
  read(taskID: string): Promise<BoardPage>;
  review(taskID: string): Promise<number>;
  post(taskID: string, kind: BoardKind, body: string, requestId: string): Promise<void>;
  mark(taskID: string, sequence: number): Promise<number>;
}
const reviewSchema = z.object({ schemaVersion: z.literal(1), lastReviewedSequence: z.number().int().nonnegative() });
const pageSchema = z.object({ schemaVersion: z.literal(1), entries: z.array(boardEntrySchema), hasMore: z.boolean() });
export class SharedBoardClient implements BoardClient {
  constructor(readonly resources = process.env.TASKSHARK_MCP_RESOURCE_DIR ??
    '/Applications/TasksWidget.app/Contents/Resources/TaskBoardMCP',
    readonly root = process.env.TASKSHARK_BOARD_ROOT ?? join(homedir(), 'Library/Application Support/TaskShark/SharedTasks/v1'),
    private readonly environment = process.env) {}
  private command(taskID: string, command: string, args: string[] = [], input = ''): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const env = { ...this.environment, TASKSHARK_TASK_ID: taskID, TASKSHARK_BOARD_ROOT: this.root,
        TASKSHARK_ACTOR_KIND: 'human', TASKSHARK_THREAD_ID: '', PI_SESSION_ID: '' };
      const child = execFile(process.execPath, [join(this.resources, 'cli.mjs'), command, ...args],
        { env, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
          if (error) { reject(new Error(`Board Updates helper failed: ${stderr.trim() || error.message}. Check TASKSHARK_MCP_RESOURCE_DIR.`)); return; }
          try { resolve(JSON.parse(stdout)); } catch { reject(new Error('Invalid Board Updates helper response.')); }
        });
      child.stdin?.on('error', () => { /* Process completion reports failed or uncertain delivery. */ });
      child.stdin?.end(input);
    });
  }
  async read(id: string): Promise<BoardPage> { return pageSchema.parse(await this.command(id, 'board-read', ['--limit', '100'])); }
  async review(id: string): Promise<number> { return reviewSchema.parse(await this.command(id, 'review-read')).lastReviewedSequence; }
  async post(id: string, kind: BoardKind, body: string, requestId: string): Promise<void> {
    z.object({ schemaVersion: z.literal(1), sequence: z.number().int().positive(), id: z.string() })
      .parse(await this.command(id, 'board-post', ['--request-id', requestId, '--kind', kind, '--source', 'Human'], body));
  }
  async mark(id: string, sequence: number): Promise<number> {
    return reviewSchema.parse(await this.command(id, 'review-mark', ['--sequence', String(sequence)])).lastReviewedSequence;
  }
}
