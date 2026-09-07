# Task Shark terminal app

The standalone terminal interface retains Task Shark's task and conversation terms.
Pi is the agent engine; the terminal app owns navigation and review state.

## Language

**Service Tabs**:
The Conversations and Tasks destinations in the terminal interface.

**Task Workspace**:
The task-centered context containing Details and its task-backed conversations.

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
- Task and **Agent Workspace** are fixed when a conversation is created.
- Pending **Pi Requests** and failed runs take priority over Running and For Review.
- Opening completed work or marking it reviewed changes For Review to Finished.
- **Queued Messages** run in order; interrupted messages require manual resubmission.
- An **Unsent Submission** can already exist in Pi history; it never runs again automatically.
- The **For Review Inbox** is auxiliary to the **Service Tabs**.
- Confirming a **Creation Draft** for a task saves a Pending task in its source **Task List**.
- A conversation **Creation Draft** starts with an empty transcript and message; its optional settings do not save it.
- A conversation **Creation Draft** is saved with its first nonblank message, before delivery to Pi.
- Cancelling a **Creation Draft** saves no task or conversation, creates no **Agent Workspace**, and starts no Pi process.
- A **Task List** filter does not change the **Active Task List**.
