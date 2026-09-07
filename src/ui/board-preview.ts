import type { BoardState } from '../board-state.js';
import type { View } from './view.js';

// Shared Board sequences start at one; zero explicitly selects the loaded aggregate.
export const allProgress = 0;
export function normalizeBoardSelection(view: View): void {
  const state = view.taskScope ? view.boards.state(view.taskScope.id) : undefined;
  if (view.boardSequence === undefined || (state?.loaded && !state.entries.some(entry => entry.sequence === view.boardSequence))) {
    view.boardSequence = allProgress;
  }
}
export function boardRows(state: BoardState): string[] {
  return ['All progress', ...state.entries.map(entry => `#${entry.sequence} ${entry.kind[0].toUpperCase()}${entry.kind.slice(1)}`)];
}
export function previewEntries(state: BoardState, sequence = allProgress) {
  const selected = state.entries.find(entry => entry.sequence === sequence);
  return selected ? [selected] : state.entries;
}
