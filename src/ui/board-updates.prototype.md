# Board Updates — throwaway terminal prototype

Question: Which layout makes the task-scoped Board Updates feed readable and usable
inside a terminal Task Workspace without confusing it with a conversation?

Run from the repository root: `npm run prototype:board`.
This separate entry point leaves `npm start` unchanged. Everything is fictional and
in memory; exiting discards posts and review state. No model or task services run.

## Compare

- **A — Details then feed:** closest to the widget. One scrolling Details surface,
  with Board Updates after subtasks. Tests the cost of scrolling past context.
- **B — Context beside feed:** task facts stay visible while the feed scrolls.
  Below 90 columns, facts stack above the feed instead.
- **C — Update index and reader:** a compact chronological index selects one full
  update alongside task details. Tests long-feed scanning against lost continuity.

Left/Right or 1/2/3 switch layouts. Tab switches between a populated task and an
empty task. Up/Down scroll A/B or select an entry in C. PageUp/PageDown scroll.
`k` cycles all five kinds; `n` opens the composer; Ctrl-S appends; Escape cancels.
`a` appends a clearly simulated agent Progress update. `r` marks this task's loaded
entries reviewed. It does not alter conversation review. `q` quits.
The footer exposes task, entry count, review sequence, unread count, selection,
and selected kind. Entries expose sequence, kind, actor, source, time, and body.
Posting never edits earlier updates. Merely selecting an entry does not review it.

## Source evidence

Read-only reference: sibling `tasks-widget` repository.
- `CONTEXT.md`, Board Updates: append-only task feed under Details, not Board Mode.
- `TasksWidgetApp/TaskBoardModels.swift`: five kinds; sequence, actor, source, body.
- `TasksWidgetApp/TaskBoardViews.swift`: chronological entries, unread markers,
  explicit Mark reviewed, kind picker, nonblank posting, empty Add update state.
- `TasksWidgetApp/TaskBoardController.swift`: task-scoped review sequence and state
  reset; review is blocked when earlier unread entries are hidden.

## Deliberate limits and verdict

No winning layout has been selected. Keep this on `prototype/task-board`; do not
promote directly into production. No issue or remote prototype publication yet.

All fixture entries are loaded, so there is no pagination or hidden-unread case.
No storage, task brief sync, polling, deduplication, network errors, conversation
links, or live agent integration. The sidebar and task facts are reference context,
not functioning Service Tabs. Timestamps are fictional. At very small sizes the
footer can wrap and C becomes cramped. Target 100 columns by 30 rows.

Checked with TypeScript, repository size limits, and a temporary pseudo-terminal
harness at 110×32 and 70×24: all layouts, selection, review, simulated agent,
task switch, kind selection, typing/posting, resize, and clean exit.
