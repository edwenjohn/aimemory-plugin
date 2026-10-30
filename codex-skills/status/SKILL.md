---
name: aimemory-status
description: Diagnose the aimemory plugin - config, detected project, changed files, saved and paused flags, and the hook log. Use when the user asks "why did it block", "why was memory not loaded", "memory not working", "aimemory status", "which project does it think this is", or before reporting a plugin problem.
---

# aimemory status

```
node "${PLUGIN_ROOT}/scripts/aimemory.js" status --cwd <cwd> [--session <session_id>]
```

Report, in this order, only what is relevant:

1. **Config**: `configured`, `config.memoryRoot`, `memoryRootReachable`, `config.autoSave`. Not configured → $aimemory-path. Not reachable → the drive or folder is missing; nothing loads or saves until it is back.
2. **Detection**: `detected.project.name` and `detected.method` (`path` from Projects.md, `marker` from a `.aimemory` file, `folder` by name). `project: null` means unregistered → $aimemory-init. A `warning` means the marker and the index disagree.
3. **Session**: `state.changes` per project, `unsaved`, `state.saved`, `state.paused`, `state.entryHeading`. Without `--session` the CLI picks the single session for this folder (`sessionCandidates` lists them when several match; the Session id is printed in the session-start context and in Stop hook messages). An unsaved project with files is exactly what makes the Stop hook block; $aimemory-save clears it.
4. **Hook log**: the last lines of `~/.aimemory/hooks.log`. Lines with "Error" explain crashes; "Stop blocked" lines show when and why the block fired.

Common fixes to suggest:

- Hooks never run in Codex until the user trusts them once with `/hooks` in Codex.
- Session-start context missing in a desktop app: run $aimemory-pull manually and note the tool and version for the README's known-issues list.
- Wrong project detected: check the `Path (local repo)` column in Projects.md for that row.
