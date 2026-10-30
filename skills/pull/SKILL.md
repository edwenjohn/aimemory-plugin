---
description: Load a project's AI memory (Memory.md plus the latest DynamicMemory.md entries) from the AI Memory Framework. Use when the user says "check memory", "pull memory", "load project context", "what do we know about <project>", "check AI memory framework", or at the start of work on any registered project when the session-start hook did not already inject it.
---

# aimemory pull

Pull the stored memory for a project into this conversation.

## Steps

1. Run, with the project name the user gave (or nothing to detect from the current folder):

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/aimemory.js" context [project-name]
   ```

2. Read the JSON result:
   - `error` containing "not configured" → run /aimemory:path first.
   - `ambiguous` → list the candidates' `name` values and ask which one.
   - `error` containing "no project matches" → run `node "${CLAUDE_PLUGIN_ROOT}/scripts/aimemory.js" list` and show the user the registered names.
   - `error` containing "not registered" → tell the user the folder is unregistered and offer /aimemory:init.

3. On success treat the payload as your project context:
   - `memory` is Memory.md (whole file, or the TL;DR plus critical sections when `truncated` is true; say so and offer to read the full file at `project.memoryFile`).
   - `entries` are the last N DynamicMemory.md entries, newest last. Read them all.
   - `stubs` lists `[auto-stub]` entries written when an earlier session ended with unlogged work. If any exist, tell the user and offer to expand them now using your knowledge of that work, or ask what was done.
   - `template` is the file's own Entry template; you will need it when you save.

4. Reply with a short summary: project name, the TL;DR in two or three lines, what the last entries say is in flight, and any open stubs or follow-ups. Do not paste the whole payload back.

## Rules

- Verify named files and functions in the repo before relying on Memory.md; it can be stale. If you find it wrong, fix it with /aimemory:update.
- This skill reads only. Saving is /aimemory:save.
