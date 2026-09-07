# Task Shark terminal app

The standalone terminal interface retains Task Shark's task and conversation terms.
Pi is the agent engine; the terminal app owns navigation and review state.

## Language

**Service Tabs**:
The Conversations and Tasks destinations in the terminal interface.

**Task Workspace**:
The task-centered surface with Details, Board Updates, and Task-backed Conversations stacked on the left and one shared preview and interaction pane on the right.

**Board Updates**:
The task-scoped, append-only feed of human and agent Note, Progress, Decision, Blocker, and Handoff updates shared with the task widget, separate from subtasks and conversation transcripts.

**Task List**:
The source list that owns a task returned by tasks-go.

**Active Task List**:
The existing tasks-go list used as the default creation destination in All Lists or Today.

**Creation Draft**:
An unfinished task creation flow or empty, editable conversation that is not saved.

**Task-backed Conversation**:
A Pi conversation attached to one task snapshot.

**General Conversation**:
A Pi conversation with no attached task.

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
The Needs Input, Running, For Review, or Finished state shown for a conversation.

## Relationships

- A task has many **Task-backed Conversations**, each with its own **Agent Workspace**.
- **Service Tabs** remember their own filters, search, selection, and preview position for the current app session; selecting a **Task List** never changes the **Active Task List**.
- Opening a **Task Workspace** hides the global task list; its three left sections belong only to the opened task.
- Each **Task Workspace** remembers its selected section and items during the current session; revisiting restores preview focus without marking work reviewed.
- Highlighting a task-local item previews it without review; Enter opens it on the right and acknowledges only a **Task-backed Conversation**.
- Escape from the right pane returns focus left; Escape from the left restores the original task list selection and filters.
- **Board Updates** share the widget's task ID scope, including references to the same task in Today and its source **Task List**.
- **Board Updates** are reviewed explicitly through a shared sequence, separately from **Conversation Task Status**.
- Task and **Agent Workspace** are fixed when a conversation is created.
- Task title, notes, and due date can be edited in **Task Workspace** with explicit Save; task notes are separate from **Board Updates**.
- Task edits update the current **Task Workspace** and future conversation snapshots, not the fixed task snapshot of an existing **Task-backed Conversation**.
- Changing a source task's due date removes its Today reference without deleting the source task; tasks stored directly in Today remain there.
- Saving a task date and removing its Today reference are separate operations; failed reference removal does not roll back the saved date.
- Pending **Pi Requests** and failed runs take priority over Running and For Review.
- Opening completed work or marking it reviewed changes For Review to Finished.
- **Queued Messages** run in order; interrupted messages require manual resubmission.
- An **Unsent Submission** can already exist in Pi history; it never runs again automatically.
- The **For Review Inbox** is auxiliary to the **Service Tabs**.
- Confirming a **Creation Draft** for a task saves a Pending task in its source **Task List**.
- A conversation **Creation Draft** starts with an empty transcript and message; its optional settings do not save it.
- A conversation **Creation Draft** is saved with its first nonblank message, before delivery to Pi.
- Cancelling a **Creation Draft** saves no task or conversation, creates no **Agent Workspace**, and starts no Pi process.
- Existing **Task Lists** load automatically at startup, including the normal tasks-go daily reset; task creation still needs explicit confirmation.
- A **Task List** filter does not change the **Active Task List**.
