# JOUMPA Uplift Tracker: build spec

Source of truth for every agent working on this repo. The source workbook is
`Tracker Tindak Lanjut Uplifting JOUMPA.xlsx` in the repo root (gitignored: it holds
real employee names, so it never leaves this machine except as seed data pushed to
our own Supabase project).

## Domain in one paragraph

PT Gapura Angkasa, Customer Service Division. JOUMPA (meet & assist) staff at five
stations (SUB, DPS, CGK, HLP, KNO) attended "Uplifting Service" training on 1–3 Oct 2026.
Four training reports were written (CGK and HLP share one report, "CGK & HLP").
The tracker follows 75 staff for 10 weeks starting Monday 12 Oct 2026: weekly practice
scores (aspects A–F, 1–5), a BMI/height/weight check every 2 weeks (5 periods), 52
follow-up action items (13 per report), and staff replacements (deadline 31 Oct 2026).

UI language: **Bahasa Indonesia**, reusing the workbook's own terms
(Tindak Lanjut, Kesimpulan, Sesuai / Perlu Perbaikan / Tidak Sesuai, Stasiun, SDM).
Dates shown as `12 Okt 2026`. Time zone for "today": `Asia/Jakarta`.

## Stack

- Next.js 16 (App Router, `cacheComponents: true`), React 19, TypeScript, Tailwind v4, bun.
  **Next 16 differs from training data. Read `node_modules/next/dist/docs/` before writing Next code.**
- Supabase (Postgres + Auth). Local dev via `supabase start` (Docker). Production: a new
  Supabase project in a new org (NOT the "Gapura IAP" org). Hosting: Vercel.
- Tests: `bun test` for pure TS logic; SQL tests for RLS/RPC security.

## Access model (the important part)

**Decision 7 Oct 2026 (owner): stations and KPS never log in.** All day-to-day work happens
through station links. Only the system owner has an account.

1. **Station links** (`/s/<token>`), no account, no login. Scopes:
   `SUB`, `DPS`, `CGK`, `HLP`, `KNO` (that station only) and `KPS` (head office: all stations).
   A link opens a workspace for its scope: dashboard, weekly report, and every input:
   - weekly practice scores A–F + observer + coaching notes (`weekly_scores`)
   - BMI checks (`bmi_checks`), L/P, BMI programme note
   - action-item progress for the link's report group(s): status, % progress, update date,
     evidence (`action_items`). A `CGK` or `HLP` link works on the `CGK & HLP` items.
   - replacements for its station (`replacements`): add, edit, remove
   - staff of its station (`staff`): add new staff (TMB / pengganti), edit name, NIPP, L/P,
     assignment status, notes
   - weekly findings for its scope (`weekly_reports`, keyed by week + scope)
   **KPS-only** (scope `KPS`): `action_items.kps_notes`, action-item definitions (area, action,
   target, schedule, due date/rule, PIC), staff training baseline (pre/post-test, A–F,
   report_conclusion), and everything for every station.
   A station link can never read or write another station's data.
2. **Owner (admin)** signs in with Supabase Auth (row in `public.admins`; public sign-up off).
   Decision 8 Oct 2026 (owner): the admin area is the **full workbook for all stations** with
   CRUD, not only link management. Owner nav uses the workbook's sheet names: Dashboard,
   Master SDM, Log Performa, Cek BMI, Tindak Lanjut, Penggantian SDM, Laporan Mingguan, then
   Tautan, Parameter, Sinkronisasi. The same screens as the station workspace, default filter
   "Semua stasiun". Writes go through the same `share_*` functions: a signed-in admin calling
   them with `p_token = NULL` is treated as scope KPS with `updated_by_link = NULL` ("pemilik").
   Owner-only extras (not for KPS or station links): delete staff, create / delete action items
   (direct table writes under the admin RLS policy).
3. Links are bearer credentials (treat like a password). Every write records `updated_by_link`
   and the UI shows which link last changed a row. Revoke = immediate. Rotate = revoke + new link.
4. Enforcement lives in the database, not the UI:
   - RLS on every table. Only `is_admin()` passes. No policies for `anon`.
   - `anon` has no table privileges at all.
   - Share-link access goes only through `SECURITY DEFINER` RPCs that take the token,
     check it (exists, not revoked), and filter by scope inside the function.
   - Tokens: 24 random bytes, hex (48 chars). Stored in `share_links.token`, readable by admins
     only (so an admin can copy the link again). Revoking sets `revoked_at`.
   - `/s/*` responses send `Referrer-Policy: no-referrer` and `noindex`.

## Data model (public schema)

Stored data is raw input only. Everything derived (averages, BMI, categories, statuses,
flags) is computed by `lib/rules.ts` so the admin pages and share page agree.

```
stations        code text PK ('SUB','DPS','CGK','HLP','KNO'), report_group text, sort smallint
settings        id smallint PK (=1). week1_start date, weeks smallint,
                bmi_first_check date, bmi_interval_days smallint, bmi_periods smallint,
                bmi_underweight_below numeric, bmi_normal_max numeric, bmi_overweight_max numeric,
                min_height_female numeric NULL, min_height_male numeric NULL,
                pass_avg_min numeric, improve_avg_min numeric, posttest_min numeric,
                replacement_deadline date, updated_at
staff           code text PK ('SUB-01', added staff 'TMB-01'...), station text FK, name text,
                nipp text, gender text ('L'|'P'|NULL), pre_test numeric, post_test numeric,
                score_a..score_f smallint 1–5 (training baseline),
                report_conclusion text ('Sesuai'|'Sesuai dengan Catatan'|'Perlu Perbaikan'|'Tidak Sesuai'|NULL),
                assignment_status text ('Aktif'|'Coaching 30 Hari'|'Diganti'|'Ditarik') default 'Aktif',
                notes text, bmi_note text, sort_order int, created_at, updated_at
weekly_scores   id identity, staff_code FK cascade, week smallint 1–20, score_a..score_f smallint 1–5 NULL,
                observer text, coaching_notes text, updated_at, updated_by uuid.
                UNIQUE(staff_code, week)
bmi_checks      id identity, staff_code FK cascade, period smallint 1–10, check_date date,
                height_cm numeric(5,1) NOT NULL 120–210, weight_kg numeric(5,1) NOT NULL 30–200,
                updated_at, updated_by_user uuid NULL, updated_by_link uuid NULL FK share_links.
                UNIQUE(staff_code, period)
action_items    code text PK ('SUB-TL01'), report_group text, area, action, target text,
                kind text ('Sekali'|'Rutin'), schedule text, due_date date, pic text,
                status text ('Belum Mulai'|'On Progress'|'Selesai'|'Tertunda') default 'Belum Mulai',
                progress smallint 0–100 default 0, updated_on date, evidence text, kps_notes text,
                due_rule text NULL ('bulanan-tgl-5'|'cek-bmi-berikutnya'|'jumat-berikutnya'):
                12 items (TL10/TL12/TL13) have rolling due dates in the workbook (from TODAY());
                rules.effectiveDueDate() uses due_rule when set, else due_date.
                sort_order int, updated_at
replacements    id identity, report_group text, station text, staff_code text NULL FK staff (set null),
                replaced_name text NOT NULL, reason text,
                withdrawn_on date, replacement_name text, effective_on date, training_on date,
                post_test numeric, practice_avg numeric, reported text ('Ya'|'Belum'|NULL),
                notes text, sort_order int, updated_at
weekly_reports  week smallint, scope text ('SUB'|'DPS'|'CGK'|'HLP'|'KNO'|'KPS'), findings text,
                updated_at, updated_by_link. PK (week, scope)        (Laporan Mingguan section E)
(all mutable data tables also carry updated_by_link uuid NULL FK share_links, set by trigger/RPC)
share_links     id uuid PK, token text UNIQUE, scope text ('SUB','DPS','CGK','HLP','KNO','KPS'),
                label text, created_by uuid, created_at, revoked_at, last_used_at
admins          user_id uuid PK FK auth.users, email text, created_at
```

`report_group`: CGK and HLP → `'CGK & HLP'`; others equal the station code.

### Share-link RPCs (granted to anon + authenticated)

All `SECURITY DEFINER`, `SET search_path = ''`. Errors raise with message
`invalid_link` (unknown or revoked token) or `out_of_scope` (staff not in link scope).

- `share_open(p_token text) returns jsonb`
  `{ scope, label, settings: {bmi_first_check, bmi_interval_days, bmi_periods,
  bmi_underweight_below, bmi_normal_max, bmi_overweight_max, min_height_female, min_height_male},
  staff: [{ code, name, station, gender, assignment_status, bmi_note,
  checks: [{ period, check_date, height_cm, weight_kg, updated_at }] }] }`.
  Touches `last_used_at`. Returns no scores, NIPP, test results, or notes other than `bmi_note`.
- `share_save_check(p_token, p_staff_code, p_period, p_check_date, p_height_cm, p_weight_kg) returns jsonb`
  Upsert on (staff_code, period). Both height and weight NULL deletes that period's row.
- `share_save_profile(p_token, p_staff_code, p_gender, p_bmi_note) returns jsonb`

## Rules ported from the workbook (`lib/rules.ts`)

Defaults come from sheet `Parameter`. Ranges/thresholds always read from `settings`.

| Rule | Workbook source | Definition |
|---|---|---|
| practiceAvg | Master SDM P, Log L | mean of the non-empty A–F scores, rounded to 2 dp; null if none |
| criteriaStatus | Master SDM R, Rekap S | avg null → null; avg < improve_avg_min (3) → Tidak Sesuai; avg ≥ pass_avg_min (4) AND (post_test null OR ≥ posttest_min 80) → Sesuai; else Perlu Perbaikan |
| consistency | Master SDM S | both present: first 6 chars of report_conclusion and criteriaStatus equal → OK, else needs verification ("Beda") |
| weeklyStatus | Log M | like criteriaStatus without the post-test term |
| weekStart(n) | Log B | week1_start + (n−1)·7 days |
| rekap per staff | Rekap F–T | per-week avg; latest = last week with a score; gain = latest − baseline avg; weeks assessed; current status = criteriaStatus(latest, staff.post_test); trend up/down/same by sign of gain |
| bmi | BMI I | round(weight / (height/100)², 1) |
| bmiCategory | BMI J | < 18.5 Kurus; ≤ 25 Normal; ≤ 27 Overweight; else Obesitas |
| latest height/weight/bmi/category | BMI AE–AI | value from the highest period that has one |
| weightDelta | BMI AG | latest weight − first recorded weight |
| heightRequirement | BMI AJ | latest height or gender missing → null; min for gender missing → "standard not set"; ≥ min → Memenuhi else Tidak Memenuhi |
| bmiCheckDate(p) | BMI F4 | bmi_first_check + interval·(p−1) |
| bmiPeriodForWeek(w) | Laporan C6 | min(bmi_periods, floor((w+1)/2)) |
| daysLeft | TL P | null if no due date or status Selesai; due − today |
| actionFlag | TL Q | Selesai → Selesai; no due → null; daysLeft < 0 → OVERDUE; ≤ 7 → due within 7 days; kind Rutin → routine; else On Track |
| replacementPass | Penggantian L | no replacement name → null; post_test or practice_avg missing → not yet assessed; post_test ≥ 80 AND avg ≥ 4 → Lulus; else Belum lulus |
| replacementTimeliness | Penggantian M | no replaced name → null; no effective date → today > deadline ? OVERDUE : Menunggu; effective ≤ deadline → Tepat waktu; else late |

Aggregations for Dashboard (sections 1–4) and Laporan Mingguan (sections A–D) live in
`lib/aggregate.ts` and must reproduce the workbook's cached values on the seed data
(e.g. baseline avg all staff 3.3993; report conclusions Sesuai* 21 / Perlu 51 / Tidak 3;
criteria Sesuai 3; "Beda" 20; action items 52, all Belum Mulai, 8 due within 7 days as of 7 Oct 2026).

## Known data issues to surface in the UI (not silently fix)

- L/P empty for all 75 staff; min heights empty in settings → height requirement inactive.
- 20 staff with report conclusion ≠ criteria 6.2 ("Beda – verifikasi").
- KNO-12 and KNO-13 share the same NIPP.

## Google Sheets two-way replication

Supabase is the primary store. One Google Sheet (`GOOGLE_SHEETS_ID`) is a live replica that
people may edit. Edits on either side reach the other. Same pattern the team already runs in
the "Gapura IAP" project: **lease + baseline snapshot + per-cell 3-way merge + conflict log**.

- **Engine**: `lib/sync/` (pure, unit-tested merge logic) + `app/api/sync/run/route.ts`
  (Node runtime). Auth: `Authorization: Bearer $SYNC_SECRET`. Talks to Sheets with the Google
  service account (`GOOGLE_SERVICE_ACCOUNT_JSON`, a single-line JSON env var; `.env` currently has it
  as `GOOGLE_PRIVATE_KEY`) and to Postgres with `SUPABASE_SERVICE_ROLE_KEY` (server only).
- **When it runs** (any of these, the lease makes overlapping calls harmless):
  1. `pg_cron` every minute → `pg_net` POST to `/api/sync/run` (URL + secret kept in Supabase Vault).
  2. DB change: AFTER STATEMENT trigger on synced tables → debounced `pg_net` ping (≥ 10 s apart).
  3. Sheet edit: Apps Script installable `onEdit` → POST ping. The script only holds
     `SYNC_PING_SECRET`, which can trigger a run and nothing else. Menu "JOUMPA → Sinkronkan sekarang".
- **Lease**: `sync_state` row (lease_token, lease_until 60 s). One run at a time.
- **Merge** per table, per row key, per cell, against `sync_state.baseline` (last synced values):
  only sheet changed → write DB; only DB changed → write sheet; both changed to the same value →
  nothing; both changed differently → conflict: apply `CONFLICT_POLICY` (default, user decision: **database / website wins**; the losing sheet value is logged and overwritten),
  log to `sync_conflicts` (table, row key, column, baseline, sheet value, db value, resolution).
  New row on one side → insert on the other. Row gone from one side but in baseline → delete on the other.
- **Guards**: a run that would delete more than max(3 rows, 10 %) of a table skips that table's deletes
  and logs an error (protects against a cleared tab). Sheet values that fail validation (score 7,
  height 300) are not written; they are logged and get a cell note, and baseline stays unchanged.
  A sheet row whose non-key cells are all empty counts as absent (lets the sheet keep pre-filled
  entry rows for every staff × week / staff × period).
- **Tabs = the existing imported workbook** (decision 7 Oct 2026; the sheet already holds the
  workbook with ~10,400 live formulas and no new data). The engine syncs only the input columns of
  `Master SDM`, `Log Performa Mingguan`, `Cek BMI 2 Mingguan` (wide: 5 periods per row),
  `Tindak Lanjut` (progress is a 0..1 fraction there), `Penggantian SDM` (+ columns P `ID Sistem`,
  Q `ID SDM`), `Parameter` (label/value rows). A cell holding a formula is never read or written,
  so Dashboard, Rekap Performa and Laporan Mingguan keep working inside Sheets. The only tab the
  engine creates is `Temuan Mingguan` (Minggu Ke, Lingkup, Temuan). New staff fill the pre-made
  TMB-01..20 rows (capacity limit: 20 added staff).
- **Never synced**: `share_links`, `admins`, `sync_*` tables.
- Admin UI shows last sync time, last error, and open conflicts.

Extra tables:
```
sync_state      id boolean PK (=true), baseline jsonb, initialized bool, lease_token uuid,
                lease_until timestamptz, last_success_at, last_error text, failures int, last_ping_at
sync_conflicts  id identity, created_at, table_name, row_key text, column_name, baseline jsonb,
                sheet_value jsonb, db_value jsonb, resolution text, resolved_at, resolved_by
```

## Brand

Official logo: `public/brand/gapura-airport-services.png` (1052 × 569, ratio 1.849:1, transparent).
Never stretch, recolor, redraw, or crop it; always render with the height set and width auto.
Colors sampled from it: mark gradient lime `#b6d655` → emerald `#46bb7f`, wordmark charcoal `#4d4c4f`.

## Pages

Station workspace (no login, scope from the link): `/s/[token]` Ringkasan (dashboard),
`/s/[token]/performa` (weekly entry + rekap), `/s/[token]/bmi`, `/s/[token]/tindak-lanjut`,
`/s/[token]/penggantian`, `/s/[token]/sdm`, `/s/[token]/laporan` (week selector, printable).
Same screens for every scope; KPS sees all stations with a station filter, station links see one.

Owner area (login): `/login`, `/admin` (links: create, copy, revoke, rotate, last used),
`/admin/pengaturan` (settings), `/admin/sinkronisasi` (sync status + conflicts).
`/` redirects to `/admin` for the owner; there is no other public page.

### Link RPC surface (all `share_*`, token first, SECURITY DEFINER, scope-checked in SQL)

Reads: `share_open(token)` → `{scope, label, stations[], settings, staff[], weekly_scores[],
bmi_checks[], action_items[], replacements[], weekly_reports[], link_labels{id→label}}`, all
filtered to scope (KPS = everything). Station scope never receives other stations' rows.
Writes: `share_save_weekly_score`, `share_save_check`, `share_save_profile`,
`share_update_action_item`, `share_save_replacement`, `share_delete_replacement`,
`share_save_staff` (insert/update within scope), `share_save_weekly_report`. KPS-only fields
raise `forbidden_field` for station scopes.
