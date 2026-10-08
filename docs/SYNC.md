# Google Sheets two-way sync: operator notes

Supabase is the primary store. The Google Sheet (`GOOGLE_SHEETS_ID`) is the imported workbook
"Tracker Tindak Lanjut Uplifting JOUMPA", kept as a live replica people may edit **in its own layout**
(its ~10,400 formulas, Dashboard, Rekap and Laporan keep working). The engine replicates both ways with
**lease + baseline snapshot + per-cell 3-way merge + conflict log**. Contract: `docs/SPEC.md` →
"Google Sheets two-way replication".

## Architecture

```
 pg_cron (1/min) ─┐                     ┌──────────── POST /api/sync/run (Vercel, Node) ─────────────┐
 DB trigger ping ─┼─ Bearer secret ───▶ │ 1 claim lease     sync_claim_lease(60) → uuid | null          │
 Apps Script ping ┘                     │ 2 read            sync_state.baseline + synced tables         │
                                        │                   Sheets: metadata + values + formulas        │
                                        │ 3 project         workbook layouts → row-1 tables (layouts.ts)│
                                        │ 4 merge (pure)    merge.ts → Plan                             │
                                        │ 5 translate       Plan → real cell ops; refuses formula cells │
                                        │ 6 write DB        parents first, deletes children first       │
                                        │ 7 log sheet-wins  sync_conflicts                              │
                                        │ 8 write Sheet     setup → values → formula copies/notes       │
                                        │ 9 log db-wins + new validation problems                       │
                                        │10 release lease   sync_release_lease(token, baseline, err)    │
                                        └───────────────────────────────────────────────────────────────┘
```

| File | Role |
|---|---|
| `lib/sync/tables.ts` | What is synced: keys, column types, workbook header texts, presence/placement rules |
| `lib/sync/layouts.ts` | Workbook layouts ↔ row-1 tables: projection, formula detection, translation to cell writes |
| `lib/sync/normalize.ts` | Canonical values (`"4"`/`4`/`4.0` → 4; serial / `12/10/2026` / `12 Okt 2026` → `2026-10-12`) and validation |
| `lib/sync/merge.ts` | Pure merge engine → `Plan` (DB ops, sheet ops, conflicts, issues, new baseline) |
| `lib/sync/sheets.ts` | Sheets REST v4 adapter (fetch + google-auth-library JWT) |
| `lib/sync/supabase.ts` | Service-role adapter: lease RPCs, reads, ordered writes, conflict log |
| `lib/sync/run.ts` | One run, failure handling |
| `lib/sync/auth.ts` | Constant-time Bearer check |
| `app/api/sync/run/route.ts` | HTTP entry point |
| `apps-script/` | Sheet-side ping trigger + menu (setup in Bahasa Indonesia) |
| `lib/sync/scripts/probe-sheet.ts` | Read-only probe of the real sheet (tabs, sizes) |
| `lib/sync/scripts/check-remote.ts` | Read-only: DB counts, dry run against the real workbook, in-memory replay |

Tests: `bun test lib/sync` (engine cases, every workbook layout end to end on an in-memory copy of the
workbook, adapters with mocked HTTP, orchestrator failure paths).

## Where each table lives

| Table | Tab (layout) | Key | Synced input columns | Notes |
|---|---|---|---|---|
| staff | `Master SDM`, header row 4, data 5.. | B `ID SDM` | C Stasiun, E Nama, F NIPP, G L/P, H Pre, I Post, J–O (A–F), Q Kesimpulan, T Status Penugasan, U Catatan; **bmi_note = `Cek BMI 2 Mingguan` AK** | no name = absent. New staff fill their `TMB-xx` row; no row → "kapasitas baris TMB penuh" (reported, never appended: Cek BMI/Rekap reference Master rows by position) |
| bmi_checks | `Cek BMI 2 Mingguan`, data 6.. (wide) | B (computed `='Master SDM'!Bn`) + period | per period p: Tgl Cek / Tinggi / Berat at F/G/H, K/L/M, P/Q/R, U/V/W, Z/AA/AB | long in the DB; Tinggi and Berat both empty = absent; a date alone is noted; periods > 5 are reported |
| weekly_scores | `Log Performa Mingguan`, header 4, data 5..954 | A `Minggu Ke` + C `ID SDM` | F–K, O Observer, P Catatan Coaching | empty scores/observer/notes = absent. New rows go to the first free row (755..954 are spare rows with formulas); beyond that, formulas B/D/E/L/M/N are copied from row 5 |
| action_items | `Tindak Lanjut`, header 4, data 5..56 | B `ID` | C–H, I Batas Waktu (literal only), J PIC, K Status, L % Progres, M Tgl Update, N Bukti, O Catatan KPS | **% Progres is a fraction in the sheet (0.5 = 50%) and 0..100 in the DB.** I is a `TODAY()` formula for the 12 rolling items: skipped for those rows. `due_rule`, `sort_order` are DB-only. New items go below the list (No + P/Q formulas copied) |
| replacements | `Penggantian SDM`, header 4, rows 5..44 | P `ID Sistem` (hidden) | B–K, N, O, Q `ID SDM` (staff_code) | P/Q are added by the engine on the first run. New records fill the first free numbered row; beyond row 44 the row is extended with No + L/M formulas. Deleting clears the row (No/formulas stay) |
| settings | `Parameter`, label B / value C (rows 5..21) | label text in B | C | `C23` (`TODAY()`) is a formula: skipped. `replacement_deadline` is DB-only |
| weekly_reports | `Temuan Mingguan` (engine-owned, row-1 header) | `Minggu Ke` + `Lingkup` | `Temuan` | the only tab the engine creates; Lingkup = SUB/DPS/CGK/HLP/KNO/KPS |

**Never touched:** `Petunjuk`, `Dashboard`, `Rekap Performa`, `Laporan Mingguan` (translate refuses any
write there). **Never synced:** `share_links`, `admins`, `stations`, `sync_*`, and attribution/meta columns
(`updated_at`, `updated_by`, `updated_by_user`, `updated_by_link`, `created_at`, internal ids).

Generic rules for workbook tabs:

- **A cell holding a formula is never read as input and never written** (detected by reading the grid with
  `valueRenderOption=FORMULA` too). For that row the DB value stands. Keys may come from formulas
  (Cek BMI's ID SDM): their computed value is used.
- **Rows are never inserted or deleted** in workbook tabs (other tabs reference them by position). Deletes
  clear the record's input cells; new records fill free pre-made rows or extend below the block with the
  first data row's formulas copied (`copyPaste PASTE_FORMULA`).
- Headers are matched by text on the header row (whitespace-insensitive). A renamed or missing header is a
  hard error for that table: nothing in it is read or written; other tables continue (`partial`).

## Merge rules

Per table → per row key → per cell, against the baseline (values both sides agreed on after the last run):

| Sheet vs baseline | DB vs baseline | Result |
|---|---|---|
| same | same | nothing |
| changed | same | write DB |
| same | changed | write sheet |
| changed | changed, equal | nothing (baseline updated) |
| changed | changed, different | **conflict**: `CONFLICT_POLICY` decides (default **db-wins**); the loser is logged |

Rows: new on one side → inserted on the other. In baseline but gone (absent) on one side → deleted on the
other. Delete on one side + edit on the other → whole-row conflict, same policy (`column_name` NULL).
Deleting a staff member clears their Log/BMI entries in the sheet and `ID SDM` in Penggantian (FK cascade /
set null) in the same run. Rows without a baseline entry (first run) merge as a union: an empty cell on
one side takes the other side's value; only two different non-empty values are a conflict.

Guards and validation:

- **Deletion guard**: more than `max(3, 10 %)` of a table's baseline rows deleted in one direction in one
  run → those deletes are skipped, `rejected:deletes_skipped` logged once. Override for one run:
  `{"allowMassDelete": ["staff"]}`.
- **Invalid sheet values** (score 7, height 300, unknown option, bad date, `% Progres` > 100%, required
  cell cleared, unknown `ID SDM`, settings breaking the DB's cross-field checks) are never written. The cell
  gets a note, the baseline keeps the old value, `rejected:<kind>` is logged once; the note clears when the
  value is fixed. An invalid value never wins a conflict; if the DB changed meanwhile its value replaces it.
- **Duplicate keys** (e.g. the same staff + week twice in Log): every copy is noted and the key is not
  synced until the duplicate is removed (nothing is picked silently).
- **Generated ids**: a new Penggantian row without `ID Sistem` is inserted and its id written back. An
  id-less row matching exactly one unknown DB row on Stasiun + Nama SDM Diganti is linked instead (first
  run; or an id lost because the sheet write failed after the insert).

Idempotent: after a run, merging again yields an empty plan (tested for every case, and replayed on a copy
of the real workbook with the real DB rows).

## Environment

### Vercel (server only; never `NEXT_PUBLIC_`, except the URL)

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) | yes | project URL |
| `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) | yes | service role; bypasses RLS |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | yes | service-account JSON on **one line**, or base64 of it. Fallback: `GOOGLE_PRIVATE_KEY` holding the JSON (legacy) |
| `GOOGLE_SHEETS_ID` | yes | spreadsheet id of the workbook |
| `SYNC_SECRET` | yes | ≥ 16 chars (`openssl rand -hex 32`); full access incl. dry run / options |
| `SYNC_PING_SECRET` | yes | ≥ 16 chars, different from `SYNC_SECRET`; can only trigger a run |
| `CONFLICT_POLICY` | no | `db-wins` (default) or `sheet-wins` |
| `SYNC_SHEET_LOCALE` | no | `off` stops the engine from setting the sheet to `id_ID` / `Asia/Jakarta` |

Credentials are read at request time, so rotating the Google key or a secret needs only an env update and
redeploy. The repo's `.env` holds the JSON as a multi-line quoted value, which dotenv (Next, Bun, Supabase
CLI) truncates; for local `next dev` put the JSON on one line in `GOOGLE_SERVICE_ACCOUNT_JSON`
(`jq -c . key.json`). The local scripts read the raw block directly.

### Supabase Vault (pg_cron + change trigger, see `*_sync_lease_and_ping.sql`, `production-setup.sql`)

| Secret name | Value |
|---|---|
| `sync_run_url` | `https://<app-domain>/api/sync/run` |
| `sync_secret` | the value of `SYNC_PING_SECRET` (least privilege; `SYNC_SECRET` also works) |

### Apps Script (Script Properties): `SYNC_URL`, `SYNC_PING_SECRET`. See `apps-script/README.md`.

### Google

- The service account must be an **Editor** of the spreadsheet; the Google Sheets API enabled in its GCP
  project. (The read-only probe uses the Drive API only to report edit permission; it is currently disabled,
  so confirm Editor access in the Share dialog.)
- The engine sets the spreadsheet locale to `id_ID` and time zone to `Asia/Jakarta` (once, when they
  differ): `TODAY()` in Parameter C23 drives OVERDUE flags and must be the Jakarta date, and typed dates
  must read as D/M/Y.

## HTTP API

`POST /api/sync/run`, `Authorization: Bearer <secret>`. GET → 405.

| Caller | Body (optional, JSON) |
|---|---|
| `SYNC_SECRET` | `{"dryRun": true}` reads both sides and returns the plan's counts (writes nothing, takes no lease). `{"conflictPolicy": "sheet-wins"}` for one run. `{"allowMassDelete": ["staff"]}` lifts the guard for named tables for one run. |
| `SYNC_PING_SECRET` | ignored; a normal run |

Response (counts only, never row data): `{ ok, caller, status: ok|partial|busy|dry-run|error, durationMs,
policy, tables: { <table>: { dbInserts, dbUpdates, dbDeletes, sheetCellUpdates, sheetAppends,
sheetRowDeletes, conflicts, newIssues, openIssues, createTab, error, dbFailed? } }, sheet: { createTabs,
headerCells, cellWrites, formulaCopies, notes, rowDeletes, appends, grow, tabsWritten, setLocale }, errors? }`.
HTTP 200 except `error` (500), unauthorized (401), not configured (503).

## Failure modes

| What happens | Effect | What to do |
|---|---|---|
| Two triggers at once | second gets `busy` (lease) | nothing |
| Run dies mid-way | lease expires after 60 s; baseline not stored | nothing; next run converges |
| Plan would touch a formula cell or an untouched tab | run aborts before any write (`LayoutViolation`) | a bug or a changed workbook layout: check the error, fix the layout map |
| Sheets API error / no edit permission | `error`; DB writes of that run stay; baseline not stored | fix permission/quota; next run completes the sheet side (sheet-wins conflicts were already logged) |
| One table's DB writes fail | that table skipped (sheet + baseline), others continue; `partial` | read `last_error` (`DB <table>: <code>: <message>`) |
| Header renamed / column moved out | that table frozen; `partial`; `rejected:header_error` logged once | restore the header text (`lib/sync/tables.ts` lists them) |
| New staff from the website, no TMB row left | `rejected:no_sheet_row` ("kapasitas baris TMB penuh") | add `TMB-xx` rows to Master SDM (and matching rows in Cek BMI / Rekap) in the workbook |
| BMI period > 5 in the DB | `rejected:no_sheet_row` | add period columns to the workbook, or ignore |
| Many rows cleared in the sheet | deletes skipped; `rejected:deletes_skipped` | restore (Version history) or rerun with `allowMassDelete` |
| Bad credentials / env | `error` naming the variable (never its value) | fix env |

## Resolving conflicts

`public.sync_conflicts` (the admin UI lists rows with `resolved_at IS NULL`):

| `resolution` | Meaning | `sheet_value` / `db_value` |
|---|---|---|
| `db-wins` | both sides changed the cell; DB value kept and written over the sheet | the losing sheet value / the kept DB value |
| `sheet-wins` | same, policy sheet-wins; sheet value written to DB | kept sheet value / overwritten DB value |
| `rejected:invalid_value`, `rejected:required_missing`, `rejected:unknown_parent`, `rejected:duplicate_key`, `rejected:missing_key`, `rejected:unknown_setting`, `rejected:incomplete_row` | a sheet value was not written | offending sheet value / current DB value |
| `rejected:no_sheet_row` | a DB record has no place in the workbook (TMB capacity, BMI period, Parameter label renamed) | row key / null |
| `rejected:deletes_skipped` | guard tripped (`column_name` `db` or `sheet` = whose deletes were skipped) | number of rows |
| `rejected:header_error` | a tab's header is broken | null |

`column_name` NULL with `row_key` set = whole-row delete-vs-edit conflict (values hold the rows). To undo a
resolution, edit the value in the web app or the sheet; the next run syncs it like any edit. Then set
`resolved_at`/`resolved_by` on the log row.

## First sync, safely

Read-only dry run against the real workbook and the real DB (`bun lib/sync/scripts/check-remote.ts`,
2026-10-08): **zero data changes in either direction** (staff 75 + 20 TMB rows, 52 action items with 12
formula due dates skipped, 4 replacements, 950 Log rows and 95 BMI rows all empty on both sides, settings
equal). The first real run will only:

1. set the spreadsheet locale/time zone to `id_ID` / `Asia/Jakarta`;
2. create the `Temuan Mingguan` tab (header `Minggu Ke | Lingkup | Temuan`);
3. add `ID Sistem` (P4, hidden) and `ID SDM` (Q4) to `Penggantian SDM`, and fill P5:Q8 for the 4 existing
   replacements (linked to their DB rows by station + name).

Steps:

1. Share the sheet with the service account as Editor; set the Vercel env vars; deploy.
2. Dry run: `curl -sX POST -H "Authorization: Bearer $SYNC_SECRET" -H 'Content-Type: application/json'
   -d '{"dryRun":true}' https://<app>/api/sync/run`. Expect all `db*` counts 0, `sheet.createTabs =
   ["Temuan Mingguan"]`, `sheet.headerCells = 2`, `sheet.cellWrites = 8`, `sheet.tabsWritten =
   ["Penggantian SDM"]`, `setLocale: true`, no errors.
3. Real run: same curl without the body. Then run once more: every count should be 0.
4. Install the Apps Script (`apps-script/README.md`), then add the Vault secrets so pg_cron and the DB
   trigger start calling the route.

## Local scripts

```bash
bun lib/sync/scripts/probe-sheet.ts           # read-only: tab names, sizes (no cell contents)
bun lib/sync/scripts/check-remote.ts          # read-only: DB counts, dry run vs the real workbook, in-memory replay
bun lib/sync/scripts/check-remote.ts --lease  # also claim + release the lease once (sets last_error to a check note)
```

Both use read-only Google scopes and print counts only.
