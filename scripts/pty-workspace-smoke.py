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
        os.environ.update(HOME=root, TERM='xterm-256color', TASK_SHARK_DATA_DIR=root,
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
    key(fd, '2'); key(fd, 'n'); key(fd, '\x1b[B\r'); key(fd, 'Progress body\x13'); drain(fd, .5)
    aggregate(fd, root, '100')
    resize(fd, 70, 24); drain(fd, .5)
    aggregate(fd, root, '70')
    text = frame(root, '70-board')
    assert all(label in text for label in ['1 Tasks', '2 Board Updates', '3 Conversations', 'Readable'])
    assert all(len(line) <= 70 for line in text.splitlines())
    assert '2 Board Updates' in text.splitlines()[11] and '3 Conversations' in text.splitlines()[16]


def aggregate(fd, root, size):
    key(fd, '2')
    text = frame(root, size + '-aggregate')
    assert 'All progress' in text and 'Readable' in text
    left = '\n'.join(line[:28 if size == '70' else 40] for line in text.splitlines())
    assert '#1 Note' in left and '#2 Progress' in left and 'Readable' not in left
    key(fd, '\x1b[B')
    text = frame(root, size + '-individual-note')
    assert 'Readable' in text and 'Progress body' not in text
    key(fd, '\x1b[B')
    text = frame(root, size + '-individual-progress')
    assert 'Progress body' in text and 'Readable' not in text
    key(fd, '\x1b[A'); key(fd, '\x1b[A')
    assert 'All progress · 2 loaded' in frame(root, size + '-aggregate-return')
    key(fd, '\r'); key(fd, '\x1b[F')
    assert 'Progress body' in frame(root, size + '-aggregate-bottom')
    key(fd, '\x1b'); key(fd, '2')


def conversation(fd, root):
    key(fd, '3'); key(fd, 'n')
    draft = frame(root, '70-inline-draft')
    assert all(label in draft for label in ['1 Tasks', '2 Board Updates', '3 Conversations', 'New Conversation'])
    key(fd, 'inspect 123nmi\x13')
    smoke['wait_state'](fd, root, lambda rows: rows and rows[0]['status'] == 'Needs Input')
    assert any(m['text'] == 'inspect 123nmi' for m in smoke['conversations'](root)[0]['messages'])
    key(fd, 'm'); key(fd, '\r'); drain(fd, 1.5)
    key(fd, '2'); assert 'Readable' in frame(root, 'back-to-board')
    key(fd, '3'); assert 'Demo complete' in frame(root, '70-conversation')
    assert smoke['conversations'](root)[0]['status'] == 'For Review'
    key(fd, '\r'); assert 'Open' in frame(root, '70-open-conversation')
    assert smoke['conversations'](root)[0]['status'] == 'Finished'
    key(fd, '\x1b'); assert 'Preview' in frame(root, '70-left-focus')
    existing_message(fd, root)


def existing_message(fd, root):
    key(fd, '\r')
    count = len(smoke['conversations'](root)[0]['messages'])
    key(fd, 'm'); key(fd, 'cancel this')
    text = frame(root, 'inline-existing')
    assert 'Demo complete' in text and 'Message' in text
    assert next(line for line in text.splitlines() if 'Message' in line).index('Message') > 28
    resize(fd, 100, 32); drain(fd, .5)
    text = frame(root, 'inline-existing-resize')
    assert 'Demo complete' in text and 'cancel this' in text
    key(fd, '\x1b')
    assert len(smoke['conversations'](root)[0]['messages']) == count
    key(fd, 'm'); key(fd, 'Follow up\rSecond line\x13')
    smoke['wait_state'](fd, root, lambda rows: any(m['text'] == 'Follow up\nSecond line' for m in rows[0]['messages']))
    smoke['wait_state'](fd, root, lambda rows: rows[0]['status'] == 'Needs Input')
    key(fd, 'm'); key(fd, '\r'); drain(fd, 1.5)
    resize(fd, 70, 24); drain(fd, .5)


def exercise(fd, root):
    drain(fd, 1); key(fd, 't')
    assert 'Tasks' in frame(root, 'list')
    text = frame(root, '100-details')
    assert 'Task Workspace' in text and 'Task List: Task Shark Demo' in text
    assert '2 Board Updates' in text.splitlines()[14] and '3 Conversations' in text.splitlines()[20]
    assert all(label in text for label in ['1 Tasks', '2 Board Updates', '3 Conversations', 'Preview'])
    key(fd, '3'); assert 'No conversations for this task' in frame(root, 'empty-conversations')
    board(fd, root)
    conversation(fd, root)
    key(fd, '\x1b'); text = frame(root, 'restored-list')
    assert 'Task Workspace' in text and '1 Tasks' in text
    key(fd, '\r'); key(fd, '2'); assert 'Readable' in frame(root, 'reopened-board')
    key(fd, '1'); key(fd, '\x1b[B'); key(fd, '2')
    assert 'No Board Updates' in frame(root, 'other-task')


def inline_search(fd, root):
    key(fd, '1'); key(fd, '/')
    key(fd, 'qntgr123')
    assert 'No tasks match' in frame(root, 'search-shortcut-text')
    key(fd, '\x15'); key(fd, 'Fix calXendar')
    key(fd, '\x01' + '\x1b[C' * 7 + '\x1b[3~')
    assert 'Fix calendar sync' in frame(root, 'search-cursor-delete')
    raw = Path(root, 'frame.txt').read_text()
    Path('/tmp/task-selector-search-cursor.ansi').write_text(raw)
    assert '/ Fix cal\x1b[7me' in raw
    key(fd, '\x05!\x7f'); key(fd, '\x1b')
    text = frame(root, 'search-kept-on-escape')
    assert '/ Fix calendar' in text and 'Fix calendar sync' in text
    key(fd, 'c'); key(fd, 't')
    assert '/ Fix calendar' in frame(root, 'search-tab-memory')
    key(fd, '/'); key(fd, '\x15'); key(fd, '\x1b')
    assert 'Fix calendar sync' in frame(root, 'search-cleared')


def main():
    with tempfile.TemporaryDirectory(prefix='task-workspace-') as root:
        pid, fd = start(root)
        try:
            exercise(fd, root); inline_search(fd, root)
            smoke['stop'](pid, fd)
        except BaseException:
            os.kill(pid, signal.SIGKILL); os.waitpid(pid, 0); os.close(fd)
            raise
    print('Workspace PTY passed: stacked sections, preview/open focus and review, Board post, task isolation, conversations and resize.')
    print('Captured frames: /tmp/task-workspace-*.txt')


if __name__ == '__main__':
    main()
