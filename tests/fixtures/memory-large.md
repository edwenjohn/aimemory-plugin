# AI Memory Framework — SummitAutomation (Summit Reports)

> **Purpose of this file:** Static, model-agnostic project knowledge. Load this ONCE at the start of a session (any AI: Claude, Codex, GPT, Gemini, local models) instead of re-reading the whole monorepo. Update this file only when architecture/conventions change — NOT for day-to-day work (use `DynamicMemory.md` for that).
>
> **Sibling projects:** `SummitPharma-Child-Theme` is the WooCommerce storefront this project *reads from* (see `F:\AI Memory Framework\Projects.md`). The order-location rules were derived from that theme's checkout code. Cross-project notes are in §10.

---

## 1. TL;DR (read this first, ~30 seconds)

- **What:** `summit-automation` — an npm-workspaces monorepo at `C:\Users\AU\Documents\SummitAutomation`, internally called **Summit Reports**. It pulls Summit Pharma's WooCommerce + MediRecords + Z Office data into one Postgres database and lets non-technical staff build and publish reports over it.
- **Who it is for:** the owner (Aaron) and his manager/boss. The reporting UI is deliberately plain-English — the "Quick reports" page exists so the boss can run a parameterised report without understanding the builder.
- **Workspaces:** `packages/shared` (`@summit/shared`), `apps/api` (`@summit/api` — NestJS 11, Prisma 6, pg-boss 10), `apps/web` (`@summit/web` — Vite 8, React 19, Tailwind v4, react-query v5, react-router 7). Node >= 22. Vitest 3 everywhere.
- **Database:** **Supabase Postgres in Sydney** (`aws-0-ap-southeast-2.pooler.supabase.com`). It is a *live production* database holding real patient data. Every Prisma round trip costs ~0.5 s.
- **Two stores, two countries, two currencies.** `Shop SummitPharma` (**AUD**, shop.summitpharma.com.au) is the business these reports are about. **`Pharma Greenclinic` is a separate New Zealand business trading in NZD** (pharma.greenclinic.co.nz), same owner, otherwise unrelated. The catalogue has one org-wide `ORG_CURRENCY`, so **anything that spans both stores adds NZD to AUD and calls it AUD** — see §7.3.
- **Golden rules:**
  1. **The verification gate is four commands, judged by exit code, re-run after the LAST commit** (§4). Nothing ships without it.
  2. **Never per-row writes** against Supabase — one statement per batch (§5).
  3. **What counts as a sale is defined once** — `NON_SALE_STATUSES` (§6).
  4. **Never copy the raw Z Office / MediRecords export files into the repo** — they contain patient names, DOB, Medicare numbers (§9).

---

## 2. Layout

```
packages/shared/src/   api-types charts enums formula/ grouping imports money params periods report reports shop-location
apps/api/src/          app.module main  audit auth cli/ common config crypto dashboard health imports/ integrations
                       medirecords orders patients prisma products reports/ stores sync users webhooks woo
apps/web/src/pages/    home login mfa orders order-detail products product-detail patients patient-detail
                       reports sheet quick quick-report settings settings-import connections connection-detail
                       integrations store-overview admin-users admin-audit
docs/superpowers/specs/ docs/superpowers/plans/   (one dated pair per sub-project)
```

- `apps/api/src/reports/catalogue/` is the report **dataset registry**: `orders`, `order-lines`, `products`, `patients`, `appointments`, `stores`, `metrics`, `dispense-scripts`, `till-sales`, plus `org.ts` (org-wide constants) and `types.ts`.
- `apps/api/src/cli/` holds every one-off/bulk tool, each wired as an npm script in `apps/api/package.json`: `bootstrap-owner`, `import-from-mysql`, `import-medirecords-csv`, `import-zoffice`, `import-products-from-mysql`, `backfill-order-line-products`, `backfill-shop-location`, `reconstruct-deleted-products`, `repair-missing-orders`, `prune-order-payloads`, `seed-quick-reports`, `acceptance-*`.

## 3. Running it

```
npm run build -w @summit/api   then   cd apps\api && node dist\main.js     # API on port 3000
npm run dev -w @summit/web                                                 # web dev server
```

**The worker dies silently, and `/health` lies about it.** On 13 Oct 2026 pg-boss stopped at 04:26 UTC during a
269k-row dispensing import and did not recover on its own: every queue froze — `report.run`, `sync.scheduler-tick`
and **`sync.store`, so the WooCommerce sync stopped too** — while `/health` kept returning `worker: ok`, because
`isWorkerRunning()` reads a flag set at startup rather than probing liveness. Reports pile up as `QUEUED` with no
pg-boss job behind them and never start. **Restarting the API fixes it**; allow a minute, because the next
`*/5 * * * *` tick is the first sign of life. To check properly, compare `max(created_on)` in `pgboss.job` against
`now()` — not the health endpoint. Runs orphaned this way must be cancelled by hand; nothing will ever pick them up.

**Stopping the API: match on the port, not the command line.** `node dist/main.js` and `node dist\main.js` are the
same process to a human and different strings to `-like`. On 13 Oct a stop loop matching `*dist\main.js*` silently
missed a process started with a forward slash, so the old build kept port 3000, the new one died with
`EADDRINUSE`, and the owner was served stale code while every local check passed. Use
`Get-NetTCPConnection -LocalPort 3000 -State Listen` and kill the owning pid. **And do not treat the
`[Jobs] worker started` log line as proof of a successful start** — Nest logs it *before* `listen`, so it appears
even when the process then exits. Confirm `/health` returns 200 *and* the pid is still alive.

**A build is not a deploy.** `npm run build -w @summit/api` writes `dist/`; the running `node dist\main.js` keeps serving the old code until it is restarted. On 12 Oct 2026 the owner hit `Invalid enum value ... received 'source'` from a bug that had already been fixed, committed and built — the process was 27 minutes stale. After any API change: build, **restart**, then check `/health` on `127.0.0.1` (not `localhost`, which resolves to IPv6 first here and refuses).

API tests run against an **embedded Postgres started by Vitest `globalSetup`** — no live database needed, and no suite may touch the live one. Allow ~300000 ms for the API suite.

## 4. The verification gate (hard-learned — do not shortcut)

```
npm run typecheck
npm run lint
npm run build -w @summit/shared
npm run build -w @summit/api
```

**All four, by exit code, re-run after the final commit.** Reason: Vitest and `tsx` *strip* types without checking them, so a fully green test suite can coexist with a branch that does not compile. This has actually happened here — an `as const` that turned an array into a readonly tuple shipped to a branch that failed `tsc`. Grepping build output for "error TS" and reporting success is **not** verification; check the exit code.

Build `@summit/shared` **before** the API; the API imports its compiled output.

## 5. Supabase / Postgres rules

- **Bulk writes must be single statements** — `UPDATE … FROM (VALUES …)`, `INSERT … ON CONFLICT`. Never per-row loops, and never the array form of `$transaction([...])` (that is still N round trips at ~0.5 s each).
- **Prisma's bind-variable ceiling is 32,767** (i16), not Postgres's 65,535. Chunk accordingly.
- **Disk IO Budget is a daily burst allowance that refills by itself.** Depleting it drops you to baseline throughput; it is not a lockout, and `pg_stat_statements_reset()` has nothing to do with recovering it.
- **Do not run `sum(pg_column_size(col))` over a whole table on production** — that reads the entire table (it cost 181 MB of IO once). Use catalog sizes: `pg_relation_size`, `pg_total_relation_size`.
- Postgres only TOASTs a value past ~2 KB, so a 681-byte JSONB column stays **inline** and is read by every sequential scan. That was the root cause of the Oct 2026 IO problem.
- Expression indexes need IMMUTABLE expressions. `timezone(text, timestamp without time zone)` is immutable, so the `localDate()` expression in §6 is indexable — but an index DDL must reproduce the catalogue's SQL **character-for-character** or the planner will not match it.
- **Bulk loads must pass `connection_limit=1`** so they cannot starve the API's pool, and `VACUUM (ANALYZE)` after each file (never inside a transaction).
- Long loads get their connection recycled (`FATAL: terminating connection due to administrator command`, `P1017`); the shared transient classifier must treat those as retryable, and one source file must still produce exactly one import-history row.
- `VACUUM` makes space reusable but does not return it to the OS; that needs `VACUUM FULL`.

## 6. Domain rules that are defined exactly once

| Rule | Where | Note |
|---|---|---|
| What counts as a sale | `apps/api/src/orders/sale-statuses.ts` → `NON_SALE_STATUSES` | re-exported by `dashboard/dashboard.service.ts`. Import from either; **never redefine.** A leaf module on purpose — importing it from the dashboard would form a load-time cycle. |
| Org timezone / local date | `apps/api/src/reports/catalogue/org.ts` | `ORG_TIMEZONE = 'Australia/Sydney'`; `localDate(col)` = `` (col::timestamp AT TIME ZONE 'Australia/Sydney') ``. **The `::timestamp` cast is load-bearing** — a bare `timestamptz AT TIME ZONE zone` converts in the *session* timezone. |
| Which pharmacy an order belongs to | `packages/shared/src/shop-location.ts` | `ShopLocation = 'caloundra' \| 'brisbane'`; `shopLocationOf()`, plus `metaLocation`, `pickupLocation`, `shippingLocation`. |
| Product resolution on order lines | `product_external_alias` | Order lines resolve products **through the alias table, never by product id directly.** |
| Import kinds / limits | `packages/shared/src/imports.ts` | `ImportKind = 'dispense_scripts' \| 'till_sales'`; `MAX_IMPORT_BYTES` = 25 MB. |

### 6.1 Order location (migration 0011, backfilled)

`order.shop_location` is nullable text (`'caloundra'` / `'brisbane'` / null = unknown). `shopLocationOf` applies, in order: order location **meta** → Fortitude Valley pickup or GoPeople → Caloundra pickup → a **Brisbane-only product** on the order → other shipping method → null. The rules came from the child theme's `page-checkout.php` and were confirmed by the manager against a real sample.

Caveats: before ~13 Sept there was no location identifier at all, and Brisbane postage via GoPeople only appeared recently — so older orders lean on the later rules.

**It applies only to the store that runs the registers** (`store.owns_counter_sales`, migration 0017). Caloundra and Fortitude Valley are that business's pharmacies; any other store has none, so there is no honest answer for its orders. This is enforced in **both** places that write the column — `refuseStoreWithoutPharmacies` in the backfill CLI, and a `scope.ownsCounterSales` check in `woo/mappers/order.mapper.ts` on the sync path. Both are needed: `shopLocationOf` ends in a catch-all, so a store with no pharmacies does not fail to resolve, it resolves to **`caloundra`**. That is how 691 Pharma Greenclinic orders (a New Zealand business) came to be labelled Caloundra. They were cleared 12 Oct 2026 — and one came straight back overnight, because the first fix only covered the CLI and the sync path was the one re-creating them. Cleared again and both paths guarded 13 Oct.

`backfill-shop-location` deliberately **never lets a guess overwrite a stored value**: `metaLocation ?? pickupLocation ?? current ?? shopLocationOf(...)`, with the bulk `UPDATE` guarded by `AND (v.loc IS NOT NULL OR o.shop_location IS NULL)`. Because `current` outranks it, the Brisbane-only-product rule is effectively first-pass-only; a `--recompute` flag is still outstanding.

### 6.2 Reports

- **Parameters:** `ParamKind = 'year' | 'month' | 'week' | 'day' | 'range' | 'store' | 'location' | 'source' | 'text'`. A date rule points at one with `{ kind: 'param', paramId }`, a filter with `{ param: 'p2' }`. `applyParameters` runs **server-side**; chosen values live in `report_build.parameters` (JSONB).
- **Grouping:** `groupBy { field, grain }` with `group_key` / `group_count` column kinds and `groupAgg`. **`groupBy` accepts date fields only** — so Location and Item type cannot be group keys.
- **UI:** grouping lives in the **Columns panel** as `+ One row per…` (with a `GroupEditor` dialog), *not* in the rail. It was moved there because the rail version confused everyone, the owner included. The Day column row carries the grain select, and Remove on it switches grouping off.
- **Quick reports** (`/quick`, `pages/quick.tsx` + `quick-report.tsx` + `components/quick/param-inputs.tsx`) are the boss-facing surface: published, parameterised reports with Compare. Seeded by `npm run seed-quick-reports -w @summit/api`.
- **Adding a parameter kind touches five places**, and the compiler only catches three of them. `ParamKind` in `reports.ts`; `ValueKind`, `PARAM_KIND_LABEL`, `VALUE_OPS`, `valueProblem`, `previousParam`, `describeParamValue` in `params.ts`; the Zod `base` enum in `apps/api/src/reports/validate.ts` (**a separate list from `DatasetKey` — a new dataset key is rejected at runtime until it is added here too**); `apps/api/src/reports/validate-report.ts`, which validates a *report's* params and used to restate the kinds as its own `z.enum` (it now imports `PARAM_KINDS` from shared — it had fallen a kind behind, so a quick report asking "Sales source" could be built in the UI and never saved); `ParamValueInput` in `components/quick/param-inputs.tsx`; and `BLANK_DEFAULT` in `components/sheet/questions-panel.tsx`. The last two are `Record<ParamKind, string>`, so `npm run typecheck` finds them — but only typecheck, not the builds.

### 6.3 The `sales` dataset (one shape over both sources, 12 Oct 2026)

`Sales` is a `UNION ALL` of `order` (sales statuses only, baked in) and `till_sale` rolled up to one row per receipt, so a single report can be pointed at either by answering a **Sales source** question (`Online store` / `ZOffice`). Spec: `docs/superpowers/specs/2026-10-12-sales-source-design.md`; the dataset is `apps/api/src/reports/catalogue/sales.ts`.

Things that will bite whoever edits it:

- **`sold_at` is a GROUP BY key, not `min(sold_at)`.** A predicate cannot reach through a `GROUP BY`, but it *can* be pushed below the aggregate when it is on a grouping column — which is the difference between an Index Cond on `till_sale_organisation_id_location_sold_at_idx` and re-aggregating 154,113 rows per run. Verified by `EXPLAIN` in `test/prisma/indexes.test.ts`. It is sound only because every line of a receipt shares one timestamp (0 exceptions in 120,342 receipts); a test pins the consequence if that ever breaks.
- **Counter sales get their store from `store.owns_counter_sales`** (migration 0017, partial unique index on `(organisation_id) WHERE owns_counter_sales`). That is what makes a `Store = Summit` filter return Z Office rows too, and it keeps store-permission scoping working with no special case. The join is a `LEFT JOIN` on purpose: a missing flag shows a blank Store rather than silently losing every counter sale.
- **No `statusColumn`** (sales-only is inside the union) and **no Customer field** (the rollup drops it), so the dataset is not clinical.
- **Script / OTC / Unclassified are three `FILTER`ed money columns, not a category** — 8,547 receipts (7.1%, $2,468,722) carry both kinds of line, so a label on a receipt row would misattribute that money. They are null on an online row because the website side is unclassified, and their labels say `(counter)` so that null is not read as "the website sold no scripts". The three always sum to the receipt's Revenue.
- **The classification is curated in `counter_product`, NEVER read from `till_sale.item_type`.** This is the trap: `item_type` looks exactly like the answer and is not — it is the till's *transaction* type. **72 stock names are rung up under more than one of them, across 114,724 lines and $18,522,865** (73% of counter revenue): `Compounded Cat 5 >98% total THC` is `Script` ×67,121 and `Sale` ×2. Classifying by it overstates OTC by ~9%. `product` cannot supply it either — **6 of 449 till stock names match a `product.name`** ($359 of $25.47M), so the two vocabularies are disjoint and there is nothing to inherit. A test pins that a line rung up as `Sale` still counts as Script when its product is judged one.
- The source labels live in `packages/shared/src/sales-source.ts` because the label **is** the SQL literal, the parameter's stored answer and the web dropdown's option — one list so they cannot drift.

### 6.4 Settings → Product types (the curated script/OTC judgement, 12 Oct 2026)

`counter_product` (migration 0018) holds one row per counter product name judged `script` or `otc`. **Unclassified is the absence of a row**, not a stored third value, and the list of names is **derived from `till_sale`** rather than seeded — so a product first sold tomorrow appears already ranked by what it is worth, and there is no second list to keep in step.

Screen `apps/web/src/pages/settings-product-types.tsx`, API `apps/api/src/imports/counter-products.{service,controller}.ts` behind `imports:manage` (OWNER and ADMIN; a VIEWER gets 403). Names are listed **by revenue, biggest first**, and progress is shown as a **share of revenue** rather than a count — because in production the top 10 of 449 names are 66.1% of the counter, the top 100 are 95.1%, and **189 names are worth under $1,000 each ($44,528 in total)**. Telling the owner "2 of 449 done" would be discouraging and wrong; "96.9% of revenue covered" is the truth.

A name can be judged before it next sells (the API does not check it against `till_sale`), so the screen never argues with an operator about a product sold once last year.

## 7. The three sales sources (important — they are NOT joined)

A deliberate decision by the owner: **online sales and store sales are separate sources of truth and must not be merged automatically.**

1. **WooCommerce `order`** — the website. Both pharmacies.
2. **`till_sale`** — the Z Register point-of-sale export. **Both pharmacies** since 7 Oct 2026 (Caloundra 143,717 rows; Brisbane 10,396) — but the two cover different spans, see §8.
3. **`dispense_script`** — intended for Z Dispense dispensing records. **Currently 0 rows** (see §8).

The `sales` dataset (§6.3) puts 1 and 2 in one shape behind a **Sales source** question. It is the only thing that may be read as a combined figure, and only because it excludes non-`ORG_CURRENCY` orders.

**What `till_sale` actually is (measured 2 Oct 2026 — do not re-derive):** it comes from `C:\Users\AU\Downloads\ZOffice Sales Reports - Cleaned` and is a **Z Register point-of-sale export** — Caloundra in the year folders, Brisbane in `All time BNE` (§7.2). Every `payments` value is a register tender (EFTPOS, CASH, card); there is **not one web-gateway row** (Merchant Warrior, PayWay), so posted web orders are structurally absent from that report. Z Dispense *the system* records every dispense regardless of channel — the gap is in this particular export, not in Z Office.

Consequences to respect:

- Anything built on `till_sale` is **counter takings, not store sales** — it holds both sites now, but a web order posted out never rings up, so it is absent whichever pharmacy dispensed it. **Always say which window and which site**: Caloundra runs 13 Sep 2021 → 19 Sep 2026, Brisbane only 18 Mar 2025 → 7 Oct 2026, so an all-locations total silently mixes spans.
- **Website total + till total double-counts the "Pay In Store" orders.** Measured 1 Jan – 19 Sep 2026, Caloundra: 7,664 web orders chose Pay In Store; 80.3% match a same-day till receipt for the identical total, against a **16.4% coincidence floor** (online-paid control). So roughly 4,900–6,100 orders — about $0.8–1.0M of the till's $2.18M — are the same transaction counted twice.
- When comparing channels, filter orders to `shop_location='caloundra'` or the comparison is lopsided (2026: $6.03M Caloundra vs $6.73M both sites).
- **Two claims that were wrong and must not be reused:** that the counter decline happened "because online ordering took over" (an inference, not a finding), and a "98% → 38%" register-share figure that came from `cld_scripts_rows.csv`, since deleted.

### 7.1 "Why is the website bigger than Z Office?" — the answer, measured

The owner has asked this three times, in good faith, because he knows every online order is dispensed at the pharmacy and recorded in Z Office. **He is right about Z Dispense the system and wrong about the export we hold**, and the arithmetic below settles it faster than the argument does. Do not re-derive it; do not restate the conceptual distinction without these numbers.

Like-for-like, **1 Jan – 19 Sep 2026** (the window where both sources have data), AUD store only:

| | count | revenue |
|---|---|---|
| Online store | 34,105 orders | $6,614,480 |
| ZOffice | 19,585 receipts | $2,896,061 |

And the whole explanation, from the website's own payment field over the same window:

| | orders | revenue |
|---|---|---|
| Paid **online**, posted out | 24,151 | **$5,025,654** |
| Paid **in store** | 9,954 | $1,588,826 |

That **$5,025,654 never touched a register**, so no receipt exists for it. It reconciles both ways: ZOffice $2,896,061 ≈ $1,588,826 of in-store-paid web orders + ~$1.31M of walk-in trade; Online $6,614,480 = $5,025,654 posted out + $1,588,826 paid at the counter. Confirmed by the tenders: EFTPOS 19,593, CASH 4,024, CASH+EFTPOS 659 — **no web gateway appears anywhere in `till_sale`**.

Two names, one source of confusion: **Z Dispense** records every dispense whatever the channel; the **Z Register sales report** — what we imported — holds only what rang up at a till. A true all-channel Z Office figure needs a *dispensing* export, which is what the deleted `cld_scripts_rows.csv` was.

### 7.2 The Brisbane till export (cleaned 7 Oct 2026)

The analyst delivered Brisbane as two raw legacy `.xls` files in `…\ZOffice Sales Reports - Cleaned\All time BNE`. They were **not** in the cleaned shape; cleaning them produced **`BNE All Time - cleaned.xlsx`** in that same folder — 10,396 rows, 8,160 receipts, $1,331,316.53, 18 Mar 2025 → 7 Oct 2026, Script 9,818 / Sale 424 / Department Sale 154. It passes `import-zoffice --dry-run` with **0 problems**.

What the raw files needed, and the traps if they are ever re-cleaned:

- **The header row is complete — it labels all 26 columns**, including `Payments` and `Sell Price`. They sit at *merged* positions, every second or third column: `A, C, G, I, M, O, Q, S, U, W, Y, AA, AC, AE, AG, AI, AK, AM, AO, AQ, AS, AU, AW, AZ, BB, BD` (so `Payments` is `AI` and `Sell Price` is `AM`), in the same order as the Caloundra 26. Read the header across **all** used columns, not the first 30 — truncating the probe at column 30 shows only 13 labels and invites the false conclusion that the rest are unlabelled. The mapping was also confirmed from the data: `AM` equals `U` on 99.89% of rows, exactly as `Sell Price` equals `Discounted Price` on Caloundra (99.96%), and `AI`/`AK` hold `EFTPOS` / `EFTPOS:$88.00`.
- **Legacy `.xls`, so the 65,536-row limit applies** and the data spills across `Sheet1`/`Sheet2`/`Sheet3` with the header on Sheet1 only. A record occupies ~16 spreadsheet rows, so a sheet fills after only ~4,000 records.
- **The exports do not add up to their own grand totals** — the all-time file is 4 qty / **$416.50** short, the 2026 file 2 qty / **$299.00** short. Cause: a record straddling a sheet boundary is lost. Merging the two files recovered one of them, leaving the cleaned file **$319.00 (0.024%) short of the report's own total** — a defect in the source, not in the cleaning. **A re-export as `.xlsx` or CSV would recover it**; that is the standing ask of the analyst / Z Software.
- `BNE Sales 2025.xls` is in fact the **all-time** export; `BNE Sales 2026.xls` is a 2026 subset of it (6,425 of its 6,427 lines are already in the other). Do not load both as separate files on the assumption they are different years.
- Report furniture to drop: a `Total` row, a `Rounding` row, the grand-total row, and a `Page n of n` footer — 8 rows per file, all at the end, with no per-page footers scattered through.
- Brisbane's register history **starts 18 Mar 2025** (the store's web orders start earlier, 68 in 2024), and this export runs to **7 Oct 2026**, further than Caloundra's 19 Sep 2026 — so any combined counter figure must use a common window.
- Brisbane's `Payments` values are register tenders too (EFTPOS 8,231 / CASH 1,711 / combinations), so §7's finding holds for both sites: this is a point-of-sale export, not an all-channel one.

**Status: loaded 7 Oct 2026** — 10,396 rows / 8,160 receipts / $1,331,316.53, 0 problems, one `SUCCEEDED` `manual_import` row; Caloundra was untouched by the load and no `(receipt_no, line_key)` pair duplicates. Re-run with
`npm run import-zoffice -w @summit/api -- --org <id> --kind till_sales --location brisbane --file "<the cleaned file>"` — idempotent, it upserts on `(organisation, location, receipt_no, line_key)`.

### 7.3 Currency: why `sales` filters on `ORG_CURRENCY`

`ORG_CURRENCY` is a single constant (`AUD`) and the planner formats every money column with it, so a report spanning both stores silently adds New Zealand dollars to Australian ones. It was doing exactly that: **"Yearly sales" for 2026 read $7,334,043, being A$7,218,302 + NZ$115,741.**

The `sales` dataset's online half therefore carries `AND o.currency = '${ORG_CURRENCY}'`. Filtering on the currency the report claims to be in — rather than on a store name or the counter flag — has the right failure mode: **a future AUD store is included automatically, a future NZD one is not.**

**Still unfixed:** `Patients' orders by date` is on `orders`, org-wide, and its Totals tile sums `sales` across both currencies when its Store question is left blank. It stays on `orders` because it needs customer name and email, which `sales` does not carry. Give it a Store default or a currency filter.

If Green Clinic ever needs reports of its own, one constant will not do: it needs per-store currency *and* per-store timezone (`store.timezone` still says `Australia/Sydney` for a New Zealand business).

### 7.4 Manual Import (migrations 0012–0014)

Settings → **Manual Import** (`pages/settings-import.tsx`); API in `apps/api/src/imports/`: `readers.ts` (`readCsv` / `readXlsx` / `readerFor`), `scripts.parser.ts`, `till.parser.ts`, `imports.writer.ts`, `imports.service.ts`, `parse-money.ts` (`parseMoneyMinor`), `parse-date.ts` (`parseAuDate`). Tables `manual_import`, `dispense_script`, `till_sale`. Bulk loader: `npm run import-zoffice -w @summit/api`.

- A file is remembered by the **sha256 of its bytes**; re-importing the same bytes is skipped.
- `till_sale` rows are keyed `(receipt_no, line_key)`, where `line_key` is a sha256 over the line's fields **including `Stock Name`**. The thin analyst CSV has no Stock Name column, so **the thin CSV and the cleaned xlsx produce different `line_key`s for the same line** — loading both would double Caloundra till revenue. This is why the cleaned folder is the only accepted source.
- Script numbers are unique per file but **collide across pharmacies**, so the key is `(location, script_no)`.
- Till Script lines name their script as `(RX nnnn)` — `RX_REF = /\(RX\s*(\d+)\)/i`.
- `raw` (the source record) is stored **only for rows that had a parse problem**; clean rows store `NULL`. Problems are capped at 200 in the response with a true `problemCount` alongside.
- The web screen carries a **selection token** so a stale preview can never approve a different file.
- `ROW_NOUN` is `Scripts` for `dispense_scripts` and `Lines` for `till_sales` (a till row is a receipt line, not a sale).

## 8. Current data state (measured 13 Oct 2026 — verify before quoting)

> **13 Oct 2026, later the same day: dispensing is loaded.** `dispense_script` now holds **282,692 scripts** from
> the refreshed analyst CSVs in `…\ZOffice Sales Reports - Cleaned\Zoffice Scripts` — Caloundra 269,220
> ($47,864,690.94, 8 Sep 2021 → 8 Oct 2026) and Brisbane 13,472 ($2,009,955.11, 20 Mar 2025 → 8 Oct 2026), 0 parse
> problems, 0 duplicate `(location, script_no)` pairs. **`till_sale` is still empty**, so counter figures read zero
> until register data is reloaded. Note the scripts CSV is the *native* 23-column shape — the missing-`Stock Name`
> problem below applies only to the till/OTC files.
>
> **⚠ The Z Office tables were emptied on 13 Oct 2026** at the owner's instruction, to be reloaded from the four
> analyst CSVs once he has pulled updated versions. `till_sale`, `dispense_script` and `manual_import` are **0 rows**;
> the figures below are what was there and what should come back. **`counter_product` (449 judgements) was kept
> deliberately** — it is the owner's manual work, not Z Office data, and it re-matches as soon as stock names exist.
> Database went 728 MB → 620 MB. **The reports still run**: Yearly sales returns the website half only, and Counter
> sales by type returns zeroes rather than erroring.
>
> **Before reloading, check the shape.** The thin CSVs (`csv13`) have **no `Stock Name`**, which is the column
> `counter_product` joins on — load till data from those and every product type reads Unclassified, and `Payments`,
> `GST` and gross profit are gone too. The 26-column cleaned xlsx is the richer source; ask for that shape if it can
> be produced.

| | |
|---|---|
| `till_sale` | **154,113 lines / 120,342 receipts / $25,482,768.25.** **Caloundra** 143,717 lines, 112,182 receipts, $24,151,451.72, 13 Sep 2021 → **19 Sep 2026**. **Brisbane** 10,396 lines, 8,160 receipts, $1,331,316.53, 18 Mar 2025 → **7 Oct 2026**. The two end on different days and neither is current — say which window you mean. |
| `till_sale` by product type | **Script 144,269 lines / $25,290,302 · OTC 9,665 / $183,144 · Unclassified 179 / $9,322.** Unclassified is only the 179 lines carrying no stock name; every one of the 449 names is judged. |
| `counter_product` | **449 rows — 336 script, 113 otc.** 100% of counter revenue classified. |
| `order` (sales statuses) | **Shop SummitPharma (AUD)** 121,603 orders / $27,691,421: 114,773 Caloundra, 6,234 Brisbane, 596 no location. **Pharma Greenclinic (NZD)** 695 orders / NZ$115,741, **no location at all, which is correct** — see §7.3 and §6.1. |
| `dispense_script` | **0 rows** — truncated on the owner's instruction ("only the source of truth is the ZOffice Sales Reports - Cleaned"). The four analyst CSVs (`cld_scripts_rows`, `bne_scripts_rows`, `otc_and_other_sales_cld_rows`, `otc_and_other_sales_bne_rows`) were removed and must not be reloaded. |
| `manual_import` | 22 records: 21 SUCCEEDED + 1 leftover FAILED from an abandoned 2023 workbook run. |
| Database size | **727 MB.** |

**Quick reports live on the page** (order 1–6, all rebuilt 12 Oct): Yearly sales · Monthly sales · Weekly sales · Day to day sales · Product sales by date · Counter sales by type · Patients' orders by date. The four period reports ask **Period → Sales source → Pharmacy**, in that order, and run on `sales`. `Counter sales by type` asks Month → Product type → Pharmacy on `till_sales`. Also present but not a starter: `Test Weekly Sales Reports` (the owner's own, order 0) and four non-quick templates.

**Yearly sales 2026 as it now reads** (1 Jan – 12 Oct, verified through the real run pipeline): both sources 57,051 sales / $10,160,885; `Sales source = ZOffice` 19,894 / $2,940,849; `Online store` 37,157 / $7,220,036. The two sources add exactly to the combined total. Before the rebuild the same report read **$7,334,043**, mixing in NZ$115,741.

Measured channel trend, **Caloundra on both sides**, 1 Jan – 19 Sep each year — website orders/$ vs till receipts/$:

| year | website | till |
|---|---|---|
| 2022 | 113 / $35,264 | 19,675 / $4,915,166 |
| 2023 | 7,807 / $2,134,232 | 16,072 / $3,704,177 |
| 2024 | 19,006 / $4,841,508 | 17,088 / $3,984,138 |
| 2025 | 28,109 / $6,609,997 | 15,717 / $3,053,214 |
| 2026 | 30,893 / $6,029,557 | 14,820 / $2,176,928 |

Average basket fell on **both** channels over that span (counter $251 → $147, website $312 → $194), which channel shift alone does not explain — treat the cause as unknown.

**Known gotchas in the counter data:**

- The "OTC and other sales" exports are **93% `item_type = Script`** — genuine OTC is ~7% (postage, grinders, lighters, jars). Do not treat those files as OTC-only.
- **`BLANK DD` / `BLANK NHS` / `BLANK NON-NHS` / `BLANK REPAT` / `BLANK S3R` are Z Office placeholder stock codes**, not products — UK-derived naming, DD = Dangerous Drug, used when the real item is not in the stock file. 1,911 lines / $250,602 across them, and **usage is rising** (269 lines in 2021, 484 in 2025). For 1,420 of those lines the description is just the code, so **what was sold is not recorded anywhere** — only the price ($85 median, against $18.95 for real OTC) says it was medicine. All are judged `script` except REPAT and S3R, which are still `otc` and probably should not be.
- **`jack`** was an ad-hoc stock entry for Ice Cream Cake flower, 17 Aug – 5 Nov 2024, retired the day the proper `Ice Cream Cake 26%` codes appeared. 70 lines / $10,735, all on prescription.

## 9. Security and safety constraints (non-negotiable)

- **Never print or log database URLs or credentials.** Mask the DB URL in any output.
- **Never read or copy the real Z Office / MediRecords export files from `C:\Users\AU\Downloads` into the repo.** They hold patient names, DOB and Medicare numbers. Analyse them in the session scratchpad and keep only derived figures.
- **Subagents must never run migrations or CLIs against the live database.** The controlling session does that, and only after confirming the host is `aws-0-ap-southeast-2.pooler.supabase.com`.
- **Stage by path; never `git add -A`.** The owner keeps work in progress uncommitted — this has already caused one commit to pick up files it should not have.
- Patient email on dispensing data is usually the **prescribing clinic's** address, not the patient's (6,472 distinct over 243k rows) — do not treat it as a patient identifier.

## 10. Cross-project notes

- **`SummitPharma-Child-Theme`** (`c:\wamp64\www\summitpharma\wp-content\themes\summitpharma-child`) is the WooCommerce source. Its `page-checkout.php` and `LocationHandling` define the shipping methods that §6.1 turns into `shop_location`. If a location looks wrong, read the theme's checkout logic before changing the rule here.
- **`SummitPharma-AusPost`** handles AusPost fulfilment on the same site; this project does not touch it.
- If a task spans projects, log it in **each** project's `DynamicMemory.md` with the project name in the entry — don't merge the logs.

## 11. Workflow conventions

- Work goes through **`superpowers:subagent-driven-development`**: a design spec in `docs/superpowers/specs/YYYY-MM-DD-<name>-design.md`, an implementation plan in `docs/superpowers/plans/YYYY-MM-DD-<name>.md`, a ledger at `.superpowers/sdd/<plan>/progress.md` (git-ignored), a fresh implementer per task, per-task review, fix rounds, then a whole-branch review and one fix wave.
- Decisions are recorded in the spec as **`Ruling: <what> — <why> — <cost if wrong>`**.
- The spec is binding: if a task cannot satisfy it, that is a finding to report, not something to quietly redesign.
- Commits end with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- Working branch as of this writing: **`feature/medirecords-patients`** (far ahead of `main`, which sits at 2026-09-15). Migrations applied to the live database: **0001–0018**, 0017 and 0018 deployed 12 Oct 2026. Verified on production afterwards: `Shop SummitPharma` is the one store flagged `owns_counter_sales`, the partial unique index genuinely rejects a second, and a real Sales report runs — September 2026 gave Online 4,326 sales / $845,030 and ZOffice 1,734 receipts / $249,438, with the whole counter total sitting in **Unclassified** because nothing has been judged yet (which is the correct answer, not a bug).

## 12. How AI agents should use this framework

1. **At session start:** read this `Memory.md` in full once, then the last 5–10 entries of `DynamicMemory.md` (same folder).
2. **During work:** trust this file for architecture, but **verify a specific named file / function / flag still exists** before relying on it — code moves on.
3. **After completing a task:** append an entry to `DynamicMemory.md` using the template in that file.
4. **If this file goes stale:** correct it in place rather than working around the discrepancy.
5. **Framework-wide:** this project is registered in `F:\AI Memory Framework\Projects.md`; see `F:\AI Memory Framework\README.md` for the cross-project protocol. The repo's own pointer lives in `AGENTS.md`, which `CLAUDE.md` simply `@`-includes.
