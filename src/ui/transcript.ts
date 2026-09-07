import { AssistantMessageComponent, UserMessageComponent, ToolExecutionComponent, initTheme,
  createReadToolDefinition, createBashToolDefinition, createEditToolDefinition, createWriteToolDefinition,
  createGrepToolDefinition, createFindToolDefinition, createLsToolDefinition } from '@earendil-works/pi-coding-agent';
import type { TUI } from '@earendil-works/pi-tui';
import type { Conversation, LiveState, TranscriptMessage } from '../model.js';
import { contentText, type PiMessage, type Content } from '../wire.js';
import { safe } from './dialogs.js';

initTheme('dark', false);
const factories = { read: createReadToolDefinition, bash: createBashToolDefinition, edit: createEditToolDefinition,
  write: createWriteToolDefinition, grep: createGrepToolDefinition, find: createFindToolDefinition, ls: createLsToolDefinition };
// Pi's static tool renderer uses only requestRender; Task Shark owns the render loop.
const staticUi = { requestRender() {} } as TUI;
function clean<T>(value: T): T {
  if (typeof value === 'string') return safe(value) as T;
  if (Array.isArray(value)) return value.map(clean) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .map(([key, item]) => [safe(key), clean(item)])) as T;
  return value;
}
export function rendererOutput(text: string): string {
  return text.split(/(\x1b\[[0-9;]*m)/g).map(part => /^\x1b\[[0-9;]*m$/.test(part) ? part : safe(part)).join('');
}
function blocks(pi: PiMessage): Content[] {
  if (typeof pi.content === 'string') return [{ type: 'text', text: pi.content }];
  return (pi.content ?? []).filter(Boolean).map(block => {
    if (block.type === 'text') return { ...block, text: typeof block.text === 'string' ? block.text : '' };
    if (block.type === 'thinking') return { ...block, thinking: typeof block.thinking === 'string' ? block.thinking : '' };
    return block;
  });
}
function assistant(pi: PiMessage, width: number, streaming: boolean): string[] {
  const component = new AssistantMessageComponent();
  const message = { ...pi, content: blocks(pi) } as Parameters<typeof component.updateContent>[0];
  component.updateContent(message, streaming);
  return component.render(width);
}
function tool(pi: PiMessage, call: Content | undefined, width: number, cwd: string, pending: boolean): string[] {
  const name = pi.toolName ?? call?.name ?? 'tool';
  const incomplete = pending && !!call?.argumentsText && pi.args === undefined;
  const factory = incomplete ? undefined : factories[name as keyof typeof factories];
  const args = incomplete ? { arguments: call.argumentsText } : pi.args ?? call?.arguments ?? {};
  const component = new ToolExecutionComponent(name, pi.toolCallId ?? call?.id ?? '', args,
    { showImages: false }, factory?.(cwd), staticUi, cwd);
  component.setExpanded(true);
  if (!pending) component.setArgsComplete();
  if (pi.content) component.updateResult({ content: blocks(pi), details: pi.details, isError: pi.isError ?? false }, pending);
  return component.render(width);
}
function renderMessage(message: TranscriptMessage, width: number, cwd: string, calls: Map<string, Content>, pending = false): string[] {
  const pi = clean(message.pi ?? { role: message.role, content: message.text });
  if (message.role === 'Interrupted output') return [safe(`${message.role}\n${message.text}`)];
  if (pi.role === 'user') return new UserMessageComponent(contentText(pi.content)).render(width);
  if (pi.role === 'assistant') return assistant(pi, width, pending);
  if (pi.role === 'toolResult') return tool(pi, calls.get(pi.toolCallId ?? ''), width, cwd, pending);
  return [safe(`${message.role === 'Activity' ? '' : message.role + '\n'}${message.text}`)];
}
export function transcript(c: Conversation, live: LiveState, width: number): string {
  width = Math.max(8, Math.floor(width));
  const cwd = safe(c.workspace);
  const messages = [...c.messages];
  const partial = live.streaming ?? (live.partial ? { role: 'assistant', content: live.partial } : undefined);
  if (partial) messages.push({ role: 'assistant', text: '', pi: partial });
  const calls = new Map<string, Content>();
  for (const message of messages) for (const block of blocks(message.pi ?? { role: '' })) {
    if (block.type === 'toolCall' && block.id) calls.set(block.id, clean(block));
  }
  const results = new Set(messages.filter(m => m.pi?.role === 'toolResult').map(m => m.pi?.toolCallId));
  const lines = messages.flatMap(m => renderMessage(m, width, cwd, calls, m.pi === partial));
  for (const [id, call] of calls) if (!results.has(id) && !live.tools.has(id)) {
    lines.push(...tool({ role: 'toolResult' }, call, width, cwd, true));
  }
  for (const pi of live.tools.values()) lines.push(...tool(clean(pi), calls.get(pi.toolCallId ?? ''), width, cwd, true));
  for (const text of live.activity.values()) lines.push(safe(text));
  return rendererOutput(lines.join('\n'));
}
