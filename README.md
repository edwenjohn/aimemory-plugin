# aimemory — AI Memory Framework plugin for Claude Code and Codex

One plugin folder, two tools. It turns a plain-Markdown memory store into something every coding agent uses automatically:

- **At session start** it works out which project you are in (from the folder) and injects that project's `Memory.md` plus the latest `DynamicMemory.md` entries.
- **When a turn changed project files**, the Stop hook refuses to let the agent finish until it has appended a log entry. No more "it forgot to update the memory".
- **If a session ends with unlogged changes**, a one-line `[auto-stub]` entry is written so the work is not lost; the next session is told to expand it.
- **Skills** for the explicit moments: pull, save, update, path, init, list, search, pause, status.

The memory store format is the existing AI Memory Framework and is not changed: `Projects.md` (index) plus `<Project>/Memory.md` (stable reference) and `<Project>/DynamicMemory.md` (chronological log). See `skills/_references/readme-template.md` for the protocol.

## Install

Requirements: Node.js 18 or newer on PATH (both tools already need it). No npm install.

### Claude Code (CLI, desktop app, VS Code extension)

```
claude plugin marketplace add edwenjohn/aimemory-plugin
claude plugin install aimemory@aimemory
```

(From a local clone instead: `claude plugin marketplace add C:\path\to\aimemory-plugin`.) Start a new session anywhere; the plugin will say no memory path is set. Then:

```
/aimemory:path F:\AI Memory Framework
```

### Codex (CLI, desktop app, IDE extension)

```
powershell -ExecutionPolicy Bypass -File scripts\install-codex.ps1     # Windows
bash scripts/install-codex.sh                                          # macOS / Linux / Git Bash
```

The script copies the plugin to `~/.agents/plugins/aimemory` and adds it to your personal marketplace `~/.agents/plugins/marketplace.json` with the documented `./aimemory` relative path. Then, in Codex:

1. Restart Codex, open the plugin browser, enable **AI Memory**.
2. Run its setup (the onboarding skill is the path skill) and give it the memory folder, or type `$aimemory-path F:\AI Memory Framework` in any session.
3. Run `/hooks` and trust the aimemory hooks. Codex skips plugin hooks until you do.

The path is stored once in `~/.aimemory/config.json` and shared by both tools.

## Commands

| What | Claude Code | Codex |
|---|---|---|
| Load a project's memory | `/aimemory:pull [project]` | `$aimemory-pull` |
| Log this session's work | `/aimemory:save` | `$aimemory-save` |
| Correct the stable Memory.md | `/aimemory:update` | `$aimemory-update` |
| Show or set the memory folder | `/aimemory:path [folder]` | `$aimemory-path` |
| Register the current repo | `/aimemory:init` | `$aimemory-init` |
| List registered projects | `/aimemory:list` | `$aimemory-list` |
| Search all memory files | `/aimemory:search <text>` | `$aimemory-search` |
| Pause the save block this session | `/aimemory:pause` | `$aimemory-pause` |
| Diagnose | `/aimemory:status` | `$aimemory-status` |

Plain English works too ("check memory for summitpharma", "save memory", "did we already fix the till export?"): the skills trigger on their descriptions. Neither tool lets a plugin register a bare `/aimemorysave`, hence the namespaced forms.

## How auto-save works

The Stop hook blocks only when **all** of these hold:

- files were edited or written this turn (tracked by the PostToolUse hook; shell commands are not tracked, so the save skill asks the agent to mention shell-only work itself);
- at least one changed file belongs to a project registered in `Projects.md`;
- no entry has been written to that project's `DynamicMemory.md` since the change;
- the agent is not asking you a question (a message ending in `?` is let through);
- the hook has not already blocked this turn (`stop_hook_active`).

Files matching the `ignore` globs (minified assets, lockfiles, zips, build output, `.claude/`, `.codex/`) never count. Unregistered folders only get a one-line suggestion to run init.

One entry per session per project: later saves extend the session's own entry rather than adding more. Entries from earlier sessions are never edited.

`/aimemory:pause` turns the block off until the next session start. `config set autoSave remind` makes it a reminder; `off` disables it.

## Project detection

1. Longest match of the working folder against the `Path (local repo)` column in `Projects.md` (case- and slash-insensitive).
2. A `.aimemory` marker file (one line, the project folder name) in the repo or a parent, for checkouts living at a path not in the index. `init` writes it only in that case and adds it to `.git/info/exclude`.
3. Folder name equal to a project folder name under the memory root.

## Configuration (`~/.aimemory/config.json`)

| Key | Default | Meaning |
|---|---|---|
| `memoryRoot` | — | The AI Memory Framework folder |
| `autoSave` | `block` | `block`, `remind` or `off` |
| `pullEntries` | `8` | DynamicMemory.md entries injected at session start |
| `memoryInlineLimit` | `40000` | Characters of Memory.md injected whole; above this, TL;DR + section list + critical sections |
| `ignore` | see `scripts/lib/config.js` | Globs that never count as changes |

Set any of them with `node scripts/aimemory.js config set <key> <value>` or through `/aimemory:path`.

Per-session state lives in `~/.aimemory/sessions/<session-id>.json` (swept after 7 days). Hook errors go to `~/.aimemory/hooks.log`; hooks never fail a session.

## Troubleshooting

- `/aimemory:status` shows the config, the detected project and how, this session's changed files, and the last hook log lines.
- **Nothing loads in Codex**: hooks are untrusted until you run `/hooks` once. Check that **AI Memory** is enabled in the plugin browser.
- **Wrong project detected**: check the `Path (local repo)` column of that row in `Projects.md`.
- **Memory drive missing**: the plugin says so at session start and never blocks while the root is unreachable.
- **Codex desktop app and SessionStart**: a GitHub issue reports user SessionStart hooks listed but not run in the desktop app. If memory is not injected there, run `$aimemory-pull` manually; the Stop hook still works because it runs independently.

## Development

```
npm test          # node --test, no dependencies
npm run build     # regenerate codex-skills/ from skills/ (committed; tests fail when stale)
claude plugin validate .
```

Layout: `skills/` is the single source (written for Claude Code); `codex-skills/` is generated with `name: aimemory-<skill>` and Codex command spellings. `hooks/claude.json` and `hooks/codex.json` declare the same four events. `scripts/aimemory.js` is the only runtime: hook entry points plus the subcommands the skills call.

Design: `docs/superpowers/specs/2026-10-30-aimemory-plugin-design.md` and the matching plan under `docs/superpowers/plans/` in the memory store.

## Verified on

**Claude Code 2.1.220 (CLI), Windows 11, Node 22.18, 2026-10-30.** Installed from the local marketplace, path set, then two headless `claude -p` runs in the SummitPharma child theme folder:

- SessionStart injected the project's memory: the agent named "SummitPharma Child Theme" and the newest DynamicMemory.md entry without using tools.
- Writing a scratch file then stopping: the Stop hook blocked once (`hooks.log`: "Stop blocked session … for SummitPharma-Child-Theme"), the agent appended an entry following the file's own h3 Entry template, then stopped.
- SessionEnd wrote an `[auto-stub]` in that run even though the entry had been appended. Root cause (found in review): the PostToolUse hook and the `append-entry` command ran in parallel and raced on the session state file, so the "saved" flag was lost. Fixed since: all state updates go through a per-session lock, and the hooks now tell the agent its session id so `append-entry --session <id>` always lands on the right state.
- Known quirk: one `claude -p` run left its session state file behind (SessionEnd did not fire on that run). Harmless; state files are swept after 7 days.
- SessionEnd budget: Claude Code gives SessionEnd hooks about 1.5 s regardless of the hook's own `timeout` (raise with `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS`); Codex caps it at 3 s. The stub write is a single append, well inside both.

**Codex: installed, not yet verified in a session.** `scripts/install-codex.ps1` copied the plugin to `~/.agents/plugins/aimemory` and wrote the marketplace entry with the `./aimemory` relative path. This machine has the Codex desktop app but no `codex` CLI on PATH, so the remaining steps are manual: enable **AI Memory** in the plugin browser, run setup (or `$aimemory-path F:\AI Memory Framework`), trust the hooks via `/hooks`, then check `$aimemory-status`. Things to confirm there and record here: that the plugin appears at all (if not, try an absolute `source.path`), that Codex honours the compat manifest's `skills: ./codex-skills/` path (fallback in the design doc §5), that `${PLUGIN_ROOT}` is substituted in hook commands on Windows (else add `commandWindows` forms), and whether the desktop app runs SessionStart hooks.

**Projects with their own AGENTS.md.** Existing per-project instruction files that hardcode `F:\AI Memory Framework\…` keep working and the agent will follow them; they simply agree with the plugin. If the memory store ever moves, update those files as well as `/aimemory:path`.
