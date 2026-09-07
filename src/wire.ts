import { StringDecoder } from 'node:string_decoder';
import type { Readable } from 'node:stream';

export interface PiMessage {
  role: string; content?: string | Content[]; errorMessage?: string; stopReason?: string;
  toolName?: string; command?: string; output?: string; toolCallId?: string;
  args?: unknown; details?: unknown; isError?: boolean;
}
export interface Content {
  type: string; id?: string; argumentsText?: string; text?: string; thinking?: string; name?: string; arguments?: unknown;
}
export interface Wire {
  type: string; id?: string; command?: string; success?: boolean; error?: string;
  message?: PiMessage; assistantMessageEvent?: { type: string; delta?: string; contentIndex?: number;
    id?: string; toolName?: string; content?: string; toolCall?: Content };
  data?: { sessionFile?: string; messages?: PiMessage[]; isStreaming?: boolean };
  method?: string; title?: string; options?: string[]; prefill?: string; placeholder?: string;
  timeout?: number; toolCallId?: string; toolName?: string; args?: unknown;
  partialResult?: { content?: Content[]; details?: unknown }; result?: { content?: Content[]; details?: unknown }; isError?: boolean;
}
export function parseWire(text: string): Wire {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || !('type' in value) || typeof value.type !== 'string') {
    throw new Error('Pi returned a record without a type.');
  }
  return value as Wire;
}
export function readJsonl(stream: Readable, line: (text: string) => void): void {
  const decoder = new StringDecoder('utf8');
  let buffer = '';
  stream.on('data', (chunk: Buffer) => {
    buffer += decoder.write(chunk);
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const value = buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
      if (value) line(value);
    }
  });
  stream.on('end', () => {
    buffer += decoder.end();
    if (buffer.trim()) line(buffer.replace(/\r$/, ''));
  });
}
export function contentText(content: string | Content[] | undefined): string {
  if (typeof content === 'string') return content;
  return (content ?? []).map(part => part.text ?? part.thinking ??
    (part.name ? `${part.name}: ${JSON.stringify(part.arguments)}` : `[${part.type}]`)).join('\n');
}
export function messageText(message: PiMessage): string {
  return message.errorMessage ?? message.output ?? contentText(message.content);
}
