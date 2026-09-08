"""Source-list search uses only local SQLite and isolated Pi."""
import runpy
import tempfile

creation = runpy.run_path('scripts/pty-creation-smoke.py')
key, drain = creation['key'], creation['drain']
ESC, DOWN = creation['ESC'], creation['DOWN']


def search_cancel(fd, root):
    key(fd, 'n'); drain(fd, 0.5)
    output = key(fd, 'zzzz')
    assert b'No matching choices' in output.replace(b'\x1b[1C', b' '), repr(output)
    key(fd, '\r')  # No match must not advance to title or select an old row.
    output = key(fd, '\x15')
    assert b'Empty list' in output
    output = key(fd, 'Worx') + key(fd, '\x7f')
    output += key(fd, '\r')
    output += key(fd, 'Cancelled searched task\r')
    output += key(fd, '\x13')
    assert b'Work' in output
    key(fd, ESC)
    key(fd, 'n'); drain(fd, 0.5); key(fd, 'zzzz'); key(fd, ESC)
    assert creation['task_count'](root) == 1
    creation['no_conversations'](root)


def search_create(fd, root):
    key(fd, 'n'); drain(fd, 0.5)
    key(fd, 'WORK'); key(fd, DOWN); key(fd, '\r')
    key(fd, 'Search-selected task\r'); key(fd, '\x13')
    key(fd, DOWN); key(fd, '\r'); drain(fd, 1)
    assert creation['task_count'](root) == 2
    state = creation['state'](root)
    assert state['byList']['Work'][-1]['title'] == 'Search-selected task'
    assert state['byList']['Empty list'] == []
    assert state['currentList'] == 'Empty list'
    creation['no_conversations'](root)


def main():
    with tempfile.TemporaryDirectory(prefix='task-shark-list-search-') as root:
        pid, fd = creation['start'](root)
        try:
            creation['startup'](fd, root)
            search_cancel(fd, root)
            search_create(fd, root)
            creation['smoke']['stop'](pid, fd)
        except BaseException:
            creation['review']['cleanup'](pid, root)
            raise
    print('List-search PTY passed: immediate typing, case folding, arrows, no matches, Backspace, Ctrl-U, cancellation, correct source mutation.')


if __name__ == '__main__':
    main()
