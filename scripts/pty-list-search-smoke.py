"""Source-list search uses only isolated fake tasks and Pi binaries."""
import json
from pathlib import Path
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
    key(fd, 'Worx'); key(fd, '\x7f')
    key(fd, '\r')
    key(fd, 'Cancelled searched task\r')
    output = key(fd, '\x13')
    assert b'Work' in output
    key(fd, ESC)
    key(fd, 'n'); drain(fd, 0.5); key(fd, 'zzzz'); key(fd, ESC)
    assert all(c['args'][1] != 'exec' for c in creation['calls'](root))
    creation['no_conversations'](root)


def search_create(fd, root):
    key(fd, 'n'); drain(fd, 0.5)
    key(fd, 'WORK'); key(fd, DOWN); key(fd, '\r')
    key(fd, 'Search-selected task\r'); key(fd, '\x13')
    key(fd, DOWN); key(fd, '\r'); drain(fd, 1)
    mutations = [c for c in creation['calls'](root) if c['args'][1] == 'exec']
    assert len(mutations) == 1
    assert mutations[0]['input']['list'] == 'Work'
    state = json.loads(Path(root, 'state.json').read_text())
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
