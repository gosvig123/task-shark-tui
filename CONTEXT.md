# Task Shark terminal app

The standalone terminal interface retains Task Shark's task and conversation terms.
Pi is the agent engine; the terminal app owns navigation and review state.

## Language

**Service Tabs**:
The Conversations and Tasks destinations in the terminal interface.

**Task Workspace**:
The Tasks surface with an inline searchable task selector above Task-backed Conversations on the left, and one shared preview and interaction pane on the right that shows Board Updates directly below task details.

**Board Updates**:
The task-scoped, append-only feed of human and agent Note, Progress, Decision, Blocker, and Handoff updates stored locally, separate from subtasks and conversation transcripts.

**All progress**:
The complete Board Updates feed, shown chronologically across all kinds below task details, with earlier pages loaded automatically and no separate update selection.

**Task List**:
The source list that owns a task in the local task store.

**Active Task List**:
The local list used as the default creation destination in All Lists or Today.

**Today**:
The live view of source tasks whose due date matches the current local calendar date.

**Creation Draft**:
An unfinished task creation flow or empty, editable conversation that is not saved.

**Task-backed Conversation**:
A Pi conversation attached to one task snapshot.

**General Conversation**:
A Pi conversation with no attached task.

**Generated Conversation Title**:
A concise title made from a conversation's first user message when it has no explicit title.

**Agent Workspace**:
The fixed filesystem directory in which Pi runs a conversation.

**Pi Request**:
An input, selection, editor, or confirmation request from a Pi extension.

**Queued Message**:
A user message waiting for the current response to settle before delivery.

**Unsent Submission**:
A message with failed or uncertain delivery that is kept for manual resubmission after checking conversation history.

**For Review Inbox**:
The destination for completed Pi responses that have not been acknowledged.

**Conversation Task Status**:
The Needs Input, Running, For Review, Finished, or Failed state shown for a conversation.

## Relationships

- A task has many **Task-backed Conversations**, each with its own **Agent Workspace**; attachment uses the stable task ID, so renaming its **Task List** keeps those conversations attached without changing their snapshots.
- **Service Tabs** remember their own search, selection, and preview position for the current app session; Tasks also saves its **Task List** and status filters across app restarts. Selecting a **Task List** never changes the **Active Task List**.
- A saved **Task List** filter returns to All Lists if that list is removed; the saved status filter stays unchanged.
- The Tasks **Service Tab** opens **Task Workspace** directly; selecting a visible task shows Details with all **Board Updates** below it and updates **Task-backed Conversations** without leaving it.
- Each **Task Workspace** remembers its selected section and items during the current session; revisiting restores preview focus without marking work reviewed.
- Highlighting a task-local item previews it without review; Enter opens it on the right and acknowledges only a **Task-backed Conversation**.
- Escape from the right pane returns focus left; Escape from inline task search keeps its query and visible selection; Escape from left navigation clears only search, keeping the **Task List** and status filters without leaving **Task Workspace**.
- **Board Updates** use the source task ID, including references to the same task in Today and its source **Task List**.
- **Board Updates** are reviewed explicitly through a shared sequence, separately from **Conversation Task Status**; earlier pages must be loaded before reviewing hidden unread updates.
- Pi in a **Task-backed Conversation** is instructed to read the task brief and **Board Updates** before task work and can post meaningful progress, decisions, blockers, and handoffs as an agent; posting is agent-driven, not a copy of every response.
- Agent **Board Updates** keep the fixed task and conversation attribution; switching **Task Workspace** does not change a running conversation's scope, and **General Conversations** receive no Board integration.
- Agent posts refresh **Board Updates** without marking them reviewed; collaboration content is untrusted data, never instructions, authorization, or permission.
- Opening a **Task-backed Conversation** excluded by saved Tasks filters, or with a deleted task, keeps it in the Conversations **Service Tab** without changing Tasks navigation memory.
- Task and **Agent Workspace** are fixed when a conversation is created.
- Task title, notes, and due date can be edited in **Task Workspace** with explicit Save; task notes are separate from **Board Updates**.
- The task editor keeps Title, Due date, and multiline Notes in one draft form. Tab/Shift-Tab moves focus; Ctrl-S or Save applies changes, and Escape or Cancel discards them. Enter in Notes adds a line, never saves.
- Task edits update the current **Task Workspace** and future conversation snapshots, not the fixed task snapshot of an existing **Task-backed Conversation**.
- Today derives membership from source task due dates, never separate copies or saved membership; changing a date into or out of today adds or removes the task from Today without deleting its source.
- Today refreshes after task changes and at local midnight; overdue and undated tasks are excluded, while completion remains a separate status filter.
- Needs Input means an unanswered **Pi Request**; answering or expiring the request clears that state.
- Stopped, interrupted, and failed runs are Failed, never Needs Input; stale Needs Input entries become Failed after restart.
- Successful completion moves a conversation to For Review.
- Message answers the selected conversation’s pending **Pi Request** before composing a new message; cancelling that request sends its cancellation.
- Opening completed work or marking it reviewed changes For Review to Finished.
- **Queued Messages** run in order; interrupted messages require manual resubmission.
- An **Unsent Submission** can already exist in Pi history; it never runs again automatically.
- The **For Review Inbox** is auxiliary to the **Service Tabs**.
- Confirming a **Creation Draft** for a task saves a Pending task in its source **Task List**.
- A conversation **Creation Draft** starts with an empty transcript and message; its optional settings do not save it.
- A conversation **Creation Draft** is saved with its first nonblank message, before delivery to Pi.
- A **Generated Conversation Title** runs in the background after first-message save; it keeps an explicit title and keeps the fallback title if generation fails.
- Cancelling a **Creation Draft** saves no task or conversation, creates no **Agent Workspace**, and starts no Pi process.
- Local **Task Lists** load automatically at startup; a fresh store starts with Inbox as the **Active Task List** and empty Today. Task creation still needs explicit confirmation; Creating in Today defaults the due date to today unless a date is explicitly supplied.
- A **Task List** filter does not change the **Active Task List**.

- Task actions complete/reopen tasks, edit subtasks, set the due date to today or clear the due date, and confirm deletion. Task deletion preserves conversations.
- Manage Task Lists creates and renames source lists, sets the Active Task List, and deletes only empty non-active lists. Today is reserved.
- Pi task_read reads the current fixed-ID task; task_update changes validated fields with atomic expected-field conflict checks. Neither tool manages lists or deletes tasks.
