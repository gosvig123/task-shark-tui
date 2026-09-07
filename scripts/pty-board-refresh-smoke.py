"""Board tool completion refresh through the real View, no Pi/helper/model or real data."""
import os
import pty
import re
import runpy
import signal
import tempfile
from pathlib import Path

smoke = runpy.run_path('scripts/pty-smoke.py')
key, drain, resize = smoke['key'], smoke['drain'], smoke['resize']


def frame(root):
    return re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', Path(root, 'frame.txt').read_text())


def start(root):
    pid, fd = pty.fork()
    if pid == 0:
        os.environ.update(HOME=root, TERM='xterm-256color', TASKSHARK_BOARD_ROOT=root + '/board',
                          TASKSHARK_MCP_RESOURCE_DIR=root + '/absent-helper')
        os.execvp('node', ['node', '--import', 'tsx', 'tests/fixtures/board-refresh-app.ts'])
    resize(fd, 100, 30)
    return pid, fd


def exercise(fd, root):
    drain(fd, 1); key(fd, '2'); key(fd, '\x1b[B')
    assert 'Original entry' in frame(root) and 'Update #1' in frame(root)
    key(fd, 'z')
    assert 'Loading shared updates' in frame(root)
    key(fd, '1'); key(fd, '\x1b[B'); key(fd, '2')
    assert 'Prepare release notes' in frame(root) and 'No Board Updates' in frame(root)
    key(fd, 'v'); drain(fd, .5)
    assert 'No Board Updates' in frame(root) and 'Agent posted progress' not in frame(root)
    key(fd, '1'); key(fd, '\x1b[A'); key(fd, '2')
    text = frame(root)
    assert '2 unread' in text and 'Update #1' in text and 'Original entry' in text
    assert '#2 Progress' in text and 'Agent posted progress' not in text
    key(fd, '\x1b[B')
    assert 'Agent posted progress' in frame(root) and '2 unread' in frame(root)
    assert not Path(root, 'board').exists()


def main():
    with tempfile.TemporaryDirectory(prefix='board-refresh-pty-') as root:
        pid, fd = start(root)
        try:
            exercise(fd, root)
            os.kill(pid, signal.SIGTERM); drain(fd, .5); os.waitpid(pid, 0); os.close(fd)
        except BaseException:
            os.kill(pid, signal.SIGKILL); os.waitpid(pid, 0); os.close(fd)
            raise
    print('Board refresh PTY passed: successful post refresh, no auto-review, task-switch race, selection retained.')


if __name__ == '__main__':
    main()
