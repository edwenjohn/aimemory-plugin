# AI Memory Framework Protocol

Use this folder pattern for every project that needs handoff memory between AI tools, models, or sessions.

## Files

- `Projects.md` - top-level index/database of every project tracked here. Lists each project's name, repo path, status, and links to its `Memory.md`/`DynamicMemory.md`. Start here when you don't already know which project folder to open.
- `<ProjectName>/Memory.md` - stable project reference. Architecture, conventions, business rules, important files, integration notes, and known traps. Read once at session start.
- `<ProjectName>/DynamicMemory.md` - chronological work log for that project. Recent prompts, changes, decisions, blockers, and follow-ups. Read the last 5-10 entries at session start and append after meaningful work.

## Agent Startup Rule

At the start of a project session:

1. Read `Projects.md` to find the project's folder (skip if you already know it).
2. Read the project's `AGENTS.md` or equivalent local instructions.
3. Read that project's `Memory.md` once for static context.
4. Read the newest 5-10 entries in that project's `DynamicMemory.md`.
5. Verify exact files/functions before changing code.

## Update Rule

Update `Projects.md` only when a project is added, renamed, archived, or its one-line summary changes.

Update `Memory.md` only when stable project knowledge changes:

- architecture or bootstrap flow
- domain/business rules
- class/module ownership
- build/deploy/test conventions
- important integrations
- stale facts that need correction

Append to `DynamicMemory.md` after meaningful work:

- project name
- user task
- files changed
- reason/context
- status
- follow-up notes

## Recommended Project Instruction

Add this to each project's `AGENTS.md` (substitute the project's own folder name):

```md
This project uses a cross-model AI memory framework:

- `<MEMORY_ROOT>\Projects.md` - index of all tracked projects.
- `<MEMORY_ROOT>\<ProjectName>\Memory.md` - stable architecture and conventions.
- `<MEMORY_ROOT>\<ProjectName>\DynamicMemory.md` - recent task/change log.

At session start, read `Memory.md` once and the last 5-10 entries of `DynamicMemory.md`.
After meaningful work, append a short factual entry to `DynamicMemory.md`.
If `Memory.md` is stale, correct it in place.
```

Every project gets its own folder, e.g. `<MEMORY_ROOT>\ProjectName\Memory.md` + `DynamicMemory.md`. Avoid mixing unrelated project histories in one `DynamicMemory.md`. Register every new project as a row in `Projects.md`.

When a task touches more than one project, record the work in each affected project's own `DynamicMemory.md`, and include the project name in each entry.
