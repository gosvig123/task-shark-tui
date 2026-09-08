import type { BoardClient, BoardPage, BoardKind } from './board.js';
import { readBoard, readEarlierBoard, reviewedBoard, postBoard, markBoard } from './board-storage.js';
export class LocalBoardClient implements BoardClient {
  constructor(readonly root: string) {}
  async read(id: string, beforeSequence?: number): Promise<BoardPage> {
    return beforeSequence === undefined ? readBoard(this.root, id) : readEarlierBoard(this.root, id, beforeSequence);
  }
  async review(id: string): Promise<number> { return reviewedBoard(this.root, id); }
  async post(id: string, kind: BoardKind, body: string, requestId: string): Promise<void> {
    postBoard(this.root, id, kind, body, requestId, { actorKind: 'human', source: 'Human', threadID: null, sessionID: null });
  }
  async mark(id: string, sequence: number): Promise<number> { return markBoard(this.root, id, sequence); }
}
