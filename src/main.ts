import { configuration } from './config.js';
import { Store } from './store.js';
import { lockStore } from './lock.js';
import { Runtime, realFactory } from './runtime.js';
import { DemoClient } from './demo.js';
import { ConversationNamer, piTitleGenerator } from './conversation-namer.js';
import { refreshTasks } from './ui/refresh.js';
import { View } from './ui/view.js';
import { bindKeys } from './ui/keys.js';

function lifecycle(view: View, runtime: Runtime, release: () => void): () => Promise<void> {
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    await runtime.close();
    view.destroy(); release();
    process.exit();
  };
  process.once('SIGINT', () => { void shutdown(); });
  process.once('SIGTERM', () => { void shutdown(); });
  process.once('SIGHUP', () => { void shutdown(); });
  process.once('exit', release);
  runtime.on('fatal', error => {
    view.destroy(); console.error('Cannot save conversation storage:', error);
    process.exitCode = 1; void shutdown();
  });
  return shutdown;
}
function main(): void {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Run npm start in an interactive terminal, or npm run smoke.');
  const config = configuration();
  const release = lockStore(config.root);
  try {
    const store = new Store(config.root, config.demo);
    const namer = config.demo ? undefined : new ConversationNamer(piTitleGenerator(config.pi, config.namingModel));
    const runtime = new Runtime(store, config.demo ? () => new DemoClient() : realFactory(config.pi), namer);
    const view = new View(runtime);
    const shutdown = lifecycle(view, runtime, release);
    bindKeys(view, config, shutdown);
    view.render(); void refreshTasks(view, config);
  } catch (error) { release(); throw error; }
}
try { main(); } catch (error) { console.error(String(error)); process.exitCode = 1; }
