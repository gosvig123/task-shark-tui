import { wrapTextWithAnsi, truncateToWidth } from '@earendil-works/pi-tui';
import type { Widgets } from 'blessed';
import { safe } from './dialogs.js';

interface WrappedRows { width: number; compact: boolean; rows: Map<string, string[]> }
const wrapped = new WeakMap<Widgets.ListElement, WrappedRows>();

export function navigationLines(box: Widgets.ListElement, rows: string[], compact: boolean): string[][] {
  const width = Math.max(2, Number(box.width) - 5), previous = wrapped.get(box);
  const cached = previous?.width === width && previous.compact === compact ? previous.rows : undefined;
  const next = new Map<string, string[]>();
  const lines = rows.map(text => {
    const result = cached?.get(text) ?? (compact ? [truncateToWidth(safe(text), width)] : wrapTextWithAnsi(safe(text), width));
    next.set(text, result); return result;
  });
  wrapped.set(box, { width, compact, rows: next });
  return lines;
}
