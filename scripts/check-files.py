"""Check the hard repository file limit, including compact generated JSON."""
import ast
from pathlib import Path

EXCLUDED = {".git", "node_modules", "__pycache__", "dist"}
files = [p for p in Path(".").rglob("*") if p.is_file() and not EXCLUDED.intersection(p.parts)]
for path in files:
    text = path.read_text()
    assert len(text.splitlines()) <= 200, f"{path}: exceeds 200 lines"
    if path.suffix != ".py":
        continue
    for node in ast.walk(ast.parse(text)):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            assert node.end_lineno - node.lineno + 1 <= 25, f"{path}:{node.name}: exceeds 25 lines"
print(f"All {len(files)} repository files <=200 lines; Python functions <=25 lines.")
