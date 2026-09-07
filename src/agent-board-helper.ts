import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { boardEntrySchema, boardKinds } from './board.js';
import { cleanPiEnvironment, type AgentBoardScope } from './agent-board-scope.js';

export const readParameters = z.object({ afterSequence: z.number().int().nonnegative().optional(),
  limit: z.number().int().min(1).max(100).optional() }).strict();
export const postParameters = z.object({ requestId: z.string().uuid(), kind: z.enum(boardKinds),
  body: z.string().trim().min(1).max(4000) }).strict();
const briefSchema = z.object({ schemaVersion: z.literal(1), exists: z.boolean(), content: z.string(),
  format: z.literal('markdown') }).passthrough();
const pageSchema = z.object({ schemaVersion: z.literal(1), entries: z.array(boardEntrySchema),
  nextAfterSequence: z.number().int().nonnegative(), hasMore: z.boolean() }).passthrough();
const postSchema = z.object({ schemaVersion: z.literal(1), sequence: z.number().int().positive(),
  id: z.string(), deduplicated: z.boolean() }).passthrough();
// Namespace retry IDs by conversation so the shared helper cannot deduplicate another actor's post.
export function scopedRequestID(scope: AgentBoardScope, requestID: string): string {
  const hex = createHash('sha256').update(JSON.stringify([scope.taskID, scope.threadID, requestID])).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export class AgentBoardHelper {
  private readonly env: NodeJS.ProcessEnv;
  constructor(readonly scope: AgentBoardScope, env = process.env) {
    this.env = { ...cleanPiEnvironment(env), TASKSHARK_TASK_ID: scope.taskID, TASKSHARK_THREAD_ID: scope.threadID,
      TASKSHARK_BOARD_ROOT: scope.root, TASKSHARK_ACTOR_KIND: 'agent' };
  }
  private command(command: string, args: string[], input: string, sessionID: string, signal?: AbortSignal): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const child = execFile(process.execPath, [this.scope.helper, command, ...args],
        { env: { ...this.env, PI_SESSION_ID: sessionID }, signal, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) { reject(new Error(`Board helper failed: ${stderr.trim() || error.message}. Check TASKSHARK_MCP_RESOURCE_DIR. For uncertain posts retry the same requestId.`)); return; }
          try { resolve(JSON.parse(stdout)); } catch { reject(new Error('Invalid Board helper response; post delivery may be uncertain.')); }
        });
      child.stdin?.on('error', () => { /* Completion reports failed or uncertain delivery. */ });
      child.stdin?.end(input);
    });
  }
  async brief(params: unknown, sessionID: string, signal?: AbortSignal): Promise<unknown> {
    z.object({}).strict().parse(params);
    return briefSchema.parse(await this.command('brief-read', [], '', sessionID, signal));
  }
  async read(params: unknown, sessionID: string, signal?: AbortSignal): Promise<unknown> {
    const p = readParameters.parse(params), args = ['--limit', String(p.limit ?? 50)];
    if (p.afterSequence !== undefined) args.push('--after', String(p.afterSequence));
    return pageSchema.parse(await this.command('board-read', args, '', sessionID, signal));
  }
  async post(params: unknown, sessionID: string, signal?: AbortSignal): Promise<unknown> {
    const p = postParameters.parse(params);
    return postSchema.parse(await this.command('board-post', ['--request-id', scopedRequestID(this.scope, p.requestId),
      '--kind', p.kind, '--source', 'Pi'], p.body, sessionID, signal));
  }
}
