"""Empty inline draft checks; fake tasks/Pi only, isolated HOME."""
import runpy
import tempfile
from pathlib import Path

creation = runpy.run_path('scripts/pty-creation-smoke.py')
smoke = creation['smoke']
key, drain = smoke['key'], smoke['drain']


def empty_and_cancel(fd, root):
    output = key(fd, 'g').replace(b'\x1b[1C', b' ')
    assert b'New Conversation' in output and b'unsaved' in output
    assert b'First message' not in output and b'Pi model' not in output
    key(fd, '   \x13')
    creation['no_conversations'](root)
    key(fd, '\x15')
    key(fd, 'nctgrq/m iaxf')  # Navigation letters are plain input.
    creation['no_conversations'](root)
    key(fd, '\x0f'); key(fd, 'Discarded settings'); key(fd, '\x1b')
    creation['no_conversations'](root)
    key(fd, '\x1b')
    creation['no_conversations'](root)


def first_send(fd, root):
    key(fd, 'n')
    message = 'nctgrq/m iaxf\nSecond line'
    key(fd, message.replace('\n', '\r'))
    key(fd, '\x0f')
    key(fd, 'Optional draft title\r')
    key(fd, 'fixture/model\r')
    key(fd, '\x17')  # Ctrl-W: searchable workspace picker.
    key(fd, 'Enter a directory'); key(fd, '\r')
    key(fd, root + '\r')
    smoke['resize'](fd, 60, 20); drain(fd)
    creation['no_conversations'](root)
    key(fd, '\x13')
    smoke['wait_state'](fd, root, lambda rows: len(rows) == 1 and rows[0]['status'] == 'Needs Input')
    row = smoke['conversations'](root)[0]
    assert row['title'] == 'Optional draft title' and row['workspace'] == root
    assert row['model'] == 'fixture/model' and 'task' not in row
    assert any(m['text'] == message for m in row['messages']), row['messages']
    key(fd, 'i'); key(fd, '\r'); drain(fd, 1.5)
    key(fd, 'g'); key(fd, '\x13')  # Saved transcript must not leak into a fresh draft.
    assert len(smoke['conversations'](root)) == 1
    key(fd, '\x1b')


def task_and_workspace(fd, root):
    key(fd, 'g'); key(fd, 'Linked draft text')
    key(fd, '\x14')  # Ctrl-T selects from automatically loaded tasks.
    key(fd, 'Work'); key(fd, '\r')
    key(fd, '\x17'); key(fd, root); key(fd, '\r')
    assert len(smoke['conversations'](root)) == 1  # Choosing does not save.
    key(fd, '\x13')
    smoke['wait_state'](fd, root, lambda rows: len(rows) == 2 and rows[0]['status'] == 'Needs Input')
    row = smoke['conversations'](root)[0]
    assert row['task']['ownerList'] == 'Work' and row['workspace'] == root
    assert any(m['text'] == 'Linked draft text' for m in row['messages'])
    key(fd, 'i'); key(fd, '\r'); drain(fd, 1.5)


def main():
    with tempfile.TemporaryDirectory(prefix='task-shark-draft-') as root:
        pid, fd = creation['start'](root)
        try:
            drain(fd, 1)
            empty_and_cancel(fd, root)
            first_send(fd, root)
            task_and_workspace(fd, root)
            smoke['stop'](pid, fd)
        except BaseException:
            creation['review']['cleanup'](pid, root)
            raise
    print('Draft PTY passed: empty inline creation, typing, blank send, cancel, optional settings, resize, exact first message, task search and workspace selection.')


if __name__ == '__main__':
    main()
