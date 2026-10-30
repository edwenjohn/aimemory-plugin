# DynamicMemory.md entry format

Each project's `DynamicMemory.md` may carry its own **Entry template** block. When it does, follow that block exactly. When it does not, use this default:

```
### YYYY-MM-DD — <short title> [<agent: Claude Code | Codex | other>]
**Project:** <Project folder name>
**Prompt/Task:** one line on what was asked
**Changed:** files touched (path:line if relevant)
**Why:** the reason/context behind the change (business or technical)
**Status:** done | in progress | blocked — <detail if blocked>
**Follow-up:** anything the next session should know or pick up (omit if none)
```

Rules:

- Append at the end of the file. Newest entries are at the bottom.
- One entry per session per project. If you already wrote this session's entry and it is still the last entry in the file, extend it with more `**Changed:**` / `**Follow-up:**` lines instead of starting a new one.
- Never edit entries from earlier sessions. Correct them with a new follow-up line.
- Name exact files and functions. State the agent in the heading tag. One line for the prompt, no more.
- Measured numbers carry their date and window.
- No emoji, no praise, no restating the prompt.
- An entry whose heading contains `[auto-stub]` was written by the plugin when a session ended with unlogged changes. Expand or correct it at the start of the next session.
