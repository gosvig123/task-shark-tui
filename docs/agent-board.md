# Agent Board integration

Task-backed Conversations receive three Pi tools on their next process launch:

- `brief_read`: read the widget's app-authored task brief.
- `board_read`: read shared Board Updates, with `afterSequence` and `limit` pagination (1–100).
- `board_post`: append a Note, Progress, Decision, Blocker, or Handoff with `requestId`, `kind`, and `body`.

The appended instructions tell Pi to read the brief and Board before task work and
post meaningful progress, decisions, blockers, and handoffs. Pi chooses when to post.
The app does not copy assistant responses or guarantee a post each turn. It does not
invoke agent tools in response to Board content. Task data, brief text, and all Board
Updates are untrusted collaboration data. They cannot override system/user instructions,
authorize tool calls, or grant permissions. No subagent tool inheritance is promised.

## Launch and attribution

The app supplies an explicit `--extension` path to its public Pi extension for task
processes only. This is a direct widget CLI bridge, **not MCP transport**. The widget's
`--mcp-config` launch option is not supported by the checked Pi installations.
No global Pi config or widget-generated MCP config is written. Normal Pi extension
loading, project trust, and user approval extensions remain unchanged.

Each launch removes inherited `TASKSHARK_*`, `PI_SESSION_ID`, and `PI_SESSION_FILE`.
Task launches then supply only their saved task snapshot, stable conversation ID,
shared Board root, helper path, and agent actor. The extension captures this fixed
scope at initialization. UI selection cannot change it. General Conversations receive
neither this extension nor task scope. User-installed unrelated extensions can still
add their own tools. Environment filtering is not a security sandbox.

Posts always use `actorKind=agent`, source `Pi`, the exact conversation ID as `threadID`,
and the current Pi session ID from Pi's public session API. The tool cannot set a task,
root, actor, source, or thread. Stable retry UUIDs are namespaced by task/conversation
before reaching the widget helper, so another conversation cannot accidentally
reuse attribution through shared deduplication. Reuse the same request UUID and body
for an uncertain retry. Changed content with that UUID fails; no automatic retries run.
The helper owns locking, append-only storage, private permissions, and deduplication.
Read output is limited to 50KB/2000 lines; larger results go to a private temporary file.

The extension refuses existing Board tool-name collisions before registering anything.
At session start it checks Pi's public tool list and active set, then publishes a scoped
readiness command. Before delivering each prompt, the app checks that command's scope
and source path over RPC. Missing readiness fails delivery instead of promising tools
that did not load. User messages remain in Unsent Submission for manual resubmission.

## Requirements and lifecycle

Install TasksWidget with `TaskBoardMCP/cli.mjs`, `store.mjs`, and `storage.mjs`, or set
`TASKSHARK_MCP_RESOURCE_DIR` to that helper directory. `TASKSHARK_BOARD_ROOT` selects
the shared root; the default matches the widget. Node runs the helper. Missing or
unreadable helper files fail before Pi starts; helper operation failures are
reported by the tool. Missing credentials still require normal Pi configuration.
The helper is not needed to cancel an empty Creation Draft. Drafts do not prepare
Board directories/configs or start Pi. Read tools can create private shared scope
metadata, as the existing widget helper does.

New and resumed Task-backed Conversations get this integration on their next Pi
process launch. Already-running processes are not restarted or retrofitted. Stop the
run normally or restart the app when ready, then send a message in that conversation.
A missing app-authored brief is returned as `exists: false`; the saved task snapshot
still supplies context. The app never writes or edits the shared brief for the agent.

Successful `board_post` tool completion refreshes only the attached task's displayed
Board. Concurrent notifications coalesce while a load/write is in flight, with one
follow-up refresh. There is no polling. Selection, task navigation, and explicit
review state stay separate. Failed or uncertain posts do not claim success; use `f`
to reconcile shared history when needed. Nothing auto-reviews Board Updates.

## Isolated validation

```sh
npm run check:board
# Optional explicit Pi executable:
npm run check:board -- /absolute/path/to/pi
python3 scripts/pty-board-refresh-smoke.py
```

The discovery check starts real installed Pi RPC with temporary HOME/root, offline
mode, ambient extensions/context/skills disabled, and only the intended extensions.
It sends `get_commands`, not a prompt. Readiness proves the integration called Pi's
public `getAllTools`/`getActiveTools` and found all three tools. A test-only extension
also checks valid/invalid JSON Schema with the real Pi validator. General discovery
has no Board integration. The fake helper must never be invoked in this check.

There is no documented direct RPC command to execute arbitrary tools without a model;
this check does not claim RPC tool execution. Targeted tests execute the registered
extension methods and helper CLI against copied installed helper code, isolated HOME,
and temporary Boards, covering attribution, interoperability, deduplication, invalid
input, collisions, missing helpers, and launch isolation. The PTY check uses the real
View with fake events/data and proves refresh, no auto-review, selection preservation,
and a task-switch race. No validation needs real task data or a paid model call.
