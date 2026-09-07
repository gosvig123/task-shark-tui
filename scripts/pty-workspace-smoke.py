"""Real workspace frames with demo-only tasks/Boards/Pi and temporary storage."""
import os
import pty
import re
import runpy
import signal
import tempfile
from pathlib import Path

smoke = runpy.run_path('scripts/pty-smoke.py')
key, drain, resize = smoke['key'], smoke['drain'], smoke['resize']


def start(root):
    pid, fd = pty.fork()
    if pid == 0:
        os.environ.update(TERM='xterm-256color', TASK_SHARK_DATA_DIR=root,
                          WORKSPACE_FRAME=root + '/frame.txt', TASKSHARK_BOARD_ROOT=root + '/board')
        os.execvp('node', ['node', '--require', './tests/fixtures/capture-workspace.cjs',
                          '--import', 'tsx', 'src/main.ts', '--demo'])
    resize(fd, 100, 30)
    return pid, fd


def frame(root, name):
    text = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', Path(root + '/frame.txt').read_text())
    Path('/tmp/task-workspace-' + name + '.txt').write_text(text)
    return text


def board(fd, root):
    key(fd, '2')
    assert 'No Board Updates' in frame(root, 'empty')
    key(fd, 'n'); key(fd, '\r')
    key(fd, 'Readable {red-fg}literal{/red-fg} update\rSecond line for review.\x13')
    drain(fd, .5)
    text = frame(root, '100-board')
    assert 'Readable {red-fg}literal{/red-fg}' in text and 'NEW' in text
    key(fd, 'a'); assert '1 unread' in frame(root, 'preview-not-reviewed')
    key(fd, '\r'); assert '1 unread' in frame(root, 'opened-not-reviewed')
    key(fd, 'a')
    assert '0 unread' in frame(root, 'reviewed')
    resize(fd, 70, 24); drain(fd, .5)
    text = frame(root, '70-board')
    assert all(label in text for label in ['1 Details', '2 Board Updates', '3 Conversations', 'Readable'])
    assert all(len(line) <= 70 for line in text.splitlines())


def conversation(fd, root):
    key(fd, '3'); key(fd, 'n')
    draft = frame(root, '70-inline-draft')
    assert all(label in draft for label in ['1 Details', '2 Board Updates', '3 Conversations', 'New Conversation'])
    key(fd, 'inspect 123nmi\x13')
    smoke['wait_state'](fd, root, lambda rows: rows and rows[0]['status'] == 'Needs Input')
    assert any(m['text'] == 'inspect 123nmi' for m in smoke['conversations'](root)[0]['messages'])
    key(fd, 'i'); key(fd, '\r'); drain(fd, 1.5)
    key(fd, '2'); assert 'Readable' in frame(root, 'back-to-board')
    key(fd, '3'); assert 'Demo complete' in frame(root, '70-conversation')
    assert smoke['conversations'](root)[0]['status'] == 'For Review'
    key(fd, '\r'); assert 'Open' in frame(root, '70-open-conversation')
    assert smoke['conversations'](root)[0]['status'] == 'Finished'
    key(fd, '\x1b'); assert 'Preview' in frame(root, '70-left-focus')


def exercise(fd, root):
    drain(fd, 1); key(fd, 't')
    assert 'Tasks' in frame(root, 'list')
    key(fd, '\r')
    text = frame(root, '100-details')
    assert 'Task Workspace' in text and 'Task List: Task Shark Demo' in text
    assert all(label in text for label in ['1 Details', '2 Board Updates', '3 Conversations', 'Preview'])
    key(fd, '3'); assert 'No conversations for this task' in frame(root, 'empty-conversations')
    board(fd, root)
    conversation(fd, root)
    key(fd, '\x1b'); text = frame(root, 'restored-list')
    assert '[t] Tasks' in text and '┐┌' in text.splitlines()[2]
    key(fd, '\r'); key(fd, '2'); assert 'Readable' in frame(root, 'reopened-board')
    key(fd, '\x1b'); key(fd, '\x1b[B'); key(fd, '\r'); key(fd, '2')
    assert 'No Board Updates' in frame(root, 'other-task')


def main():
    with tempfile.TemporaryDirectory(prefix='task-workspace-') as root:
        pid, fd = start(root)
        try:
            exercise(fd, root)
            smoke['stop'](pid, fd)
        except BaseException:
            os.kill(pid, signal.SIGKILL); os.waitpid(pid, 0); os.close(fd)
            raise
    print('Workspace PTY passed: stacked sections, preview/open focus and review, Board post, task isolation, conversations and resize.')
    print('Captured frames: /tmp/task-workspace-*.txt')


if __name__ == '__main__':
    main()
