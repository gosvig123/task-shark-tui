"""Task editing uses isolated fake tasks/Pi and a temporary Board root."""
import json
from datetime import datetime, timezone
import re
import os
import runpy
import signal
import tempfile
from pathlib import Path

navigation = runpy.run_path('scripts/pty-navigation-smoke.py')
creation = navigation['creation']
key, drain, frame = navigation['key'], navigation['drain'], navigation['frame']
DOWN = '\x1b[B'


def field(fd, index, value, multiline=False):
    key(fd, DOWN * index + '\r')
    key(fd, '\x15' + value + ('\x13' if multiline else '\r'))


def mutations(root):
    return [c for c in creation['calls'](root) if c.get('input') and c['input'].get('operation') == 'task.update']


def edit(fd, root):
    creation['startup'](fd, root); key(fd, '\r'); key(fd, 'e')
    assert 'Title: Fix calendar sync' in frame(root, 'edit-prefilled')
    key(fd, '\x1b'); assert mutations(root) == []
    key(fd, 'e'); key(fd, DOWN * 3 + '\r'); assert mutations(root) == []
    key(fd, 'e'); field(fd, 0, 'Edited task')
    field(fd, 1, 'Multiline edit\rSecond line', True); field(fd, 2, '2026-02-30')
    key(fd, DOWN * 3 + '\r'); assert mutations(root) == []
    assert 'real date' in frame(root, 'edit-invalid-date')
    field(fd, 2, '2027-04-15'); key(fd, DOWN * 3 + '\r'); drain(fd, .7)
    text = frame(root, 'edit-100-saved')
    assert 'Edited task' in text and 'Multiline edit' in text and '2027-04-15' in text
    assert len(mutations(root)) == 1
    creation['resize'](fd, 70, 24); drain(fd, .5)
    assert 'Edited task' in frame(root, 'edit-70-saved')
    key(fd, 'e'); field(fd, 1, '', True); field(fd, 2, ''); key(fd, DOWN * 3 + '\r'); drain(fd, .5)
    text = frame(root, 'edit-70-cleared'); assert 'No notes.' in text and 'No date' in text
    key(fd, '\x1b'); assert 'Edited task' in frame(root, 'edit-back-list')
    state = json.loads(Path(root, 'state.json').read_text()); assert state['currentList'] == 'Empty list'


def cursor_edit(fd, root):
    key(fd, '\r'); key(fd, 'e'); key(fd, '\r')
    key(fd, '\x01' + '\x1b[C' * 7 + '\x1b[3~' + 'T' + '\x05' + 'X\x7f!\r')
    field(fd, 2, '2026-09-07'); key(fd, DOWN * 2 + '\r')
    key(fd, '\x1b[1;5D' + '\x1b[3~' * 2 + '15')
    key(fd, '\x1b[H\x1b[1;5C' + '\x1b[3~' * 2 + '10')
    key(fd, '\x1b[F\x1b[D\x7f1\x1b[C')
    text = frame(root, 'cursor-date'); assert '2026-10-15' in text
    raw = Path(root, 'frame.txt').read_text(); Path('/tmp/task-shark-cursor-date.ansi').write_text(raw)
    assert re.search(r'\x1b\[[0-9;]*7(?:;[0-9]+)*m', raw)
    key(fd, '\r'); key(fd, DOWN + '\r')
    key(fd, 'First 🦈 line\rSecond cafe\u0301\x01\x1b[1;5Cnew \x05\x7fé')
    frame(root, 'cursor-notes'); key(fd, '\x13'); key(fd, DOWN * 3 + '\r'); drain(fd, .5)
    state = json.loads(Path(root, 'state.json').read_text())
    task = next(t for t in state['byList']['Work'] if t['id'] == 'calendar')
    assert task['title'] == 'Edited Task!' and task['dueDate'] == '2026-10-15'
    assert task['description'] == 'First 🦈 line\nSecond new café'
    key(fd, 'e'); key(fd, '\r'); key(fd, '\x01Discarded'); key(fd, '\x1b'); key(fd, '\x1b')
    key(fd, '\x1b')


def conflict(fd, root):
    before = len(mutations(root))
    key(fd, '\r'); key(fd, 'e'); field(fd, 0, 'Retained conflicted title')
    Path(root, 'mode').write_text('conflict'); key(fd, DOWN * 3 + '\r')
    text = frame(root, 'edit-conflict')
    assert 'Retained conflicted title' in text and 'Review latest source' in text
    key(fd, '\x1b'); Path(root, 'mode').unlink()
    assert len(mutations(root)) == before + 1


def demo():
    with tempfile.TemporaryDirectory(prefix='task-edit-demo-') as root:
        pid, fd = navigation['workspace']['start'](root)
        try:
            drain(fd, 1); key(fd, 't'); key(fd, '\r'); key(fd, 'e')
            field(fd, 0, 'Memory-only task'); key(fd, DOWN * 3 + '\r')
            assert 'Memory-only task' in frame(root, 'edit-demo')
            assert not Path(root, 'calls.jsonl').exists() and not Path(root, 'board').exists()
            creation['smoke']['stop'](pid, fd)
        except BaseException:
            os.kill(pid, signal.SIGKILL); os.waitpid(pid, 0); os.close(fd)
            raise


def edit_today(fd, root, mode):
    creation['startup'](fd, root)
    path = Path(root, 'state.json'); state = json.loads(path.read_text())
    state['byList']['Work'][0]['dueDate'] = ''
    if mode == 'direct':
        state['byList']['today'] = [{**state['byList']['Work'][0], 'id': 'direct-today', 'ownerList': 'today', 'placement': 'direct'}]
    path.write_text(json.dumps(state)); key(fd, 'f'); drain(fd, .5)
    key(fd, 'l'); key(fd, 'today'); key(fd, '\r'); key(fd, '\r'); key(fd, 'e')
    if mode == 'direct':
        assert 'stored directly in Today' in frame(root, 'today-direct-before-save')
    field(fd, 2, datetime.now(timezone.utc).date().isoformat())
    if mode == 'remove-conflict': Path(root, 'mode').write_text(mode)
    key(fd, DOWN * 3 + '\r'); drain(fd, .7)
    if mode == 'remove-conflict':
        assert 'removal pending' in frame(root, 'today-removal-pending')
        Path(root, 'mode').unlink(); key(fd, 'e'); key(fd, DOWN + '\r'); drain(fd, .7)
    key(fd, '\x1b'); text = frame(root, 'today-back-' + (mode or 'removed'))
    assert ('No tasks match' in text) == (mode != 'direct')
    state = json.loads(path.read_text()); assert state['byList']['Work'] and state['currentList'] == 'Empty list'
    operations = [c['input']['operation'] for c in creation['calls'](root) if c.get('input')]
    assert operations.count('task.update') == 1 and 'task.delete' not in operations
    if mode == 'direct': assert 'task.removeFromToday' not in operations


def today_case(mode):
    with tempfile.TemporaryDirectory(prefix='task-today-edit-') as root:
        pid, fd = navigation['start'](root)
        try:
            edit_today(fd, root, mode); creation['smoke']['stop'](pid, fd)
        except BaseException:
            os.kill(pid, signal.SIGKILL); os.waitpid(pid, 0); os.close(fd)
            raise


def main():
    with tempfile.TemporaryDirectory(prefix='task-edit-') as root:
        pid, fd = navigation['start'](root)
        try:
            edit(fd, root); cursor_edit(fd, root); conflict(fd, root)
            creation['smoke']['stop'](pid, fd)
        except BaseException:
            os.kill(pid, signal.SIGKILL); os.waitpid(pid, 0); os.close(fd)
            raise
    demo()
    for mode in ['', 'remove-conflict', 'direct']: today_case(mode)
    print('Task edit PTY passed: prefill, cancel/noop, invalid date, multiline save, clear, cursor/control editing, Unicode, Today removal/recovery/direct safety, conflict retention, back and resize.')


if __name__ == '__main__':
    main()
