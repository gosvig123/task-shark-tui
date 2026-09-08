# Agent Board integration

Task-backed Conversations receive three Pi tools on their next process launch:

- `brief_read`: read the fixed conversation task snapshot as JSON.
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
processes only. The extension calls native local SQLite services directly.
No global Pi or widget configuration is written. Normal Pi extension
loading, project trust, and user approval extensions remain unchanged.

Each launch removes inherited `TASKSHARK_*`, `PI_SESSION_ID`, and `PI_SESSION_FILE`.
Task launches then supply only their saved task snapshot, stable conversation ID,
local configuration root and agent actor. The extension captures this fixed
scope at initialization. UI selection cannot change it. General Conversations receive
neither this extension nor task scope. User-installed unrelated extensions can still
add their own tools. Environment filtering is not a security sandbox.

Posts always use `actorKind=agent`, source `Pi`, the exact conversation ID as `threadID`,
and the current Pi session ID from Pi's public session API. The tool cannot set a task,
root, actor, source, or thread. Stable retry UUIDs are namespaced by task/conversation
in the local database, so another conversation cannot accidentally
reuse attribution through shared deduplication. Reuse the same request UUID and body
for an uncertain retry. Changed content with that UUID fails; no automatic retries run.
SQLite transactions serialize append-only updates and deduplication; the database file is private.
Read output is limited to 50KB/2000 lines; larger results go to a private temporary file.

The extension refuses existing Board tool-name collisions before registering anything.
At session start it checks Pi's public tool list and active set, then publishes a scoped
readiness command. Before delivering each prompt, the app checks that command's scope
and source path over RPC. Missing readiness fails delivery instead of promising tools
that did not load. User messages remain in Unsent Submission for manual resubmission.

## Requirements and lifecycle

Node.js 22.19 or later provides native SQLite. Board Updates use `tasks.sqlite`
under the app configuration root. No TasksWidget, external helper, or external brief
is needed. Database errors fail tools explicitly. Missing credentials still require
normal Pi configuration. Empty Creation Drafts do not start Pi or write Board data.

New and resumed Task-backed Conversations get this integration on their next Pi
process launch. Already-running processes are not restarted or retrofitted. Stop the
run normally or restart the app when ready, then send a message in that conversation.
Brief reads return the fixed saved task snapshot, even if the source task changes
or is removed. The app never rewrites an existing conversation snapshot.

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
has no Board integration. Discovery does not invoke tools or initialize the database.

There is no documented direct RPC command to execute arbitrary tools without a model;
this check does not claim RPC tool execution. Targeted tests execute the registered
extension methods and local SQLite services with temporary databases, covering
attribution, interoperability, deduplication, invalid input, collisions, database
failures, and launch isolation. The PTY check uses the real
View with fake events/data and proves refresh, no auto-review, selection preservation,
and a task-switch race. No validation needs real task data or a paid model call.

## Current task tools

`task_read` returns the current task at the conversation’s fixed task ID.
`brief_read` still returns the original snapshot; Board Updates remain separate.
`task_update` accepts `expected` and `changes` with the same nonempty field set:
`title`, `description` (notes), `dueDate` (YYYY-MM-DD or blank), `completed`, and `subtasks`.
Subtasks contain unique IDs, nonblank titles, and boolean completion.
A transaction compares expected fields before saving; conflicts save nothing.
Read and review again after a conflict. Tools cannot delete tasks, move tasks, or manage Task Lists.
