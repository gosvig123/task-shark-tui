# Task Shark terminal app

A standalone terminal workbench for tasks and Pi conversations. Pi runs underneath
through its remote procedure call (RPC) protocol. This is not a Pi extension.

## Run

Requires Node.js 22 or later, npm, and a terminal. Use 100 columns × 30 rows when possible.

```sh
cd task-shark-tui
npm install
npm start
```

Live mode reads `tasks-go` snapshots and uses your installed Pi, credentials, model
settings, skills, and compatible extensions. Nothing is sent to a model until you
submit a message. Pi extension startup can have its own side effects.

**Pi tools run with your account permissions. This app is not a sandbox.** It displays
approval prompts when a Pi extension requests one; it does not add approval checks
to every tool. Model calls can cost money.

**Existing Task Lists load automatically at startup.** `tasks-go` lists and snapshots
can rewrite `today.md` and its daily reset state; the app permits those normal side effects.
Press `f` to refresh. Task creation still writes to your existing source list only
after you confirm **Create pending task**. The old `--allow-task-reset` app flag is no longer needed.

Try the offline version first:

```sh
npm run demo
```

Demo mode starts neither Pi nor tasks-go. It supplies fixture tasks, an empty list, and a simulated
agent. Send any message, press `i`, and answer the Pi Request to finish the response.
Include `input`, `select`, or `editor` in a demo message to try those request types.
Use `long approval` to try scrollable confirmation details. Demo task creation stays
in memory until quit; it never writes a task file.

## Work loop

1. Press `t` to browse your existing Tasks. `l` filters by
   Task List, including empty lists; **All Lists** deduplicates Today references.
2. In Tasks, `n` starts a task draft: source list, title, optional notes, confirmation.
   The default is the selected source list, or Active Task List in All Lists/Today.
   Confirmation saves a **Pending** task. Choosing a filter does not switch your
   Active Task List. No list is created or deleted.
3. Select a task and press `Enter` to open its Task Workspace. Details, Board Updates,
   and Conversations stay stacked on the left; one preview/interaction pane is on the right.
   Use `1`/`2`/`3` or arrows to highlight items without marking them reviewed.
   `Enter` opens the preview and focuses right; only conversations are acknowledged on open.
   `Escape` returns focus left, then restores the original task list and filters.
   Press `n` in Details or Conversations for a Task-backed Conversation. In the
   global Conversations tab, `n` opens an empty General Conversation draft.
   The transcript and inline composer start empty; type immediately. `Ctrl-O`
   opens optional title, Agent Workspace, and `provider/model` settings.
4. Write the first message. `Ctrl-S` saves the conversation and sends; `Enter` adds
   a line. Only then can a blank workspace create a private directory and Pi start.
   Escape in the inline composer discards the draft and returns to navigation.
   Escape in settings returns to the draft without changing settings. A blank
   first send keeps the empty draft open without a record, workspace, or Pi process. The task and workspace are fixed after saving.
5. Switch conversations while Pi works. Press `i` when one Needs Input.
6. Open completed work from the For Review Inbox with `Enter`, or mark it reviewed
   with `a`. Merely selecting a row does not acknowledge it.

Each Service Tab remembers its filters, search, highlighted item, and preview position
while the app runs. Each Task Workspace remembers its section and selected items;
reopening restores preview focus without marking work reviewed. Escape clears filters
only in the current Service Tab (inside a workspace it returns left, then back).
This navigation memory does not survive restarting the app or change the Active Task List.

Each task can have many conversations. `g` always creates a general conversation.
The first message is saved before delivery; failed delivery keeps it for manual
resubmission. No draft is saved before the first nonblank message.
Messages sent during a run become Queued Messages and are delivered in order after
that run settles, including retries. They do not interrupt a pending Pi Request.

## Controls

| Key | Action |
| --- | --- |
| `c`, `t`, `r` | Conversations, Tasks, For Review Inbox |
| `↑`, `↓`, `Enter` | Select and open |
| `1`, `2`, `3`, `↑`, `↓` in Task Workspace | Select left sections/items; arrows scroll when focused right |
| `Enter`, `Escape` in Task Workspace | Open preview/focus right; return left, then exit to task list |
| `n`, `a`, `f` in Board Updates | Post/retry, explicitly review board, refresh shared feed |
| `n`, `g` | New task in Tasks; new conversation elsewhere; `g` always general |
| `l` | Choose a Task List filter (includes empty lists) |
| `m` | Compose a message |
| `i` | Answer the selected conversation's Pi Request |
| `a` | Mark completed work reviewed |
| `x` | Stop selected run and discard its Queued Messages, after confirmation |
| `d` | Read task details |
| `e` in Task Workspace | Edit title, multiline notes, or due date; explicit Save/Cancel |
| `/`, `Escape` | Search; clear search, task scope, and list filter |
| `f` | Refresh tasks |
| `PageUp`, `PageDown`, `End` | Scroll transcript; follow live output |
| `?` | Controls |
| `q`, `Ctrl-C` | Quit; confirm if a run is active |

While the draft composer is focused, letters (including navigation shortcuts)
are message text. Escape discards it before navigation or quit.

Modal text fields support Left/Right (`Ctrl-B/F`), Home/End (`Ctrl-A/E`), and
Ctrl-Left/Right word movement. Backspace/Delete edit at the cursor; Ctrl-U clears.
Enter submits single-line fields; Ctrl-S submits notes. Escape cancels.
In a Pi Request, `Escape` sends a cancellation. Confirmation dialogs default to No.
Their wrapped details scroll with `PageUp`/`PageDown` and `Home`/`End`; Up/Down selects
No/Yes separately. Task refresh runs in the background, without blocking these controls.

## Storage and integration

The default data directory is `~/.local/share/task-shark-tui`. It holds
`conversations.json`, private Agent Workspaces, and Pi session files. Demo storage
lives in its `demo/` subdirectory. No existing Task Shark indexes are read or changed.
A lock prevents simultaneous app instances from writing the same directory.

On quit, owned Pi processes stop. Saved conversations and session paths remain.
Interrupted runs become Needs Input on restart. Unsent Queued Messages are kept in
the transcript for manual resubmission, never automatically replayed after failure.
Rejected or uncertain submissions are also kept. Check history before copying them
back to the composer: an uncertain submission may already have reached Pi.
When Pi reconnects, `get_messages` supplies the active session history; the app does
not concatenate session branches or rewrite Pi session files.

| Environment variable | Purpose |
| --- | --- |
| `TASK_SHARK_DATA_DIR` | Alternative data directory; demo adds `/demo` |
| `TASK_SHARK_PI` | Pi executable path; default searches PATH and `~/.pi/agent/bin/pi` |
| `TASK_SHARK_TASKS` | tasks-go executable path; default searches PATH and `~/.local/bin/tasks` |
| `TASKSHARK_MCP_RESOURCE_DIR` | Widget Board helper directory; default `/Applications/TasksWidget.app/Contents/Resources/TaskBoardMCP` |
| `TASKSHARK_BOARD_ROOT` | Shared Board root; default `~/Library/Application Support/TaskShark/SharedTasks/v1` |

Task Lists and Active Task List come from `tasks api lists`; tasks come from
`tasks api snapshot --list <name>`. This uses tasks-go’s existing storage, normally
`~/tasks-lists` and `~/.current-tasks-list`. `TASK_SHARK_LISTS_DIR` is no longer used:
the API catalog is authoritative, not a separate directory of filenames.

Task creation calls `tasks api exec` with `task.create`, the latest snapshot
revision, and `completed: false`, then refreshes the source list. Conflicts and
uncertain responses never trigger automatic creation retries. Check the refreshed
source before creating again: a failed response can follow a successful write.
Task editing uses `task.update` with the stable ID, source list, and latest revision.
Only changed fields are sent; blank notes/date clears them. Cancel and unchanged Save do not write.
Date changes remove Today references, not source tasks. Direct Today tasks stay. Failed removals can be retried with `e` during this launch without resaving the date.
Conflicts or uncertain delivery retain the draft and require explicit source review before another Save.
The app does not parse task Markdown or create a second task store. Existing conversation task
snapshots stay fixed; new conversations use updated details. Demo edits stay in memory.
This version does not import macOS conversations, manage Ticks, or embed a shell/editor pane.

Board Updates use the installed widget's supported helper, through Node, with the
same task ID and shared root as the widget. No second board store is created.
First opening a task or pressing `f` in Board Updates reads shared history; `n` appends a human
Note, Progress, Decision, Blocker, or Handoff. Real agent entries are shown unchanged;
this integration does not configure Pi to post updates. Demo updates stay in memory.
The latest 100 entries appear chronologically on the left; the highlighted entry is
previewed on the right. After opening with `Enter`, `a` reviews **all loaded entries**,
separately from conversation review; hidden unread entries block review, as in the widget.
Missing helpers and failed operations appear in the pane, not as an empty successful feed.
An uncertain post retains its body and request ID for explicit `n` retry without
creating duplicates. This retained submission is in memory only: quitting warns you
to check shared history before posting again after restart. There is no automatic retry.

If tasks fail to load, conversations still work; the footer shows the error. Check
the executable and tasks-go configuration, then press `f`. Missing model credentials and failed
runs appear as Needs Input. Check your Pi setup, then send another message.
A missing saved session is reported rather than replaced with an empty history.
For a stale lock after a crash, confirm that no app uses the directory, then remove
its `app.lock`. Invalid conversation storage is never silently overwritten.

## Check

```sh
npm run typecheck
npm run check:limits
npm test
npm run smoke
```

Tests use fake subprocesses and temporary storage. The pseudo-terminal (PTY) smoke
check and file-limit check require Python 3; it drives the real interface in demo mode, including
concurrent requests, long approvals at 100×32 and 60×20, Unicode titles, delayed
refresh, resize, restart, quit, signal cleanup, automatic startup task loading, empty lists,
every creation cancellation step, blank submissions, and successful `n` flows.
No model calls or real task changes occur. Installed tasks-go creation, conflict, and reset tests use a temporary home and
skip if that binary is absent. Source files stay within 200 lines and functions within 25.

`npm run check:local` is an optional installed-service check. It skips tasks by
default and asks Pi only for state/history in a temporary empty session, with
extensions and context loading disabled. It sends no prompt. Adding
`-- --allow-task-reset` enables task snapshots and permits their daily reset writes.
Use an isolated tasks-go home for that check, not real Task Lists.

`npm run check:resume` checks installed Pi against a temporary version-3 JSONL
session with a branch. It verifies active history and runs only `pwd -P` through
RPC to check the fixed Agent Workspace. It disables extensions and makes no model call.

The npm lockfile is compact JSON to keep every repository file under 200 lines;
resolved versions and integrity values are unchanged.
