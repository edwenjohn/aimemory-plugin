## AI Memory Framework protocol (aimemory plugin)

- Memory.md above is the stable project reference: architecture, conventions, business rules, important files, known traps. It can be stale. Verify exact files and functions before changing code.
- The DynamicMemory.md entries above are the recent work log, newest last. They tell you what is in flight and what the last session left open.
- After meaningful work (any project file changed), append one entry to that project's DynamicMemory.md using the file's own Entry template: run {{save}}. The Stop hook blocks you from finishing a turn with unlogged changes until an entry exists. Write it yourself from what you did; the hook only knows which files changed.
- One entry per session per project. Later saves in the same session extend that entry instead of adding another.
- Never edit entries from earlier sessions. Correct them with a new follow-up line.
- If Memory.md is stale or wrong, correct it in place with {{update}}, then note the correction in DynamicMemory.md.
- Work that touches several registered projects gets an entry in each project's own log.
- Full memory for this or another project at any time: {{pull}}. Register an unlisted project: {{init}}. Troubleshooting (why did it block, what did it detect): {{status}}. Turn the block off for this session only: {{pause}}.
