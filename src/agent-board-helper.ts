import { readTask, mutateTask } from './task-mutations.js';
import { z } from 'zod';
import { boardKinds } from './board.js';
import { readBoard, postBoard } from './board-storage.js';
import type { AgentBoardScope } from './agent-board-scope.js';

export const readParameters = z.object({ afterSequence: z.number().int().nonnegative().optional(),
  limit: z.number().int().min(1).max(100).optional() }).strict();
export const postParameters = z.object({ requestId: z.string().uuid(), kind: z.enum(boardKinds),
  body: z.string().trim().min(1).max(4000) }).strict();
export class AgentBoardHelper {
  readonly scope: AgentBoardScope;
  constructor(scope: AgentBoardScope) { this.scope = Object.freeze({ ...scope }); }
  async taskRead(params: unknown, signal?: AbortSignal): Promise<unknown> {
    signal?.throwIfAborted(); z.object({}).strict().parse(params);
    return readTask(this.scope.root, this.scope.taskID);
  }
  async taskUpdate(params: unknown, signal?: AbortSignal): Promise<unknown> {
    signal?.throwIfAborted();
    return mutateTask(this.scope.root, this.scope.taskID, params);
  }
  async brief(params: unknown, _sessionID: string, signal?: AbortSignal): Promise<unknown> {
    signal?.throwIfAborted(); z.object({}).strict().parse(params);
    return { exists: true, content: this.scope.brief, format: 'json' };
  }
  async read(params: unknown, _sessionID: string, signal?: AbortSignal): Promise<unknown> {
    signal?.throwIfAborted();
    const p = readParameters.parse(params);
    return readBoard(this.scope.root, this.scope.taskID, p.afterSequence ?? 0, p.limit ?? 50);
  }
  async post(params: unknown, sessionID: string, signal?: AbortSignal): Promise<unknown> {
    signal?.throwIfAborted();
    const p = postParameters.parse(params);
    return postBoard(this.scope.root, this.scope.taskID, p.kind, p.body, p.requestId,
      { actorKind: 'agent', source: 'Pi', threadID: this.scope.threadID, sessionID });
  }
}
