"""Read and mutate only temporary SQLite task stores in PTY tests."""
import json
import sqlite3
from pathlib import Path


def sql(root, statement, parameters=()):
    with sqlite3.connect(Path(root, 'demo', 'tasks.sqlite')) as db:
        db.execute('PRAGMA foreign_keys = ON')
        return db.execute(statement, parameters).fetchall()


def state(root):
    lists = sql(root, 'SELECT name, active FROM task_lists ORDER BY name')
    tasks = [json.loads(row[0]) for row in sql(root, 'SELECT data FROM tasks ORDER BY rowid')]
    today = {row[0] for row in sql(root, 'SELECT task_id FROM today')}
    return {'currentList': next(name for name, active in lists if active),
            'byList': {**{name: [task for task in tasks if task['ownerList'] == name] for name, _ in lists},
                       'today': [task for task in tasks if task['id'] in today]}}


def update(root, task):
    sql(root, 'UPDATE tasks SET data = ? WHERE id = ?', (json.dumps(task), task['id']))
