---
description: Show or set where the AI Memory Framework store lives (the folder holding Projects.md and the per-project Memory.md / DynamicMemory.md files). Use on first run after installing aimemory, when the session-start hook says no memory path is set, or when the user says "set memory path", "where is the memory stored", "move the memory folder", or "aimemory setup".
---

# aimemory path

One-time setup, shared by Claude Code and Codex through `~/.aimemory/config.json`.

## Show the current setting

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/aimemory.js" config get
```

`configured: false` means nothing is set yet. Otherwise report `memoryRoot`, `autoSave`, and whether `gitRepo` and `projectsIndex` are true.

## Set the path

1. If the user did not give a folder, ask for it. Suggest an existing folder named "AI Memory Framework" if you can see one (drive roots, Documents), for example `D:\AI-Memory`. Never assume a drive letter; every machine differs.

2. Set it:

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/aimemory.js" config set memoryRoot "<folder>"
   ```

   - `error` "does not exist" → ask the user to create the folder or give the right path; never create a memory root at a guessed location.
   - `projectsIndex: false` → the folder has no `Projects.md`. Ask whether to create starter files, then rerun with `--init-root` to write `Projects.md` and `README.md` from the plugin templates.

3. If `gitRepo` is false, tell the user in one line that the memory store is not under version control and has been lost once before (see the restore note in Projects.md), and suggest `git init` or a synced folder. Do not do it for them unless asked.

4. Confirm with `config get` and tell the user the path is set and will be used by both Claude Code and Codex.

## Other settings (only when asked)

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/aimemory.js" config set autoSave block|remind|off
node "${CLAUDE_PLUGIN_ROOT}/scripts/aimemory.js" config set pullEntries <n>
node "${CLAUDE_PLUGIN_ROOT}/scripts/aimemory.js" config set memoryInlineLimit <chars>
node "${CLAUDE_PLUGIN_ROOT}/scripts/aimemory.js" config set ignore "<glob>,<glob>"
```

After setting the path, memory loads automatically at the next session start; /aimemory:pull loads it now.
