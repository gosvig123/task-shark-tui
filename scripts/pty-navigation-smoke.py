"""Navigation and saved filters against isolated fake services and captured real frames."""
import os
import json
import pty
import runpy
import signal
import tempfile
from pathlib import Path

creation = runpy.run_path('scripts/pty-creation-smoke.py')
workspace = runpy.run_path('scripts/pty-workspace-smoke.py')
key, drain, frame = creation['key'], creation['drain'], workspace['frame']


def start(root):
    pi = creation['fixture'](root)
    task = {'id': 'second', 'title': 'Second calendar task', 'completed': False,
        'ownerList': 'Work', 'dueDate': '2026-09-09', 'subtasks': [],
        'description': '\n'.join('Second detail line ' + str(i) for i in range(40))}
    creation['sql'](root, 'INSERT OR IGNORE INTO tasks VALUES (?, ?, ?)', ('second', 'Work', json.dumps(task)))
    pid, fd = pty.fork()
    if pid == 0:
        os.environ.update(HOME=root, TERM='xterm-256color', TASK_SHARK_DATA_DIR=root + '/demo',
                          TASK_SHARK_PI=str(pi),
                          WORKSPACE_FRAME=root + '/frame.txt')
        os.execvp('node', ['node', '--require', './tests/fixtures/capture-workspace.cjs',
                          '--import', 'tsx', 'src/main.ts'])
    creation['resize'](fd, 100, 30)
    return pid, fd


def tabs(fd, root):
    creation['startup'](fd, root)
    key(fd, 'l'); key(fd, 'Work'); key(fd, '\r')
    key(fd, 'o'); key(fd, 'Pending'); key(fd, '\r')
    saved = json.loads(Path(root, 'demo', 'task-preferences.json').read_text())
    assert saved['listFilter'] == 'Work' and saved['taskFilter'] == 'Pending'
    key(fd, '/'); key(fd, 'calendar\r'); key(fd, '\x1b[B'); key(fd, '\x1b[6~')
    before = frame(root, 'navigation-before-scroll').splitlines()[2:-3]
    key(fd, 'c'); key(fd, '/'); key(fd, 'no-conversation\r')
    key(fd, 'r'); key(fd, '/'); key(fd, 'no-review\r')
    key(fd, 't'); text = frame(root, 'navigation-tasks')
    assert 'Second detail line' in text and text.splitlines()[2:-3] == before
    key(fd, '\r'); key(fd, '1'); drain(fd, .7)
    key(fd, 'c'); key(fd, 't')
    assert 'Details' in frame(root, 'navigation-restored-board').splitlines()[1]
    assert 'Preview' in frame(root, 'navigation-restored-focus')
    key(fd, '2'); key(fd, 'n'); key(fd, 'Discarded navigation draft'); key(fd, '\x1b')
    assert 'Conversations' in frame(root, 'navigation-cancelled-draft')
    creation['no_conversations'](root)
    key(fd, '\x1b'); assert 'Task Workspace' in frame(root, 'navigation-back')


def clear_and_refresh(fd, root):
    key(fd, '/'); key(fd, '\x15'); key(fd, 'missing-task\r')
    assert 'No tasks match' in frame(root, 'navigation-excluded')
    key(fd, 'c'); key(fd, 't'); assert 'No tasks match' in frame(root, 'navigation-saved-query')
    key(fd, '\x1b'); assert 'Fix calendar sync' in frame(root, 'navigation-cleared')
    key(fd, 'l'); key(fd, 'Work'); key(fd, '\r'); key(fd, 'c')
    creation['sql'](root, "DELETE FROM tasks WHERE owner = 'Work'")
    creation['sql'](root, "DELETE FROM task_lists WHERE name = 'Work'")
    key(fd, 'f'); drain(fd, .8); key(fd, 't')
    assert 'No tasks match' in frame(root, 'navigation-deleted-list')
    assert creation['state'](root)['currentList'] == 'Empty list'


def main():
    with tempfile.TemporaryDirectory(prefix='task-navigation-') as root:
        pid, fd = start(root)
        try:
            tabs(fd, root)
            creation['smoke']['stop'](pid, fd)
            pid, fd = start(root); creation['startup'](fd, root)
            text = frame(root, 'navigation-restarted')
            assert 'Work' in text.splitlines()[0] and 'Pending' in text.splitlines()[1]
            key(fd, '\x1b'); text = frame(root, 'navigation-escape-keeps-filters')
            assert 'Work' in text.splitlines()[0] and 'Pending' in text.splitlines()[1]
            clear_and_refresh(fd, root)
            creation['smoke']['stop'](pid, fd)
        except BaseException:
            os.kill(pid, signal.SIGKILL); os.waitpid(pid, 0); os.close(fd)
            raise
    print('Navigation PTY passed: immediate filter save, restart, Escape retention, tab/workspace return, draft cancel, search clear, refresh invalidation.')


if __name__ == '__main__':
    main()
