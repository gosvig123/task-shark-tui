import { randomUUID } from 'node:crypto';
import { type BoardClient, type BoardEntry, type BoardKind } from './board.js';

export interface BoardState {
  entries: BoardEntry[]; reviewed: number; earlier: boolean; loading: boolean; writing: boolean;
  loaded: boolean; error?: string; pending?: { kind: BoardKind; body: string; requestId: string };
}
// Board scope is task ID alone: Today aliases and source lists share that task's feed.
export class Boards {
  private states = new Map<string, BoardState>();
  private refreshPending = new Set<string>();
  refresh(id: string): void {
    const s = this.state(id);
    if (s.loading || s.writing) { this.refreshPending.add(id); return; }
    this.refreshPending.delete(id);
    void this.load(id);
  }
  private drainRefresh(id: string): void {
    if (this.refreshPending.has(id)) this.refresh(id);
  }
  constructor(readonly changed: () => void, readonly demo: boolean, readonly client?: BoardClient) {
    if (!demo && !client) throw new Error('Local Board client is required.');
  }
  state(id: string): BoardState {
    let state = this.states.get(id);
    if (!state) { state = { entries: [], reviewed: 0, earlier: false, loading: false, writing: false, loaded: false }; this.states.set(id, state); }
    return state;
  }
  get writing(): boolean { return [...this.states.values()].some(s => s.writing); }
  get pending(): boolean { return [...this.states.values()].some(s => s.pending); }
  async load(id: string, afterWrite = false): Promise<void> {
    const s = this.state(id);
    if (s.loading || (s.writing && !afterWrite)) return;
    s.loading = true; s.error = undefined; this.changed();
    try {
      if (!this.demo) {
        const [page, reviewed] = await Promise.all([this.client!.read(id), this.client!.review(id)]);
        s.entries = page.entries; s.earlier = page.hasMore; s.reviewed = reviewed;
        await this.loadRemaining(id, s);
      }
      s.loaded = true;
    } catch (error) { s.error = String(error); }
    finally { s.loading = false; this.changed(); this.drainRefresh(id); }
  }
  private async loadRemaining(id: string, s: BoardState): Promise<void> {
    while (s.earlier) {
      const before = s.entries[0]?.sequence;
      if (!before) throw new Error('Cannot load all updates: missing page cursor. Press f to retry.');
      const page = await this.client!.read(id, before);
      if (!page.entries.length || page.entries.some(entry => entry.sequence >= before)) {
        throw new Error('Cannot load all updates: invalid earlier page. Press f to retry.');
      }
      s.entries = [...page.entries, ...s.entries]; s.earlier = page.hasMore;
    }
  }
  async earlier(id: string): Promise<void> {
    const s = this.state(id), before = s.entries[0]?.sequence;
    if (!s.earlier || !before || s.loading || s.writing || this.demo) return;
    s.loading = true; s.error = undefined; this.changed();
    try {
      const page = await this.client!.read(id, before);
      s.entries = [...page.entries, ...s.entries]; s.earlier = page.hasMore;
    } catch (error) { s.error = String(error); }
    finally { s.loading = false; this.changed(); this.drainRefresh(id); }
  }
  async post(id: string, kind: BoardKind, body: string): Promise<void> {
    const s = this.state(id);
    if (s.writing || s.loading || !body.trim()) return;
    if (body.length > 4000 || Buffer.byteLength(body) > 16384) { s.error = 'Update is too long (4000 characters / 16384 bytes).'; this.changed(); return; }
    s.pending ??= { kind, body: body.trim(), requestId: randomUUID() };
    await this.retry(id);
  }
  async retry(id: string): Promise<void> {
    const s = this.state(id), pending = s.pending;
    if (!pending || s.writing || s.loading) return;
    s.writing = true; s.error = undefined; this.changed();
    try {
      if (this.demo) s.entries.push({ schemaVersion: 1, id: randomUUID(), ...pending,
        sequence: (s.entries.at(-1)?.sequence ?? 0) + 1, createdAt: new Date().toISOString(),
        actorKind: 'human', source: 'Human', threadID: null, sessionID: null });
      else await this.client!.post(id, pending.kind, pending.body, pending.requestId);
      s.pending = undefined;
      await this.load(id, true);
    } catch (error) { s.error = `${error}\nDelivery is uncertain. Retry uses the same request ID to prevent duplicates.`; }
    finally { s.writing = false; this.changed(); this.drainRefresh(id); }
  }
  async mark(id: string): Promise<void> {
    const s = this.state(id);
    if (!canReview(s) || s.writing || s.loading) return;
    const sequence = s.entries.at(-1)?.sequence ?? 0;
    s.writing = true; s.error = undefined; this.changed();
    try { s.reviewed = this.demo ? sequence : await this.client!.mark(id, sequence); }
    catch (error) { s.error = String(error); }
    finally { s.writing = false; this.changed(); this.drainRefresh(id); }
  }
}
export function canReview(s: BoardState): boolean {
  const hiddenUnread = s.earlier && s.reviewed < (s.entries[0]?.sequence ?? 1) - 1;
  return s.loaded && !hiddenUnread && s.entries.some(e => e.sequence > s.reviewed);
}
