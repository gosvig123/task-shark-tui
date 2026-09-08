import type { Conversation } from './model.js';
import { RpcClient } from './rpc.js';
import type { Wire } from './wire.js';
import { boardEnvironment, boardReady, boardStatusCommand, boardExtension } from './agent-board-scope.js';
import { piArguments } from './pi-launch.js';

export class AgentBoardRpc extends RpcClient {
  private readonly expected: string;
  constructor(binary: string, c: Conversation, sessions: string, root: string) {
    const env = boardEnvironment(c, root);
    super(binary, piArguments(c, sessions), c.workspace, env);
    this.expected = boardReady({ taskID: c.task!.id, threadID: c.id });
  }
  override async request(type: string, fields: Record<string, unknown> = {}, timeout = 30_000): Promise<Wire> {
    if (type === 'prompt') {
      const response = await super.request('get_commands');
      const status = response.data?.commands?.filter(command => command.name === boardStatusCommand);
      if (status?.length !== 1 || status[0].description !== this.expected ||
        (status[0].sourceInfo?.path ?? status[0].path) !== boardExtension) {
        throw new Error('Board tools unavailable or conflicting. Check Pi extension errors/tool settings. Your message is retained; retry after fixing setup.');
      }
    }
    return super.request(type, fields, timeout);
  }
}
