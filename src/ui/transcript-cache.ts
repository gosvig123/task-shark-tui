import type { TranscriptMessage } from '../model.js';
import type { Content } from '../wire.js';

interface RenderedMessage { key: string; output: string }
const messages = new WeakMap<TranscriptMessage, RenderedMessage>();

// Keep one width per message. Weak keys release history when it leaves the store.
export function cachedMessage(message: TranscriptMessage, width: number, cwd: string,
  call: Content | undefined, render: () => string): string {
  const key = JSON.stringify([width, cwd, message, call]);
  const previous = messages.get(message);
  if (previous?.key === key) return previous.output;
  const output = render();
  messages.set(message, { key, output });
  return output;
}
