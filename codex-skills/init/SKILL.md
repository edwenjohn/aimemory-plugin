---
name: aimemory-init
description: Register the current repository as a new project in the AI Memory Framework, creating its Memory.md and DynamicMemory.md and adding it to Projects.md. Use when the user says "register this project", "add this project to memory", "onboard this repo", "init memory", or when the session-start hook reports the folder is not registered.
---

# aimemory init

Create a project's memory from a real read of the repo, then register it.

## Steps

1. Confirm the folder is unregistered and see what exists:

   ```
   node "${PLUGIN_ROOT}/scripts/aimemory.js" detect --cwd <cwd>
   node "${PLUGIN_ROOT}/scripts/aimemory.js" list
   ```

   If `detect` returns a project, stop: it is already registered (offer $aimemory-pull instead).

2. Agree the names with the user if not obvious: a display name (for example "Summit Reports") and a folder name with no spaces (for example `SummitAutomation`). Also a one-line summary and type (WordPress plugin, NestJS API, React app, ...).

3. Create the files and the Projects.md row:

   ```
   node "${PLUGIN_ROOT}/scripts/aimemory.js" init --name "<Display Name>" --folder <Folder> --cwd <cwd> --type "<type>" --summary "<one line>"
   ```

   Add `--path "<recorded path>"` only when the canonical checkout lives somewhere other than `<cwd>`; the command then writes a git-excluded `.aimemory` marker in `<cwd>`.
   `error` "already exists" → pick another folder name.

4. Fill `Memory.md` for real. The command wrote the skeleton from `${PLUGIN_ROOT}/skills/_references/memory-template.md`; every `<...>` placeholder must go. Read the repo first: README, manifest (package.json, composer.json, ...), entry points, directory layout, build and test scripts, config, git log. Then write each section from what you verified: TL;DR, layout/bootstrap flow, running it, conventions, domain rules, important files, integrations, known traps. Name exact files and functions. Mark anything unverified as such.

5. Write the first `DynamicMemory.md` entry with the file's Entry template (heading `### YYYY-MM-DD — Project onboarded into the AI Memory Framework [Codex]`), listing what you read and what you could not verify. Append it with:

   ```
   node "${PLUGIN_ROOT}/scripts/aimemory.js" append-entry --project <Folder> --session <session_id> --file <tempfile>
   ```

6. Tell the user the project is registered, where its files are, and what in Memory.md still needs their confirmation.

## Rules

- Never invent architecture. A short, verified Memory.md beats a long guessed one.
- One folder per project. If this repo is a second checkout of an already registered project, do not init; add the path to the existing row in Projects.md instead and say so.
