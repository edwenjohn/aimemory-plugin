---
name: aimemory-search
description: Search every project's memory files in the AI Memory Framework for a word or phrase. Use when the user asks "did we already do X", "have we solved this before", "find in memory", "search the memory for <term>", "when did we change <thing>", or when you suspect another project's log holds the answer.
---

# aimemory search

```
node "${PLUGIN_ROOT}/scripts/aimemory.js" search <text>
```

The search is a case-insensitive substring match across all Markdown files under the memory root. Each hit carries `project`, `file`, `line`, the nearest preceding `heading`, and the matching `text`.

## Presenting results

- Group by `project`, then by `heading` (the heading is usually the dated entry the hit belongs to).
- Show at most ten hits unless the user asks for more; say how many there were in total. `truncated: true` means the search stopped at 200 hits; suggest a more specific term.
- When a hit matters, open the file at that line and read the whole entry before answering, rather than quoting the single matched line.
- Zero hits: say so and, if useful, try one or two spelling variants (singular/plural, abbreviation, file name) before concluding the topic is not in memory.

Use $aimemory-pull when the user wants the whole picture of one project rather than a term.
