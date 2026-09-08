"""Exercise the real terminal interface with offline data, never Pi or external tasks."""
import errno
import fcntl
import json
import os
import pty
import select
import signal
import struct
import tempfile
import termios
import time


def start(root):
    pid, fd = pty.fork()
    if pid == 0:
        os.environ.update(HOME=root, TERM="xterm-256color", TASK_SHARK_DATA_DIR=root)
        os.execvp("node", ["node", "--import", "tsx", "src/main.ts", "--demo"])
    resize(fd, 100, 32)
    return pid, fd


def resize(fd, columns, rows):
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, columns, 0, 0))


def drain(fd, duration=0.2):
    result = b""
    until = time.monotonic() + duration
    while time.monotonic() < until:
        if not select.select([fd], [], [], 0.05)[0]:
            continue
        try:
            result += os.read(fd, 65536)
        except OSError as error:
            if error.errno == errno.EIO:
                break
            raise
    return result


def key(fd, value):
    os.write(fd, value.encode())
    return drain(fd)


def conversations(root):
    path = os.path.join(root, "demo", "conversations.json")
    if not os.path.exists(path):
        return []
    with open(path) as file:
        return json.load(file)["conversations"]


def wait_state(fd, root, predicate):
    for _ in range(80):
        drain(fd, 0.1)
        if predicate(conversations(root)):
            return
    raise AssertionError("State timeout: " + repr(conversations(root)))


def create(fd, general=False, title=""):
    if general:
        key(fd, "c")
    key(fd, "n")
    if title:
        key(fd, "\x0f")
        key(fd, title + "\r")
        key(fd, "\r")
    key(fd, "inspect\x13")


def stop(pid, fd):
    key(fd, "q")
    for _ in range(40):
        result, status = os.waitpid(pid, os.WNOHANG)
        if result:
            assert os.waitstatus_to_exitcode(status) == 0
            os.close(fd)
            return
        drain(fd, 0.05)
    os.kill(pid, signal.SIGKILL)
    os.waitpid(pid, 0)
    os.close(fd)
    raise AssertionError("App failed to quit")


def exercise(root, pid, fd):
    output = drain(fd, 1)
    assert b"TASK SHARK" in output, output[-1000:]
    output += key(fd, "t")
    assert b"2026-09-10" in output and b"Fix calendar" in output
    key(fd, "\r")
    key(fd, "2"); create(fd)
    wait_state(fd, root, lambda rows: rows and rows[0]["status"] == "Needs Input")
    create(fd, True, "General fixture")
    wait_state(fd, root, lambda rows: len(rows) == 2 and all(c["status"] == "Needs Input" for c in rows))
    key(fd, "m")
    key(fd, "\r")
    wait_state(fd, root, lambda rows: rows[0]["status"] == "For Review")
    key(fd, "a")
    key(fd, "\x1b[A"); key(fd, "\x1b[A")
    key(fd, "m")
    key(fd, "\r")
    resize(fd, 60, 20)
    wait_state(fd, root, lambda rows: any(c["status"] == "For Review" for c in rows))
    resize(fd, 100, 32)
    key(fd, "a")
    assert all(c["status"] == "Finished" for c in conversations(root))
    assert any(c.get("task", {}).get("id") == "calendar" for c in conversations(root))
    stop(pid, fd)


def main():
    with tempfile.TemporaryDirectory(prefix="task-shark-pty-") as root:
        pid, fd = start(root)
        try:
            exercise(root, pid, fd)
            pid, fd = start(root)
            drain(fd, 1)
            assert len(conversations(root)) == 2
            stop(pid, fd)
        except BaseException:
            try:
                os.kill(pid, signal.SIGKILL)
                os.waitpid(pid, 0)
            except ProcessLookupError:
                pass
            raise
    print("PTY passed: task details, task/general creation, concurrent requests, approval, streaming, review, resize, restart, quit.")


if __name__ == "__main__":
    main()
