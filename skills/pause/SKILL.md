---
description: Pause or resume the aimemory auto-save block for the current session only, so the Stop hook stops demanding a DynamicMemory.md entry. Use when the user says "pause memory", "stop asking me to save", "skip the memory log for now", "resume memory", or "turn the memory block back on".
---

# aimemory pause / resume

The Stop hook blocks the end of a turn when project files changed and nothing was logged. This skill switches that off for the current session; it comes back on at the next session start.

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/aimemory.js" pause --session <session_id>
node "${CLAUDE_PLUGIN_ROOT}/scripts/aimemory.js" resume --session <session_id>
```

- The Session id is printed in the session-start context ("Session id: …") and in every Stop hook message. Without `--session`, the CLI uses the single session for the current folder and reports it; if several match, pass the id. If you cannot determine it at all, offer the permanent setting instead:

  ```
  node "${CLAUDE_PLUGIN_ROOT}/scripts/aimemory.js" config set autoSave remind
  ```

  (`remind` nudges instead of blocking; `off` disables; `block` restores the default.)

- `error` "no session state" means the hooks have not run in this session (plugin just installed, or hooks not trusted in Codex). Point the user to /aimemory:status.

Confirm in one line: paused (until the next session) or resumed. Changes made while paused are still tracked, so /aimemory:save can log them later.
