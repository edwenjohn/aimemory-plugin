---
description: List every project registered in the AI Memory Framework with its repo path, status, last log date and open auto-stubs. Use when the user says "list projects", "which projects have memory", "show the memory index", "what is in the AI memory framework", or when you need a project's exact name for another aimemory command.
---

# aimemory list

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/aimemory.js" list
```

Present the result as a short table with one row per project:

| Project | Folder | Status | Last entry | Stubs |
|---|---|---|---|---|

- `lastEntryDate` null and `filesPresent` false mean the row exists in Projects.md but the memory files are missing; flag it.
- `openStubs` greater than zero means a session ended with unlogged work; suggest /aimemory:pull on that project to expand the stub.
- Include `repoPath` only if the user asks where a project lives.

If the result is an error about configuration, run /aimemory:path.
