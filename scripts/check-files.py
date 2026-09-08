"""Check the hard repository file limit, including compact generated JSON."""
import ast
from pathlib import Path

EXCLUDED = {".git", "node_modules", "__pycache__", "dist"}
# Archify output and browser evidence are generated; keep the source JSON checked.
GENERATED = {Path('docs/task-shark-architecture.html'), Path('docs/task-shark-architecture.visual-check.json')}
files = [p for p in Path(".").rglob("*") if p.is_file() and not EXCLUDED.intersection(p.parts)]
for path in files:
    if path in GENERATED:
        continue
    data = path.read_bytes()
    if data.startswith((b'\x89PNG\r\n\x1a\n', b'GIF87a', b'GIF89a', b'\xff\xd8\xff')):
        continue
    try:
        text = data.decode('utf-8')
    except UnicodeDecodeError as error:
        raise ValueError(f'{path}: unexpected non-UTF-8 text') from error
    assert len(text.splitlines()) <= 200, f"{path}: exceeds 200 lines"
    if path.suffix != ".py":
        continue
    for node in ast.walk(ast.parse(text)):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            assert node.end_lineno - node.lineno + 1 <= 25, f"{path}:{node.name}: exceeds 25 lines"
print(f"All {len(files)} repository files <=200 lines; Python functions <=25 lines.")
