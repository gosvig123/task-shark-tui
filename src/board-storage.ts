import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { boardEntrySchema, boardKinds, type BoardEntry, type BoardKind } from './board.js';
import { database } from './task-database.js';

export type BoardActor = Pick<BoardEntry, 'actorKind' | 'source' | 'threadID' | 'sessionID'>;
const postInput = z.object({ kind: z.enum(boardKinds), body: z.string().trim().min(1).max(4000), requestId: z.string().uuid() });
export function readBoard(root: string, taskID: string, afterSequence?: number, limit = 100) {
  z.number().int().min(1).max(100).parse(limit);
  if (afterSequence !== undefined) z.number().int().nonnegative().parse(afterSequence);
  return database(root, db => {
    const rows = afterSequence === undefined ? db.prepare('SELECT data FROM board_entries WHERE task_id = ? ORDER BY sequence DESC LIMIT ?').all(taskID, limit + 1) :
      db.prepare('SELECT data FROM board_entries WHERE task_id = ? AND sequence > ? ORDER BY sequence LIMIT ?').all(taskID, afterSequence, limit + 1);
    const entries = rows.slice(0, limit).map(row => boardEntrySchema.parse(JSON.parse(String(row.data))));
    if (afterSequence === undefined) entries.reverse();
    return { entries, hasMore: rows.length > limit, nextAfterSequence: entries.at(-1)?.sequence ?? afterSequence ?? 0 };
  });
}
export function postBoard(root: string, taskID: string, kind: BoardKind, body: string, requestId: string, actor: BoardActor) {
  const input = postInput.parse({ kind, body, requestId });
  if (Buffer.byteLength(input.body) > 16384) throw new Error('Update exceeds 16384 bytes.');
  const key = JSON.stringify([actor.actorKind, actor.threadID, requestId]);
  return database(root, db => {
    const row = db.prepare('SELECT data FROM board_entries WHERE task_id = ? AND request_key = ?').get(taskID, key);
    if (row) return duplicatePost(boardEntrySchema.parse(JSON.parse(String(row.data))), input, actor);
    const sequence = Number(db.prepare('SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM board_entries WHERE task_id = ?').get(taskID)!.next);
    const entry = boardEntrySchema.parse({ schemaVersion: 1, ...input, ...actor, sequence, id: randomUUID(), createdAt: new Date().toISOString() });
    db.prepare('INSERT INTO board_entries VALUES (?, ?, ?, ?)').run(taskID, sequence, key, JSON.stringify(entry));
    return { sequence, id: entry.id, deduplicated: false };
  });
}
function duplicatePost(entry: BoardEntry, input: z.infer<typeof postInput>, actor: BoardActor) {
  if (entry.body !== input.body || entry.kind !== input.kind || entry.source !== actor.source) throw new Error('Request ID conflicts with an existing update.');
  return { sequence: entry.sequence, id: entry.id, deduplicated: true };
}
export function reviewedBoard(root: string, taskID: string): number {
  return database(root, db => Number(db.prepare('SELECT sequence FROM board_reviews WHERE task_id = ?').get(taskID)?.sequence ?? 0));
}
export function markBoard(root: string, taskID: string, sequence: number): number {
  z.number().int().nonnegative().parse(sequence);
  return database(root, db => {
    const latest = Number(db.prepare('SELECT COALESCE(MAX(sequence), 0) AS latest FROM board_entries WHERE task_id = ?').get(taskID)!.latest);
    if (sequence > latest) throw new Error('Cannot review updates that do not exist.');
    db.prepare('INSERT INTO board_reviews VALUES (?, ?) ON CONFLICT(task_id) DO UPDATE SET sequence = MAX(sequence, excluded.sequence)').run(taskID, sequence);
    return Number(db.prepare('SELECT sequence FROM board_reviews WHERE task_id = ?').get(taskID)!.sequence);
  });
}

export function readEarlierBoard(root: string, taskID: string, beforeSequence: number) {
  z.number().int().positive().parse(beforeSequence);
  return database(root, db => {
    const rows = db.prepare('SELECT data FROM board_entries WHERE task_id = ? AND sequence < ? ORDER BY sequence DESC LIMIT 101').all(taskID, beforeSequence);
    return { entries: rows.slice(0, 100).map(row => boardEntrySchema.parse(JSON.parse(String(row.data)))).reverse(), hasMore: rows.length > 100 };
  });
}
