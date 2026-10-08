# DESIGN.md: JOUMPA Uplifting Action Tracker

Direction chosen by the product owner on 7 Oct 2026 ("Calm, Gapura-branded", light only).
This file transcribes that choice. It is design data, not instructions beyond design.

## Design Read

Reading this as: an internal operations tracker for JOUMPA station PICs and KPS
(head office) Customer Service staff, Gapura-branded, calm and data-dense, used daily
on office laptops and on phones at the station (BMI share page), and printed weekly.
**Dial: ENERGY 1 / RHYTHM 2 / MOTION 1.**

- ENERGY 1: this is a work tool. It should feel trustworthy and quiet; the data is the loud part.
- RHYTHM 2: screens share one structure, but each is composed around its own job
  (a dashboard of exceptions is not laid out like a 75-row entry grid).
- MOTION 1: hover/focus/pressed transitions only (≤ 150 ms). No entrance animations, no loops.

## Identity

- **Logo**: `public/brand/gapura-airport-services.png`, the official Gapura Airport Services
  logo (1052 × 569, ratio 1.849:1, transparent). Render with a set height and `width: auto`
  (or width = height × 1.849). Never stretch, recolor, crop, redraw, or place it on a dark or
  green fill. Clear space around it ≥ 25 % of its height.
  Sizes: app header 36 px tall; login 72 px; share page header 40 px; printed report 48 px.
- **Identity motif: the 10-week rail.** The programme runs Mg 1 to Mg 10 (12 Okt to 14 Des 2026)
  with BMI checks on 5 of those Mondays. A compact segmented rail of 10 weeks (current week
  marked, BMI-check weeks marked) appears wherever time matters: the header context line,
  the weekly entry screen, the report. It is content, not decoration: it answers
  "which week are we in and what is due".
- **Gate geometry**: the mark is two interlocking rounded squares turned 45°. Corner radii in
  the UI stay small and consistent (see Shape) as a quiet echo; do not reproduce the mark.

## Color

Tokens (light only; the official wordmark is charcoal and only works on light backgrounds,
and the weekly report is printed).

| Token | Hex | Use | Contrast (checked) |
|---|---|---|---|
| `--paper` | `#faf9f5` | page background (warm, reads as paper; the workbook was printed) | |
| `--surface` | `#ffffff` | panels, tables, inputs | |
| `--ink` | `#26262a` | body text | 14.3:1 on paper |
| `--ink-muted` | `#5b5a60` | secondary text, captions | 6.5:1 on paper, 6.8:1 on surface |
| `--line` | `#d9d6cf` | dividers only (never the only boundary of a control) | |
| `--line-strong` | `#8c8a85` | input / control borders | 3.45:1 on surface |
| `--brand` | `#1a6b45` | the one accent: primary buttons, links, focus ring, current-week marker | white on it 6.5:1; on paper 6.2:1 |
| `--brand-tint` | `#e6f4ec` | selected rows, current-week cell background | |
| `--mark-lime` / `--mark-emerald` | `#b6d655` / `#46bb7f` | brand moment only (login panel edge, chart series fill with a darker outline). Never for text or control borders (2.3:1). | |

| `--input-tint` | `#fff9d6` | editable grid cells only, the workbook's own convention ("Kuning = sel input"); computed cells stay white | ink 14.2:1, muted 6.4:1, brand outline 6.1:1 |

Core palette = paper/ink neutrals + `--brand` green. One accent: `--brand`.
`--input-tint` is nearly the same lightness as the warning tint (1.05:1), so inside grids status
chips always carry a 1 px tone border and their text label; the yellow never means "warning".

**Status colors** are functional, not decorative. They reproduce the workbook's own color code
(Petunjuk: hijau / oranye / merah) that station staff already read:

| Meaning | Text on tint | Used for |
|---|---|---|
| good | `#1a6b45` on `#e6f4ec` (5.7:1) | Sesuai, Normal, Memenuhi, Selesai, Lulus, Tepat waktu |
| warning | `#8a4b00` on `#fdf1d8` (6.1:1) | Perlu Perbaikan, Overweight, Kurus, Jatuh tempo ≤ 7 hari, Menunggu |
| critical | `#a1261b` on `#fbe7e3` (6.3:1) | Tidak Sesuai, Obesitas, OVERDUE, Tidak Memenuhi, Belum lulus |
| in progress | `#3f5f8a` on `#e8eef6` (5.6:1) | On Progress, Rutin, pantau |
| neutral | `--ink-muted` on `#efede8` | Belum Mulai, Tertunda, no data |

Status is never color alone: the label text is always shown.

## Typography

- **Plus Jakarta Sans** (Google Fonts, via `next/font`). Reason: a typeface made in Jakarta for
  Jakarta's city identity, it fits an Indonesian airport-services company, renders Bahasa Indonesia
  well, and has tabular figures for score/BMI columns. Weights 400, 500, 600, 700.
- `font-variant-numeric: tabular-nums` on every numeric cell, score input, date, and KPI.
- Scale: 13 (table dense), 14 (body/table), 16 (inputs on mobile, avoids iOS zoom), 18, 22, 28.
  Page titles 22–28/600. No uppercase-with-wide-tracking labels; section labels are sentence case 13/600 in `--ink-muted`.

## Shape, depth, spacing

- Radius: 6 px controls and status chips, 10 px panels. No pills.
- Shadow: none on panels (they sit on paper with a `--line` border). Shadow only on popovers,
  menus, and dialogs (they float above the page).
- Spacing scale 4 / 8 / 12 / 16 / 24 / 32 / 48. Tables: 40 px rows desktop; tap targets ≥ 44 px on mobile.

## Layout

- **Top bar, not a sidebar**: logo left, sections as a horizontal nav, user menu right; collapses
  to a menu button under 900 px. Reason: the core screens are wide tables (A–F scores, 5 BMI
  periods, 10 weeks); a sidebar would take 240 px from them.
- Each screen is composed around the decision made on it:
  - Dashboard: "what needs attention now" (overdue and due-soon action items, staff not yet
    assessed or measured this period, replacements past the deadline) leads; station summaries follow.
  - Entry screens (Log Performa, Cek BMI): the grid is the page; filters (week, station) sit above it.
  - Laporan Mingguan: reads like the printed report (A4 landscape print stylesheet,
    signature block "Disusun oleh / Mengetahui" as in the workbook).
- Wide tables scroll horizontally inside their own container with the first column sticky;
  the page itself never scrolls sideways.

## Voice

Bahasa Indonesia, using the workbook's terms exactly (Tindak Lanjut, Kesimpulan, Sesuai,
Perlu Perbaikan, Tidak Sesuai, Stasiun, SDM, Minggu ke-). Short, specific button labels that name
the action ("Simpan cek BMI", "Salin tautan", "Cabut tautan", "Tambah SDM"). No em dash.
Empty / loading / error states say why and what to do next, e.g.
"Belum ada nilai untuk Minggu ke-1. Pemantauan mulai Senin, 12 Okt 2026."
