import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : /\.(ts|mjs)$/.test(path) ? [path] : [];
  });
}
const failures: string[] = [];
function inspect(path: string): void {
  const text = readFileSync(path, 'utf8');
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  if (text.trimEnd().split('\n').length > 200) failures.push(`${path}: exceeds 200 lines`);
  function visit(node: ts.Node): void {
    if (ts.isFunctionLike(node) && 'body' in node && node.body) {
      const start = source.getLineAndCharacterOfPosition(node.getStart()).line;
      const end = source.getLineAndCharacterOfPosition(node.getEnd()).line;
      if (end - start + 1 > 25) failures.push(`${path}:${start + 1}: function has ${end - start + 1} lines`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
for (const file of ['src', 'tests', 'scripts'].flatMap(files)) inspect(file);
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log('All TypeScript/JavaScript files <= 200 lines; functions <= 25 lines.');
