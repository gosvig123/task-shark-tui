# Development

This project is in active development. Experimentation is welcome.
Keep implementations minimal. Keep functions at most 25 lines and files at most 200 lines.
No backward compatibility, legacy adapters, or data migration is required unless requested.
Read CONTEXT.md for project terms.

## Architecture diagram

`docs/task-shark-architecture.json` is the source for the repository architecture.
`docs/task-shark-architecture.html` is its generated artifact.

When a change adds, removes, or changes a major component, integration, storage boundary, or main data path, update the JSON source in the same change. Then validate and regenerate the HTML:

```sh
node /Users/krisitan/.pi/agent/skills/archify/bin/archify.mjs validate architecture docs/task-shark-architecture.json --quality showcase --json
node /Users/krisitan/.pi/agent/skills/archify/bin/archify.mjs deliver architecture docs/task-shark-architecture.json docs/task-shark-architecture.html --quality showcase --json
```

Do not edit the generated HTML directly. Do not change the diagram for small internal refactors that do not alter its documented architecture.
