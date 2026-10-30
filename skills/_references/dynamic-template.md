# Dynamic Memory Log — <PROJECT>

> **Purpose:** Running, chronological log of prompts/tasks/changes across ALL AI tools (Claude Code, Codex, etc.) and sessions. Pairs with `Memory.md` (static architecture reference — read that first). This file is the "what's been happening lately" layer.
>
> **Repo:** `<REPO_PATH>`

---

## How to use this file (read before editing)

**Every AI agent working on this project must:**

1. **On session start:** read the last 5–10 entries below (most recent are at the bottom) to know what's currently in flight, what was just changed, and any open follow-ups.
2. **After finishing a task, feature, or bugfix** (batch a coherent unit of work into one entry, not every tiny tool call): append a new entry using the template below. The aimemory `save` skill does this for you.
3. **Keep entries short and factual.** Include file paths so the next session can jump straight there.
4. **Don't rewrite history** — only append. Correct mistakes with a new follow-up entry, not by editing old ones.
5. **If a task touches more than one project**, log it in each project's `DynamicMemory.md`; don't merge them.

### Entry template

```
### YYYY-MM-DD — <short title> [<agent: Claude Code | Codex | other>]
**Project:** <PROJECT>
**Prompt/Task:** one line on what was asked
**Changed:** files touched (path:line if relevant)
**Why:** the reason/context behind the change (business or technical)
**Status:** done | in progress | blocked — <detail if blocked>
**Follow-up:** anything the next session should know or pick up (omit if none)
```

---

## Log
