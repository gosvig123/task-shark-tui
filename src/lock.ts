import { openSync, closeSync, readFileSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
}
export function lockStore(root: string): () => void {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const path = join(root, 'app.lock');
  try { return acquire(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const pid = Number(readFileSync(path, 'utf8'));
    if (!Number.isInteger(pid) || pid <= 0 || alive(pid)) {
      throw new Error(`Storage is locked (${path}). Close the other app; inspect an invalid lock manually.`);
    }
    throw new Error(`Stale storage lock (${path}, process ${pid}). Verify no app is running, then remove this lock file.`);
  }
}
function acquire(path: string): () => void {
  const fd = openSync(path, 'wx', 0o600);
  writeFileSync(fd, String(process.pid));
  closeSync(fd);
  return () => {
    try { if (readFileSync(path, 'utf8') === String(process.pid)) unlinkSync(path); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  };
}
