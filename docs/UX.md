# UX.md: JOUMPA Uplifting Action Tracker, usability redesign (8 Oct 2026)

Owner request: "make the dashboard and all UI/UX on every role and screen more user friendly;
best, most comfortable UX; a clearer dashboard; make BMI and other data entry easier, e.g. with
Excel-like tables." This file turns that into rules every engineer follows. DESIGN.md still sets
the visual direction (calm, Gapura-branded, light, ENERGY 1 / RHYTHM 2 / MOTION 1); this file sets
how screens behave.

## 1. Mental model: it is the workbook, made easier

The team already knows the Excel workbook. Every role sees the same "sheets", named as in the
workbook, so nothing has to be relearned:

| Tab (nav label) | Workbook sheet | Owner | KPS link | Station link |
|---|---|---|---|---|
| Dashboard | Dashboard | all stations | all stations | own station |
| Master SDM | Master SDM | CRUD | edit, add | edit, add (own) |
| Log Performa | Log Performa Mingguan + Rekap Performa | CRUD | CRUD | CRUD (own) |
| Cek BMI | Cek BMI 2 Mingguan | CRUD | CRUD | CRUD (own) |
| Tindak Lanjut | Tindak Lanjut | CRUD incl. add/delete items | update + KPS fields | update (own group) |
| Penggantian SDM | Penggantian SDM | CRUD | CRUD | CRUD (own) |
| Laporan Mingguan | Laporan Mingguan | all + print | all + print | own + print |
| Tautan, Parameter, Sinkronisasi | Parameter | owner only | | |

Owner area routes live under `/admin/*`, station workspace under `/s/[token]/*`. Same screen
components, one `access` prop decides scope, base path and which actions exist.

**Workbook colour code, kept on purpose** (Petunjuk sheet: "Kuning = sel input, Putih = rumus
otomatis"): editable cells have a soft yellow input tint, computed cells (Rata-rata, Status, BMI,
Kategori, Flag, Sisa hari) are plain white/grey and read-only. A short legend sits above every
grid. Status colours stay the workbook's hijau / oranye / merah, always with the text label.

## 2. Spreadsheet grid for every bulk entry (desktop and tablet ≥ 900 px)

One shared `DataGrid` component, used by Log Performa, Cek BMI, Master SDM, Tindak Lanjut and
Penggantian SDM. It must feel like Excel / Google Sheets:

- **Freeze panes**: sticky header row(s) and sticky ID + Nama columns. Column groups with a
  group header (e.g. Cek BMI: "Cek ke-1 (12 Okt)" over Tgl / TB / BB / BMI / Kategori, five groups
  side by side like the workbook; the current period's group is highlighted and scrolled into view).
- **Selection and keys**: click or arrow keys move the active cell; typing starts editing and
  replaces the value; Enter or F2 edits; Enter commits and moves down; Tab / Shift+Tab move
  right / left; Esc cancels the edit; Delete / Backspace clears the selected cells; Home / End
  jump within the row. Visible active-cell outline (brand colour, 2 px), never colour-only.
- **Paste from Excel / Google Sheets**: Ctrl/Cmd+V of a copied block (tab-separated rows) fills
  cells from the active cell, validated per cell; Ctrl/Cmd+C copies the selection as TSV.
- **Cell editors by type**: number (decimal comma accepted, numeric keypad), score 1–5, date
  (type `12/10/2026` or pick), dropdown for enums (L/P, status, kesimpulan, Ya/Belum, scope),
  long text opens a small editor popover.
- **Validation**: invalid cells get a red outline + message on focus/hover and are not saved;
  the rest of the row still saves. Ranges come from the DB checks (score 1–5, TB 120–210, BB 30–200,
  progress 0–100).
- **Saving: automatic, per row**, a short moment after the last committed cell (and on leaving the
  row). A narrow status column at the row start shows saving / saved / error (icon + text for
  screen readers). Nothing typed is ever lost on an error; a retry control appears. A "Belum
  tersimpan: N baris" counter sits in the grid toolbar. Leaving the page with unsaved rows asks first.
- **Toolbar**: station filter (KPS/owner: tabs "Semua stasiun · SUB · DPS · CGK · HLP · KNO"),
  search by name or ID, week / period picker where relevant, legend, "Tambah baris" where adding
  is allowed, and a count ("75 SDM · 12 sudah dinilai").
- **Delete**: row-level "Hapus" with confirmation; for scores / BMI, clearing all input cells of
  a row deletes that entry after a confirmation.
- Accessible: ARIA grid roles, every cell reachable by keyboard, labels announced
  ("SUB-01, Abdullah, B Grooming"), focus visible.

**Phones (< 900 px)**: a 15-column grid is not usable on a phone. Show the same data as one card
per staff / item with large inputs (44 px), saving per card, same validation and status. Cek BMI on
a phone at the station is the main mobile flow: one staff card at a time is fine, with "Simpan &
berikutnya".

## 3. Dashboard: clear at a glance

The Dashboard answers three questions, in this order:
1. **Where are we in the programme?** WeekRail + "Minggu ke-N dari 10, cek BMI berikutnya 26 Okt".
2. **What needs action now?** The "Perlu ditangani" list (overdue / due ≤ 7 days, staff not yet
   scored this week, staff not yet measured this period, replacements at risk), each item a link.
3. **How is each station doing?** A compact comparison, one row per station: SDM dinilai minggu ini
   (n/m with a bar), rata-rata skor vs baseline, % Sesuai, BMI tercek periode ini (n/m), Tindak
   Lanjut selesai (n/13) and OVERDUE count. Every cell links to the filtered sheet.

Above those, a KPI strip of at most 5 tiles with real numbers only (e.g. Tindak Lanjut selesai
0/52, OVERDUE 0, SDM dinilai minggu ini 0/75, cek BMI periode ini 0/75, penggantian tepat waktu
0/4). Each tile states its comparison basis in words, links to its sheet, and never shows an
invented delta. Before the programme starts, the strip says so instead of showing zeros as if
they were results. The detailed workbook tables (sections 1–4) stay available below, collapsed
or in a "Detail" tab.

## 4. Comfort details that apply everywhere
- One-line "Cara mengisi" tip at the top of each entry sheet (from the workbook's Petunjuk), dismissible.
- Remember per browser: last station filter, last week/period, dismissed tips (guarded localStorage).
- Dates shown as `12 Okt 2026`; numbers with comma decimals; tabular figures in grids.
- Loading: skeleton rows that match the grid, plus text. Empty states: why + next action.
- Every change shows who made it last ("Diubah lewat tautan SUB, 8 Okt 07.55" or "pemilik").
- Speed: the grid must stay smooth with 75 rows × 30 columns (memoised rows, no full re-render on
  each keystroke).
