"""Targeted review checks using the actual app, offline fixtures and isolated storage."""
import json
import os
from pathlib import Path
import pty
import runpy
import signal
import tempfile

smoke = runpy.run_path("scripts/pty-smoke.py")
key, drain, resize = (smoke[name] for name in ("key", "drain", "resize"))
wait_state, stop = (smoke[name] for name in ("wait_state", "stop"))


def approval(fd, columns, rows):
    resize(fd, columns, rows)
    key(fd, "m")
    key(fd, "long approval\x13")
    drain(fd, 1)
    output = key(fd, "i")
    assert b"Approval" in output and b"detail 1:" in output, output[-1000:]
    output = key(fd, "\x1b[F")
    assert b"80" in output, output[-1000:]  # Blessed sends only changed cells after scrolling.
    key(fd, "\r")
    drain(fd, 1.5)


def long_approvals(root):
    pid, fd = smoke["start"](root)
    try:
        drain(fd, 1)
        smoke["create"](fd, True, "Unicode fixture 世界")
        wait_state(fd, root, lambda rows: rows and rows[0]["status"] == "Needs Input")
        key(fd, "i"); key(fd, "\r"); drain(fd, 1.5)
        approval(fd, 100, 32)
        approval(fd, 60, 20)
        assert smoke["conversations"](root)[0]["title"] == "Unicode fixture 世界"
        stop(pid, fd)
    except BaseException:
        cleanup(pid, root)
        raise


def fixture_binaries(root):
    lists = Path(root, "lists"); lists.mkdir()
    (lists / "Work.md").write_text("Not parsed")
    tasks = Path(root, "tasks")
    tasks.write_text("#!/usr/bin/env node\n" +
                     "require('node:fs').appendFileSync(__dirname+'/task-calls','call\\n');" +
                     "setTimeout(()=>console.log(JSON.stringify({schemaVersion:1,revision:'fixture',currentList:'Work',lists:['Work'],tasks:[]})),14000);")
    pi = Path(root, "pi")
    pi.write_text("#!/usr/bin/env node\nrequire('node:fs').writeFileSync(__dirname+'/pi-pid',String(process.pid));" +
                  "import(" + json.dumps(str(Path("tests/fixtures/fake-pi.mjs").resolve())) + ");")
    tasks.chmod(0o700); pi.chmod(0o700)
    return {"TASK_SHARK_TASKS": str(tasks), "TASK_SHARK_PI": str(pi), "TASK_SHARK_LISTS_DIR": str(lists)}


def start_live(root):
    environment = fixture_binaries(root)
    pid, fd = pty.fork()
    if pid == 0:
        os.environ.update(environment, TERM="xterm-256color", TASK_SHARK_DATA_DIR=root + "/demo",
                          TASKSHARK_BOARD_ROOT=root + '/board')
        os.execvp("node", ["node", "--import", "tsx", "src/main.ts", "--allow-task-reset"])
    resize(fd, 100, 32)
    return pid, fd


def slow_refresh(root):
    pid, fd = start_live(root)
    try:
        drain(fd, 1)
        key(fd, "f")
        output = key(fd, "t")
        assert b"Tasks" in output
        key(fd, "c")
        smoke["create"](fd, True, "Slow refresh fixture")
        wait_state(fd, root, lambda rows: rows and rows[0]["status"] == "Needs Input")
        key(fd, "i"); key(fd, "\r")
        wait_state(fd, root, lambda rows: rows[0]["status"] == "For Review")
        key(fd, "m"); key(fd, "inspect\x13")
        wait_state(fd, root, lambda rows: rows[0]["status"] == "Needs Input")
        key(fd, "x"); key(fd, "\x1b[B"); key(fd, "\r")
        wait_state(fd, root, lambda rows: "stopped" in rows[0].get("error", ""))
        assert Path(root, "task-calls").read_text() == "call\n"
        stop(pid, fd)
    except BaseException:
        cleanup(pid, root)
        raise


def cleanup(pid, root):
    child = Path(root, "pi-pid")
    if child.exists():
        try:
            os.killpg(int(child.read_text()), signal.SIGKILL)
        except ProcessLookupError:
            pass
    try:
        os.kill(pid, signal.SIGKILL)
        os.waitpid(pid, 0)
    except ProcessLookupError:
        pass


def signal_shutdown(root, exit_signal):
    pid, fd = start_live(root)
    try:
        drain(fd, 1)
        smoke["create"](fd, True, "Signal fixture")
        wait_state(fd, root, lambda rows: rows and rows[0]["status"] == "Needs Input")
        child = int(Path(root, "pi-pid").read_text())
        os.kill(pid, exit_signal)
        for _ in range(80):
            result, status = os.waitpid(pid, os.WNOHANG)
            if result:
                assert os.waitstatus_to_exitcode(status) == 0
                assert not Path(root, "demo", "app.lock").exists()
                try:
                    os.kill(child, 0)
                    raise AssertionError("Pi process survived shutdown")
                except ProcessLookupError:
                    break
            drain(fd, 0.05)
        else:
            raise AssertionError("Signal shutdown timed out")
        os.close(fd)
    except BaseException:
        cleanup(pid, root)
        raise


def main():
    with tempfile.TemporaryDirectory(prefix="task-shark-approval-") as root:
        long_approvals(root)
    with tempfile.TemporaryDirectory(prefix="task-shark-refresh-") as root:
        slow_refresh(root)
    for exit_signal in (signal.SIGTERM, signal.SIGHUP, signal.SIGINT):
        with tempfile.TemporaryDirectory(prefix="task-shark-signal-") as root:
            signal_shutdown(root, exit_signal)
    print("Review PTY passed: long approvals at 100x32/60x20, Unicode title, slow-refresh navigation/input/stop/quit, single load guard, TERM/HUP/INT cleanup.")


if __name__ == "__main__":
    main()
