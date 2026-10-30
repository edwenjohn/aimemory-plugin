# Projects Index

> **Purpose:** The top-level database of every project tracked by this AI Memory Framework. This file lists *what projects exist and where their memory lives* — it holds no architecture detail itself. For a project's actual knowledge, follow its `Memory.md` link; for its recent activity, follow its `DynamicMemory.md` link.
>
> **Read order for any agent starting work on a project:** 1) find the project row below → 2) read that project's `Memory.md` once → 3) read the last 5–10 entries of that project's `DynamicMemory.md` → 4) see `README.md` in this folder for the full protocol/update rules.

---

## ⚠ Restore note — 2026-10-02

The `F:` drive was formatted and this folder was lost. It was rebuilt from the only surviving copy, a **2026-07-30** snapshot found at `C:\Users\AU\Documents\AI Memory Framework` (a drive-wide search of `C:`, `D:` and `E:` found nothing newer). Therefore:

- **`Kush-Shop-Child`, `Namba-AI-Framework`, `SummitPharma-AusPost`, `SummitPharma-Child-Theme` are restored at their 2026-07-30 state.** Anything logged to them in August or September 2026 is gone. Treat their `Memory.md` as possibly stale and verify named files/functions before relying on them; when you next work on one, say so in its `DynamicMemory.md`.
- **`SummitAutomation` did not exist in the July snapshot.** Its `Memory.md` and `DynamicMemory.md` were written fresh on 2026-10-02 from a verified read of the live repo; its log starts there, and `git log` plus `docs/superpowers/specs|plans/` are the surviving record of the earlier work.
- **This folder is a single point of failure.** One removable drive, no version control. Worth moving to a git repo or a synced folder before the next format.

---

## How this index works

- **One folder per project:** `F:\AI Memory Framework\<ProjectName>\Memory.md` + `DynamicMemory.md`. Never mix two projects' logs into one file.
- **Adding a new project:** create its folder + both files (use the SummitPharma folder as a template for structure/tone), then add one row below.
- **Updating this file:** only when a project is added, renamed, archived, or its one-line summary meaningfully changes. Day-to-day work goes in the project's own `DynamicMemory.md`, not here.

---

## Projects

| Project | Path (local repo) | Type | Memory | Dynamic Log | Status | One-line summary |
|---|---|---|---|---|---|---|
| SummitPharma Child Theme | `c:\wamp64\www\summitpharma\wp-content\themes\summitpharma-child` | WordPress child theme (WooCommerce) | [Memory.md](SummitPharma-Child-Theme/Memory.md) | [DynamicMemory.md](SummitPharma-Child-Theme/DynamicMemory.md) | Active | Australian medical cannabis / pharmacy e-commerce site — prescriptions, DVA subsidy, compassion program, multi-location dispensing. Sibling project below (AusPost) is independent but runs on the same site. |
| SummitPharma AusPost | `C:\wamp64\www\summitpharma\wp-content\plugins\summitpharma-auspost` | WordPress plugin (WooCommerce), no git repo | [Memory.md](SummitPharma-AusPost/Memory.md) | [DynamicMemory.md](SummitPharma-AusPost/DynamicMemory.md) | Active (test env, no live API creds configured) | Standalone Australia Post shipment/label/manifest/tracking fulfilment tooling for WooCommerce orders on the same site as the child theme above; independent codebase (`SummitPharma\AustraliaPost` namespace), no shared classes. |
| Kush Shop Child | `c:\wamp64\www\shopkush\wp-content\themes\kushshop-child` | WordPress child theme (WooCommerce) | [Memory.md](Kush-Shop-Child/Memory.md) | [DynamicMemory.md](Kush-Shop-Child/DynamicMemory.md) | Active — 70 uncommitted local changes as of 2026-07-30 | **Separate local checkout of the same repo as "SummitPharma Child Theme"** (shared git remote `summitpharma-child.git`), currently mid-rebrand from SummitPharma to "Kush Shop" branding plus an in-progress Advance Order Modal feature. Same medical cannabis / pharmacy business domain and architecture; diverging locally, not yet committed/pushed. |
| Namba AI Framework | `C:\Users\AU\Documents\Namba-AI-Framework` | React web app (portable, no backend) | [Memory.md](Namba-AI-Framework/Memory.md) | [DynamicMemory.md](Namba-AI-Framework/DynamicMemory.md) | Active — Phase 1 in progress as of 2026-07-30 | Portable, backend-free React app visualizing this framework's own projects as an interactive 3D neural network; Markdown files (this framework) remain the single source of truth, the app is just a viewer/editor for them. |
| SummitAutomation (Summit Reports) | `C:\Users\AU\Documents\SummitAutomation` | npm-workspaces monorepo — NestJS 11 + Prisma 6 + pg-boss 10 API, Vite 8 + React 19 web, shared package | [Memory.md](SummitAutomation/Memory.md) | [DynamicMemory.md](SummitAutomation/DynamicMemory.md) | Active — branch `feature/medirecords-patients`, live on Supabase Sydney, migrations 0001–0018 applied | Reporting platform for the same pharmacy business as the two SummitPharma projects above: pulls WooCommerce + MediRecords + Z Office data into one Postgres database and lets non-technical staff build and publish parameterised reports ("Quick reports" is the boss-facing surface). **Live production data, real patient records — read `Memory.md` §9 before touching anything.** |
| Namba AI (ALON assistant) | `C:\Users\AU\Documents\Namba AI` | npm-workspaces monorepo — Fastify + Drizzle/SQLite API, React 19 + Vite 7 web, Zepp watch app | [Memory.md](Namba-AI/Memory.md) | [DynamicMemory.md](Namba-AI/DynamicMemory.md) | Active — onboarded 2026-10-29; branch `feat/ollama-brain-hermes-skills` awaiting merge | ALON, Edwen's personal AI assistant: local Ollama brain (OpenAI only as backup), voice + Voice Focus avatar, reminders/tasks/health/memory tools, and Hermes Agent as approval-gated "hands" for real-world skill tasks. **Not** the same project as `Namba AI Framework` above. |

*(Add new rows above this line as new projects are onboarded.)*
