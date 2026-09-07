import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { parseWire, readJsonl, type Wire } from './wire.js';

interface Pending { resolve: (wire: Wire) => void; reject: (error: Error) => void; timer?: NodeJS.Timeout }
export interface Transport {
  request(type: string, fields?: Record<string, unknown>, timeout?: number): Promise<Wire>;
  respond(id: string, fields: Record<string, unknown>): void;
  on(event: 'event', listener: (wire: Wire) => void): this;
  on(event: 'failure', listener: (error: Error) => void): this;
  stop(): Promise<void>;
}
export class RpcClient extends EventEmitter implements Transport {
  private child: ChildProcessWithoutNullStreams;
  private pending = new Map<string, Pending>();
  private stopping = false;
  private stderr = '';
  private closed: Promise<void>;
  constructor(binary: string, args: string[], cwd: string) {
    super();
    this.child = spawn(binary, args, { cwd, stdio: 'pipe', detached: process.platform !== 'win32',
      env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('TASKSHARK_'))) });
    this.closed = new Promise(resolve => this.child.once('close', () => resolve()));
    this.child.stderr.on('data', chunk => { this.stderr = (this.stderr + chunk).slice(-4000); });
    this.child.on('error', error => this.fail(error));
    this.child.stdin.on('error', error => this.fail(error));
    this.child.on('close', code => this.fail(new Error(`Pi exited (${code}). ${this.stderr}`)));
    readJsonl(this.child.stdout, line => this.consume(line));
  }
  private consume(line: string): void {
    try {
      const wire = parseWire(line);
      const pending = wire.id ? this.pending.get(wire.id) : undefined;
      if (wire.type !== 'response' || !pending) { this.emit('event', wire); return; }
      this.pending.delete(wire.id!);
      clearTimeout(pending.timer);
      if (wire.success) pending.resolve(wire);
      else pending.reject(new Error(wire.error ?? `Pi rejected ${wire.command}`));
    } catch (error) { this.fail(new Error(`Invalid Pi output: ${String(error)}`)); }
  }
  request(type: string, fields: Record<string, unknown> = {}, timeout = 30_000): Promise<Wire> {
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const timer = timeout ? setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Pi timed out: ${type}`));
      }, timeout) : undefined;
      this.pending.set(id, { resolve, reject, timer });
      try { this.write({ ...fields, type, id }); }
      catch (error) { this.pending.delete(id); clearTimeout(timer); reject(error); }
    });
  }
  respond(id: string, fields: Record<string, unknown>): void {
    this.write({ type: 'extension_ui_response', id, ...fields });
  }
  private write(value: Record<string, unknown>): void {
    if (this.stopping || !this.child.stdin.writable) throw new Error('Pi is not running.');
    this.child.stdin.write(JSON.stringify(value) + '\n');
  }
  private fail(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    if (!this.stopping) this.emit('failure', error);
  }
  async stop(): Promise<void> {
    if (this.stopping) return this.closed;
    this.stopping = true;
    this.fail(new Error('Pi connection closed.'));
    this.child.stdin.end();
    this.terminate('SIGTERM');
    const timer = setTimeout(() => this.terminate('SIGKILL'), 1500);
    await this.closed;
    clearTimeout(timer);
    this.terminate('SIGKILL');
  }
  private terminate(signal: NodeJS.Signals): void {
    if (!this.child.pid) return;
    try {
      if (process.platform === 'win32') this.child.kill(signal);
      else process.kill(-this.child.pid, signal);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
  }
}
