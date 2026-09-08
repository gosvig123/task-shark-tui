import { z } from 'zod';

export const boardKinds = ['note', 'progress', 'decision', 'blocker', 'handoff'] as const;
export const boardEntrySchema = z.object({ schemaVersion: z.literal(1), sequence: z.number().int().positive(),
  id: z.string(), requestId: z.string(), createdAt: z.string(), kind: z.enum(boardKinds), body: z.string(),
  actorKind: z.enum(['human', 'agent']), source: z.string().nullable(), threadID: z.string().nullable(), sessionID: z.string().nullable() });
export type BoardEntry = z.infer<typeof boardEntrySchema>;
export type BoardKind = typeof boardKinds[number];
export interface BoardPage { entries: BoardEntry[]; hasMore: boolean }
export interface BoardClient {
  read(taskID: string, beforeSequence?: number): Promise<BoardPage>;
  review(taskID: string): Promise<number>;
  post(taskID: string, kind: BoardKind, body: string, requestId: string): Promise<void>;
  mark(taskID: string, sequence: number): Promise<number>;
}
