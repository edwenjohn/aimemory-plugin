---
description: Log the work done this session to the project's DynamicMemory.md in the AI Memory Framework. Use when the user says "save memory", "log this work", "update the dynamic memory", "record what we did", when the Stop hook says changes are unlogged, or after finishing a task, feature or bug fix on a registered project.
---

# aimemory save

Append this session's work to the project's `DynamicMemory.md`, following that file's own Entry template.

## Steps

1. Find out what changed and whether this session already wrote an entry:

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/aimemory.js" status --session <session_id> --cwd <cwd>
   ```

   `unsaved` lists registered projects with changed files. `state.entryHeading[<folder>]` is set when this session already logged that project. If you do not know the session id, skip `--session`: you will write a full entry and the hook will still see the file write.

2. Get the template for each project to log:

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/aimemory.js" context <folder>
   ```

   Use `template` if present; otherwise use the default in `${CLAUDE_PLUGIN_ROOT}/skills/_references/entry-format.md`.

3. Write the entry text to a temporary file (for example `aimemory-entry.md` in the OS temp directory). Fill every template field from what you actually did:
   - Heading: today's date, a short title, and the agent tag `[Claude Code]`.
   - **Changed:** exact file paths, with functions or line ranges where useful. Include shell-only work (builds, migrations, commands) that the hook could not see.
   - **Why:** the business or technical reason.
   - **Status:** done, in progress, or blocked with detail.
   - **Follow-up:** what the next session must know. Omit if none.
   Keep it factual, no emoji, one line for the prompt.

4. Append it:

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/aimemory.js" append-entry --project <folder> --session <session_id> --file <tempfile>
   ```

   If `state.entryHeading[<folder>]` was already set, write only the new `**Changed:**` / `**Follow-up:**` lines (no heading) and add `--extend`, so the session keeps one entry per project. If the result says the entry is no longer last, a continuation entry was appended instead; that is fine.

5. If changes span several registered projects, repeat steps 2 to 4 for each, naming the project in each entry.

6. Delete the temporary file and tell the user in one line what was logged and where (`file` in the result).

## Rules

- Never edit earlier entries or reorder the file. Append only.
- Do not restate the prompt beyond the one `Prompt/Task` line.
- If Memory.md itself turned out stale during the work, also run /aimemory:update.
