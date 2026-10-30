# AI Memory Framework — <PROJECT>

> **Purpose of this file:** Static, model-agnostic project knowledge. Load this ONCE at the start of a session (any AI: Claude, Codex, GPT, Gemini, local models) instead of re-reading the whole codebase. Update this file only when architecture/conventions change — NOT for day-to-day work (use `DynamicMemory.md` for that).

---

## 1. TL;DR (read this first, ~30 seconds)

- **What:** <one paragraph: what the project is, who uses it, what it is built with>
- **Scale:** <rough size: files, services, lines; what makes it big or small>
- **Where code lives:** <repo path and the two or three directories that matter>
- **Entry point:** <how the program starts and wires itself together>
- **Golden rule:** <the one convention every change must follow>
- **Build/test:** <the exact commands>
- **Git:** <branching and commit habits actually observed>

---

## 2. Layout / bootstrap flow

<How a request or run flows through the code. Name files and functions.>

## 3. Running it

<Commands to install, run, test, build, deploy. Environment variables and where secrets live (never the values).>

## 4. Conventions

<Naming, file placement, error handling, logging, formatting, review habits.>

## 5. Domain / business rules

<Rules that are defined exactly once and must not be duplicated. Quirks a newcomer would get wrong.>

## 6. Important files and ownership

<Table or list: file → what it owns → when to touch it.>

## 7. Integrations

<External services, APIs, databases, sibling projects. How they are configured and tested.>

## 8. Known traps

<Things that look like bugs but are intentional, and things that look fine but break.>

## 9. How AI agents should use this framework

- Read this file once per session, then the last 5–10 entries of `DynamicMemory.md`.
- Verify exact files/functions before changing code; this file may be stale.
- After meaningful work, append an entry to `DynamicMemory.md` (the aimemory `save` skill does this).
- If anything here is stale, correct it in place and note the correction in `DynamicMemory.md`.

_Last verified: <YYYY-MM-DD>_
