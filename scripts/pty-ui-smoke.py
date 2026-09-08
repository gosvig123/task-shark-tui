"""Launch outside the checkout; exercise inline search and resize in demo mode."""
import os
from pathlib import Path
import pty
import runpy
import signal
import tempfile

smoke = runpy.run_path("scripts/pty-smoke.py")
key, drain, resize = (smoke[name] for name in ("key", "drain", "resize"))
launcher = str(Path("bin/task-shark").resolve())


def start(root):
    pid, fd = pty.fork()
    if pid == 0:
        os.chdir(root)
        os.environ.update(HOME=root, TERM="xterm-256color", TASK_SHARK_DATA_DIR=root)
        os.execv(launcher, [launcher, "--demo"])
    resize(fd, 100, 32)
    return pid, fd


def check(fd, root):
    output = drain(fd, 3)
    assert b"OFFLINE DEMO" in output, output[-1000:]
    smoke["create"](fd, True, "Inline fixture")
    smoke["wait_state"](fd, root, lambda rows: rows and rows[0]["status"] == "Needs Input")
    key(fd, "m"); key(fd, "\r"); drain(fd, 1.5)
    key(fd, "/"); output = key(fd, "no-match")
    assert b"blank clears filter" not in output
    resize(fd, 60, 20); drain(fd, .5)
    key(fd, "\x15"); key(fd, "Inline"); key(fd, "\x1b"); drain(fd, .3)
    key(fd, "\x1b"); key(fd, "n"); resize(fd, 40, 16); drain(fd, .5)
    key(fd, "draft survives resize"); resize(fd, 100, 32); drain(fd, .5)
    key(fd, "\x1b"); key(fd, "t"); resize(fd, 60, 20); drain(fd, .5)
    key(fd, "e"); resize(fd, 80, 24); drain(fd, .5); key(fd, "\x1b")


with tempfile.TemporaryDirectory(prefix="task-shark-ui-") as root:
    pid, fd = start(root)
    try:
        check(fd, root)
        smoke["stop"](pid, fd)
    except BaseException:
        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        raise
print("PTY passed: launcher from another directory, Message request, inline search, draft and editor resize.")
