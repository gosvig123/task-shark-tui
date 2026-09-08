"""Task editing uses local SQLite and isolated Pi."""
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
focus = 0


def open_editor(fd, root):
    global focus
    focus = 0
    key(fd, 'e')
    for _ in range(50):
        text = Path(root, 'frame.txt').read_text()
        if 'Edit task' in text or 'Date already saved' in text:
            return
        drain(fd, .1)
    raise AssertionError('Task editor did not finish loading its source snapshot')


def field(fd, index, value, multiline=False):
    global focus
    target = [0, 2, 1][index]
    key(fd, '\t' * ((target - focus) % 5))
    focus = target
    key(fd, '\x15' + value)


def current(root):
    return next(t for t in creation['state'](root)['byList']['Work'] if t['id'] == 'calendar')


def edit(fd, root):
    creation['startup'](fd, root); key(fd, '\r'); open_editor(fd, root)
    text = frame(root, 'edit-prefilled')
    assert all(label in text for label in ['Fix calendar sync', 'Title', 'Due date', 'Notes', '[ Save ]', '[ Cancel ]'])
    key(fd, '\x1b[Z'); assert '▶ [ Cancel ]' in frame(root, 'edit-reverse-tab')
    key(fd, '\t')
    key(fd, '\x1b'); assert current(root)['title'] == 'Fix calendar sync'
    open_editor(fd, root); key(fd, '\x13'); assert current(root)['title'] == 'Fix calendar sync'
    open_editor(fd, root); field(fd, 0, 'Edited task')
    field(fd, 1, 'Multiline edit\rSecond line', True); field(fd, 2, '2026-02-30')
    key(fd, '\x13'); assert current(root)['title'] == 'Fix calendar sync'
    assert 'real date' in frame(root, 'edit-invalid-date')
    field(fd, 2, '2027-04-15'); key(fd, '\x13'); drain(fd, .7)
    text = frame(root, 'edit-100-saved')
    assert 'Edited task' in text and 'Multiline edit' in text and '2027-04-15' in text
    assert current(root)['title'] == 'Edited task'
    creation['resize'](fd, 70, 24); drain(fd, .5)
    assert 'Edited task' in frame(root, 'edit-70-saved')
    open_editor(fd, root); field(fd, 1, '', True); field(fd, 2, ''); key(fd, '\x13'); drain(fd, .5)
    text = frame(root, 'edit-70-cleared'); assert 'No notes.' in text and 'No date' in text
    key(fd, '\x1b'); assert 'Edited task' in frame(root, 'edit-back-list')
    state = creation['state'](root); assert state['currentList'] == 'Empty list'


def cursor_edit(fd, root):
    key(fd, '\r'); open_editor(fd, root)
    key(fd, '\x01' + '\x1b[C' * 7 + '\x1b[3~' + 'T' + '\x05' + 'X\x7f!')
    field(fd, 2, '2026-09-07')
    key(fd, '\x1b[1;5D' + '\x1b[3~' * 2 + '15')
    key(fd, '\x1b[H\x1b[1;5C' + '\x1b[3~' * 2 + '10')
    key(fd, '\x1b[F\x1b[D\x7f1\x1b[C')
    creation['resize'](fd, 100, 30); drain(fd, .3)
    text = frame(root, 'cursor-date'); assert '2026-10-15' in text
    creation['resize'](fd, 70, 24); drain(fd, .3)
    text = frame(root, 'edit-form-70')
    assert all(label in text for label in ['2026-10-15', 'Title', 'Notes', '[ Save ]', '[ Cancel ]'])
    raw = Path(root, 'frame.txt').read_text(); Path('/tmp/task-shark-cursor-date.ansi').write_text(raw)
    assert re.search(r'\x1b\[[0-9;]*7(?:;[0-9]+)*m', raw)
    field(fd, 1, 'First 🦈 line\rSecond café')
    key(fd, '\x01\x1b[1;5Cnew \x05\x7fé')
    frame(root, 'cursor-notes'); key(fd, '\x13'); drain(fd, .5)
    state = creation['state'](root)
    task = next(t for t in state['byList']['Work'] if t['id'] == 'calendar')
    assert task['title'] == 'Edited Task!' and task['dueDate'] == '2026-10-15'
    assert task['description'] == 'First 🦈 line\nSecond new café'
    open_editor(fd, root); key(fd, '\x01Discarded'); key(fd, '\x1b')
    key(fd, '\x1b')


def conflict(fd, root):
    before = current(root)
    key(fd, '\r'); open_editor(fd, root); field(fd, 0, 'Retained conflicted title')
    creation['local']['update'](root, {**before, 'title': 'External edit'})
    key(fd, '\x13')
    text = frame(root, 'edit-conflict')
    assert 'Retained conflicted title' in text and 'Review latest source' in text
    key(fd, '\x13'); assert 'Retained draft' in frame(root, 'edit-source-review')
    key(fd, DOWN + '\r')
    assert 'Retained conflicted title' in frame(root, 'edit-rebased')
    assert '[ Save ]' in frame(root, 'edit-rebased')
    key(fd, '\x1b')
    assert current(root)['title'] == 'External edit'


def demo():
    with tempfile.TemporaryDirectory(prefix='task-edit-demo-') as root:
        pid, fd = navigation['workspace']['start'](root)
        try:
            drain(fd, 1); key(fd, 't'); key(fd, '\r'); open_editor(fd, root)
            field(fd, 0, 'Memory-only task'); key(fd, '\x13')
            assert 'Memory-only task' in frame(root, 'edit-demo')
            assert not Path(root, 'calls.jsonl').exists() and not Path(root, 'board').exists()
            creation['smoke']['stop'](pid, fd)
        except BaseException:
            os.kill(pid, signal.SIGKILL); os.waitpid(pid, 0); os.close(fd)
            raise


def edit_today(fd, root, mode):
    creation['startup'](fd, root)
    creation['local']['update'](root, {**current(root), 'dueDate': ''})
    key(fd, 'f'); drain(fd, .5)
    key(fd, 'l'); key(fd, 'today'); key(fd, '\r'); key(fd, '\r'); open_editor(fd, root)
    field(fd, 2, datetime.now(timezone.utc).date().isoformat())
    if mode == 'remove-conflict':
        creation['sql'](root, "CREATE TRIGGER refuse_removal BEFORE DELETE ON today BEGIN SELECT RAISE(ABORT, 'blocked'); END")
    key(fd, '\x13'); drain(fd, .7)
    if mode == 'remove-conflict':
        assert 'removal pending' in frame(root, 'today-removal-pending')
        creation['sql'](root, 'DROP TRIGGER refuse_removal'); open_editor(fd, root); key(fd, DOWN + '\r'); drain(fd, .7)
    key(fd, '\x1b'); text = frame(root, 'today-back-' + (mode or 'removed'))
    assert 'No tasks match' in text
    state = creation['state'](root)
    assert state['byList']['Work'] and state['currentList'] == 'Empty list'
    assert current(root)['dueDate'] == datetime.now(timezone.utc).date().isoformat()


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
    for mode in ['', 'remove-conflict']: today_case(mode)
    print('Task edit PTY passed: prefill, cancel/noop, invalid date, multiline save, clear, cursor/control editing, Unicode, Today removal/recovery, conflict retention, back and resize.')


if __name__ == '__main__':
    main()
