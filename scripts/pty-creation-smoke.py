"""Creation and automatic loading checks with isolated task/Pi binaries; never real service writes."""
import json
import os
from pathlib import Path
import pty
import runpy
import shutil
import tempfile

smoke = runpy.run_path("scripts/pty-smoke.py")
review = runpy.run_path("scripts/pty-review-smoke.py")
key, drain, resize = (smoke[name] for name in ("key", "drain", "resize"))
ESC, DOWN = "\x1b", "\x1b[B"


def fixture(root):
    Path(root, 'helper').mkdir(exist_ok=True)
    for name in ('cli.mjs', 'store.mjs', 'storage.mjs'):
        shutil.copyfile('tests/fixtures/fake-board-cli.mjs', Path(root, 'helper', name))
    tasks = Path(root, "tasks.mjs")
    shutil.copyfile("tests/fixtures/fake-tasks.mjs", tasks)
    tasks.chmod(0o700)
    original = json.loads(Path("tests/fixtures/tasks.json").read_text())["tasks"]
    Path(root, "state.json").write_text(json.dumps({"revision": 1, "currentList": "Empty list",
        "byList": {"Work": [original[0]], "today": [original[1]], "Empty list": []}}))
    pi = Path(root, "pi")
    pi.write_text("#!/usr/bin/env node\nrequire('node:fs').writeFileSync(__dirname+'/pi-pid',String(process.pid));" +
        "import(" + json.dumps(str(Path("tests/fixtures/fake-pi.mjs").resolve())) + ");")
    pi.chmod(0o700)
    return tasks, pi


def start(root):
    tasks, pi = fixture(root)
    pid, fd = pty.fork()
    if pid == 0:
        os.environ.update(HOME=root, TERM="xterm-256color", TASK_SHARK_DATA_DIR=root + "/demo",
                          TASK_SHARK_TASKS=str(tasks), TASK_SHARK_PI=str(pi), TASKSHARK_BOARD_ROOT=root + '/board',
                          TASKSHARK_MCP_RESOURCE_DIR=root + '/helper')
        os.execvp("node", ["node", "--import", "tsx", "src/main.ts"])
    resize(fd, 100, 32)
    return pid, fd


def calls(root):
    file = Path(root, "calls.jsonl")
    return [json.loads(line) for line in file.read_text().splitlines()] if file.exists() else []


def no_conversations(root):
    assert smoke["conversations"](root) == []
    for name in ("workspaces", "sessions"):
        assert not Path(root, "demo", name).exists(), name
    assert not Path(root, "pi-pid").exists()


def startup(fd, root):
    output = drain(fd, 1)
    for _ in range(30):
        if any(c['args'][1] == 'snapshot' for c in calls(root)):
            break
        output += drain(fd, .1)
    assert b"Load existing Task Lists?" not in output
    assert calls(root)[0]["args"] == ["api", "lists"]
    assert any(c["args"][1] == "snapshot" for c in calls(root))
    assert all(c["args"][1] != "exec" for c in calls(root))
    key(fd, "t")


def task_cancellations(fd, root):
    for steps in ([], ["\r"], ["\r", "Cancelled title\r"], ["\r", "Cancelled title\r", "Notes\x13"]):
        output = key(fd, "n") + drain(fd, 0.5)
        assert b"New Task" in output.replace(b"\x1b[1C", b" ")
        for step in steps:
            key(fd, step)
        key(fd, ESC)
        no_conversations(root)
        assert all(c["args"][1] != "exec" for c in calls(root))
    key(fd, "n"); drain(fd, 0.5); key(fd, "\r"); key(fd, "   \r")
    assert all(c["args"][1] != "exec" for c in calls(root))
    no_conversations(root)


def conversation_cancellations(fd, root):
    key(fd, "c")
    for text in ("", "nctgrq/m iaxf", "line one\rline two"):
        output = key(fd, "n").replace(b"\x1b[1C", b" ")
        assert b"New Conversation" in output
        assert b"First message" not in output and b"New Conversation \xc2\xb7 title" not in output
        key(fd, text)
        no_conversations(root)
        key(fd, ESC)
        no_conversations(root)
    key(fd, "n"); key(fd, "  \x13")
    no_conversations(root)
    key(fd, ESC)


def create_task(fd, root):
    key(fd, "t"); key(fd, "n"); drain(fd, 0.5)
    key(fd, "\r"); key(fd, "Created from n\r"); key(fd, "Optional notes\x13")
    assert all(c["args"][1] != "exec" for c in calls(root))
    key(fd, DOWN); key(fd, "\r"); drain(fd, 1)
    mutations = [c for c in calls(root) if c["args"][1] == "exec"]
    assert len(mutations) == 1
    request = mutations[0]["input"]
    assert request["list"] == "Empty list" and request["expectedRevision"] == "revision-1"
    assert request["changes"]["completed"] is False
    state = json.loads(Path(root, "state.json").read_text())
    assert state["byList"]["Empty list"][0]["title"] == "Created from n"
    assert state["currentList"] == "Empty list"
    no_conversations(root)


def create_conversations(fd, root):
    key(fd, "3")  # Conversations section creates a Task-backed Conversation.
    smoke["create"](fd)
    smoke["wait_state"](fd, root, lambda rows: len(rows) == 1 and rows[0]["status"] == "Needs Input")
    c = smoke["conversations"](root)[0]
    assert c["task"]["ownerList"] == "Empty list" and c["task"]["title"] == "Created from n"
    key(fd, "i"); key(fd, "\r"); drain(fd, 1.5)
    key(fd, "c")  # Global Conversations: n must be general, even with task-backed row selected.
    smoke["create"](fd, title="General via n")
    smoke["wait_state"](fd, root, lambda rows: len(rows) == 2 and rows[0]["status"] == "Needs Input")
    assert "task" not in smoke["conversations"](root)[0]
    key(fd, "i"); key(fd, "\r"); drain(fd, 1.5)


def list_filter(fd, root):
    key(fd, "t"); key(fd, "1"); key(fd, "l"); drain(fd, 0.5)
    key(fd, DOWN); output = key(fd, "\r")
    assert b"Fix calendar" in output and b"sync" in output
    key(fd, "n"); output = drain(fd, 0.5)
    key(fd, "\r"); key(fd, "Work draft\r"); key(fd, "\x13")
    output += drain(fd)
    key(fd, ESC)
    assert len([c for c in calls(root) if c["args"][1] == "exec"]) == 1
    assert json.loads(Path(root, "state.json").read_text())["currentList"] == "Empty list"


def main():
    with tempfile.TemporaryDirectory(prefix="task-shark-creation-") as root:
        pid, fd = start(root)
        try:
            startup(fd, root)
            task_cancellations(fd, root)
            conversation_cancellations(fd, root)
            create_task(fd, root)
            create_conversations(fd, root)
            list_filter(fd, root)
            smoke["stop"](pid, fd)
        except BaseException:
            review["cleanup"](pid, root)
            raise
    print("Creation PTY passed: automatic startup loading, empty/active lists, every draft cancellation, blank submissions, n task/task-backed/general success, source filter.")


if __name__ == "__main__":
    main()
