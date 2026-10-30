---
name: aimemory-update
description: Correct or extend a project's stable Memory.md in the AI Memory Framework when architecture, conventions, business rules or important files changed or turned out wrong. Use when the user says "fix Memory.md", "update the memory", "the architecture changed", "that memory is stale", or when you discover Memory.md disagrees with the code.
---

# aimemory update

Fix the stable reference in place. `Memory.md` holds knowledge that should stay true across sessions; day-to-day work belongs in `DynamicMemory.md` (see $aimemory-save).

## Steps

1. Locate the project and its Memory.md:

   ```
   node "${PLUGIN_ROOT}/scripts/aimemory.js" context [project-name]
   ```

   `project.memoryFile` is the file to edit. Read the relevant section in full before changing it.

2. Verify against the repo first. Open the files or functions the section names and confirm the new fact. Do not record something you have not checked.

3. Edit the section in place with your file-editing tool:
   - Change only what is wrong or missing; keep the section's structure and tone.
   - Add or refresh a line `_Last verified: YYYY-MM-DD_` at the end of the section you changed.
   - If a fact moved from one section to another, remove the old copy so there is one source of truth.

4. Record the correction in the work log with a one-line follow-up. Write a UTF-8 file `aimemory-entry.md` containing a single line such as `**Follow-up:** Memory.md §4 corrected: build now uses Vite 8, not webpack.` and run (the Session id is in the session-start context and in Stop hook messages; omit `--session` to let the CLI pick the session for this folder):

   ```
   node "${PLUGIN_ROOT}/scripts/aimemory.js" append-entry --project <folder> --session <session_id> --file <tempfile> --extend
   ```

   If this session has no entry yet, write a full entry instead (see $aimemory-save).

5. Tell the user which section changed and why in one or two lines.

## Rules

- Memory.md is for stable knowledge only: architecture, bootstrap flow, domain rules, module ownership, build/test/deploy conventions, integrations, traps. Not for "today I changed X".
- Never delete a section wholesale without saying so; mark superseded facts rather than silently dropping history the user may rely on.
