"""Native Task List creation and task controls through terminal keys; isolated data only."""
import runpy
import tempfile

creation = runpy.run_path('scripts/pty-creation-smoke.py')
key, drain = creation['key'], creation['drain']
DOWN, ESC = creation['DOWN'], creation['ESC']


def lists(fd, root):
    output = key(fd, 'g')
    assert b'Create Task List' in output.replace(b'\x1b[1C', b' ')
    key(fd, '\r'); key(fd, 'Created in UI\r'); drain(fd)
    assert 'Created in UI' in creation['state'](root)['byList']
    key(fd, 'g'); key(fd, DOWN); key(fd, DOWN); key(fd, '\r')
    key(fd, 'Created in UI'); key(fd, '\r'); drain(fd)
    assert creation['state'](root)['currentList'] == 'Created in UI'
    key(fd, 'n'); drain(fd, 0.5); key(fd, '\r')
    key(fd, 'Control task\r'); key(fd, '\x13'); key(fd, DOWN); key(fd, '\r'); drain(fd)
    assert creation['state'](root)['byList']['Created in UI'][0]['title'] == 'Control task'


def toggle_completion(fd, root):
    key(fd, ESC); key(fd, '1'); key(fd, ' '); drain(fd)
    assert creation['state'](root)['byList']['Created in UI'][0]['completed']
    key(fd, ' '); drain(fd)
    assert not creation['state'](root)['byList']['Created in UI'][0]['completed']


def actions(fd, root):
    toggle_completion(fd, root)
    key(fd, 'v'); key(fd, '\r'); drain(fd)
    assert creation['state'](root)['byList']['Created in UI'][0]['completed']
    key(fd, 'v'); key(fd, '\r'); drain(fd)
    assert not creation['state'](root)['byList']['Created in UI'][0]['completed']
    key(fd, 'v'); key(fd, DOWN); key(fd, '\r'); key(fd, '\r'); key(fd, 'UI step\r'); drain(fd)
    assert creation['state'](root)['byList']['Created in UI'][0]['subtasks'][0]['title'] == 'UI step'
    subtask_changes(fd, root)
    key(fd, 'v'); key(fd, DOWN); key(fd, DOWN); key(fd, '\r'); drain(fd)
    assert len(creation['state'](root)['byList']['today']) == 2
    key(fd, 'v')
    for _ in range(4):
        key(fd, DOWN)
    key(fd, '\r'); key(fd, ESC)
    assert creation['task_count'](root) == 2
    key(fd, 'v')
    for _ in range(4):
        key(fd, DOWN)
    key(fd, '\r'); key(fd, DOWN); key(fd, '\r'); drain(fd)
    assert creation['task_count'](root) == 1
    assert len(creation['state'](root)['byList']['today']) == 1


def subtask_changes(fd, root):
    key(fd, 'v'); key(fd, DOWN); key(fd, '\r'); key(fd, DOWN); key(fd, '\r')
    key(fd, DOWN); key(fd, '\r'); key(fd, '\x15Renamed step\r'); drain(fd)
    task = creation['state'](root)['byList']['Created in UI'][0]
    assert task['subtasks'][0]['title'] == 'Renamed step'
    key(fd, 'v'); key(fd, DOWN); key(fd, '\r'); key(fd, DOWN); key(fd, '\r'); key(fd, '\r')
    assert creation['state'](root)['byList']['Created in UI'][0]['subtasks'][0]['completed']
    key(fd, 'v'); key(fd, DOWN); key(fd, '\r'); key(fd, DOWN); key(fd, '\r')
    key(fd, DOWN); key(fd, DOWN); key(fd, '\r'); key(fd, ESC)
    assert len(creation['state'](root)['byList']['Created in UI'][0]['subtasks']) == 1
    key(fd, 'v'); key(fd, DOWN); key(fd, '\r'); key(fd, DOWN); key(fd, '\r')
    key(fd, DOWN); key(fd, DOWN); key(fd, '\r'); key(fd, DOWN); key(fd, '\r')
    assert creation['state'](root)['byList']['Created in UI'][0]['subtasks'] == []


def main():
    with tempfile.TemporaryDirectory(prefix='task-shark-controls-') as root:
        pid, fd = creation['start'](root)
        try:
            creation['startup'](fd, root)
            lists(fd, root)
            actions(fd, root)
            creation['no_conversations'](root)
            creation['smoke']['stop'](pid, fd)
        except BaseException:
            creation['review']['cleanup'](pid, root)
            raise
    print('Task controls PTY passed: UI list creation/activation, task creation, complete/reopen, subtask add, Today, cancel/confirm deletion.')


if __name__ == '__main__':
    main()
