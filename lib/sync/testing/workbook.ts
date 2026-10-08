/**
 * An in-memory copy of the JOUMPA workbook layout (values + formulas + notes), built from DB rows, and
 * a world that syncs it exactly like the route: project -> merge -> translate -> apply.
 * Mirrors the real sheet's structure (header rows, formula columns, TMB rows, spare Log rows,
 * pre-numbered Penggantian slots, Parameter labels) with synthetic data only.
 */
import { a1Column } from "../sheets";
import { countOps, projectAll, translate, type RealOps, type RealSnapshot, type RealTab } from "../layouts";
import { finalizeBaseline, merge } from "../merge";
import { isoToSerial } from "../normalize";
import { SETTINGS_ENTRIES, SYNC_TABLES } from "../tables";
import { FakeDb } from "./fakes";
import type { Baseline, ConflictPolicy, DbSnapshot, Plan, SyncTable, TableSpec } from "../types";

interface Cell {
  v: unknown;
  f?: string;
}

interface BookTab {
  sheetId: number;
  grid: (Cell | undefined)[][];
  notes: Map<string, string>;
  hiddenCols: Set<number>;
  rowCount: number;
}

/** "AK" -> 36 */
export function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseA1(a1: string): { row: number; col: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(a1)!;
  return { col: colIndex(m[1]), row: Number(m[2]) };
}

export class FakeWorkbook {
  tabs = new Map<string, BookTab>();
  locale = "en_US";
  timeZone = "America/Los_Angeles";
  /** Every tab a write landed in (values, notes, headers, formulas, deletes, appends). */
  written = new Set<string>();
  private nextId = 1;

  /** A copy of a real snapshot (values + formulas), e.g. to replay a sync of the real sheet in memory. */
  static fromSnapshot(real: RealSnapshot): FakeWorkbook {
    const b = new FakeWorkbook();
    b.locale = real.locale ?? b.locale;
    b.timeZone = real.timeZone ?? b.timeZone;
    for (const [title, t] of Object.entries(real.tabs)) {
      if (!t) continue;
      b.addTab(title, t.rowCount);
      const rows = Math.max(t.values.length, t.formulas.length);
      for (let r = 1; r <= rows; r++) {
        const width = Math.max(t.values[r - 1]?.length ?? 0, t.formulas[r - 1]?.length ?? 0);
        for (let c = 0; c < width; c++) {
          const v = t.values[r - 1]?.[c];
          const f = t.formulas[r - 1]?.[c];
          const isF = typeof f === "string" && f.startsWith("=") && f !== v;
          if (isF || (v !== "" && v !== undefined && v !== null)) b.setAt(title, r, c, v, isF ? (f as string) : undefined);
        }
      }
    }
    return b;
  }

  addTab(title: string, rowCount = 1000) {
    this.tabs.set(title, { sheetId: this.nextId++, grid: [], notes: new Map(), hiddenCols: new Set(), rowCount });
    return this;
  }

  private tab(title: string) {
    const t = this.tabs.get(title);
    if (!t) throw new Error(`no tab ${title}`);
    return t;
  }

  set(title: string, a1: string, v: unknown, f?: string) {
    const { row, col } = parseA1(a1);
    this.setAt(title, row, col, v, f);
  }

  setAt(title: string, row: number, col: number, v: unknown, f?: string) {
    const t = this.tab(title);
    while (t.grid.length < row) t.grid.push([]);
    t.grid[row - 1][col] = v === undefined && !f ? undefined : { v, f };
  }

  get(title: string, a1: string): unknown {
    const { row, col } = parseA1(a1);
    return this.tab(title).grid[row - 1]?.[col]?.v ?? "";
  }

  formula(title: string, a1: string): string | undefined {
    const { row, col } = parseA1(a1);
    return this.tab(title).grid[row - 1]?.[col]?.f;
  }

  note(title: string, a1: string): string | undefined {
    const { row, col } = parseA1(a1);
    return this.tab(title).notes.get(`${row}:${col}`);
  }

  hidden(title: string, letters: string): boolean {
    return this.tab(title).hiddenCols.has(colIndex(letters));
  }

  /** First data row (from `from`) whose column `letters` equals `value`. */
  findRow(title: string, letters: string, value: unknown, from = 1): number {
    const t = this.tab(title);
    const c = colIndex(letters);
    for (let r = from; r <= t.grid.length; r++) if (t.grid[r - 1]?.[c]?.v === value) return r;
    throw new Error(`${title}: no ${letters}=${String(value)}`);
  }

  snapshot(): RealSnapshot {
    const tabs: RealSnapshot["tabs"] = {};
    for (const [title, t] of this.tabs) {
      const last = lastUsed(t.grid);
      const values = t.grid.slice(0, last).map((r) => trimRow((r ?? []).map((c) => (c ? (c.v ?? "") : ""))));
      const formulas = t.grid.slice(0, last).map((r) => trimRow((r ?? []).map((c) => (c ? (c.f ?? c.v ?? "") : ""))));
      const tab: RealTab = { title, sheetId: t.sheetId, values, formulas, rowCount: t.rowCount, columnCount: 40 };
      tabs[title] = tab;
    }
    return { tabs, locale: this.locale, timeZone: this.timeZone };
  }

  /** Same order and semantics as GoogleSheets.apply. Refuses to overwrite a formula cell. */
  apply(ops: RealOps, ids: Map<number, number | string>, skip: Set<string> = new Set()) {
    const keep = <T extends { table: string }>(xs: T[]) => xs.filter((x) => !skip.has(x.table));
    this.locale = "id_ID";
    this.timeZone = "Asia/Jakarta";
    for (const c of keep(ops.createTabs)) {
      if (!c.exists) this.addTab(c.tab);
      const t = this.tab(c.tab);
      t.grid = [c.header.map((h) => ({ v: h }))];
      this.written.add(c.tab);
    }
    for (const h of keep(ops.headerCells)) {
      this.guard(h.tab, h.row, h.col);
      this.setAt(h.tab, h.row, h.col, h.text);
      if (h.hide) this.tab(h.tab).hiddenCols.add(h.col);
      this.written.add(h.tab);
    }
    for (const g of keep(ops.grow)) this.tab(g.tab).rowCount = Math.max(this.tab(g.tab).rowCount, g.rowCount);
    for (const w of keep(ops.writes)) {
      let value = w.value;
      if (w.ref !== undefined) {
        const id = ids.get(w.ref);
        if (id === undefined) continue;
        value = Number(id);
      }
      this.guard(w.tab, w.row, w.col);
      if (w.row > this.tab(w.tab).rowCount) throw new Error(`${w.tab}: row ${w.row} beyond grid`);
      this.setAt(w.tab, w.row, w.col, value === "" ? undefined : value);
      this.written.add(w.tab);
    }
    for (const f of keep(ops.formulaCopies)) {
      for (const c of f.cols) {
        const src = this.tab(f.tab).grid[f.fromRow - 1]?.[c]?.f;
        if (src) this.setAt(f.tab, f.toRow, c, "", src.replace(new RegExp(`(?<=[A-Z])${f.fromRow}\\b`, "g"), String(f.toRow)));
      }
      this.written.add(f.tab);
    }
    for (const n of keep(ops.notes)) {
      const t = this.tab(n.tab);
      if (n.text) t.notes.set(`${n.row}:${n.col}`, n.text);
      else t.notes.delete(`${n.row}:${n.col}`);
      this.written.add(n.tab);
    }
    for (const d of keep(ops.deleteRows)) {
      const t = this.tab(d.tab);
      for (const r of [...d.rows].sort((a, b) => b - a)) t.grid.splice(r - 1, 1);
      this.written.add(d.tab);
    }
    for (const a of keep(ops.appends)) {
      const t = this.tab(a.tab);
      t.grid.length = lastUsed(t.grid);
      for (const row of a.rows) t.grid.push(row.map((v) => (v === "" ? undefined : { v })));
      this.written.add(a.tab);
    }
  }

  private guard(tab: string, row: number, col: number) {
    const f = this.tabs.get(tab)?.grid[row - 1]?.[col]?.f;
    if (f) throw new Error(`write to formula cell ${tab}!${a1Column(col)}${row}`);
  }
}

function lastUsed(grid: (Cell | undefined)[][]): number {
  for (let i = grid.length - 1; i >= 0; i--) {
    if ((grid[i] ?? []).some((c) => c && (c.f || (c.v !== undefined && c.v !== "")))) return i + 1;
  }
  return 0;
}

function trimRow(row: unknown[]): unknown[] {
  const out = [...row];
  while (out.length && (out[out.length - 1] === "" || out[out.length - 1] === undefined)) out.pop();
  return out.map((v) => (v === undefined ? "" : v));
}

// ------------------------------------------------------------------ builder

export interface WorkbookOptions {
  /** TMB rows after the staff rows in Master SDM (and Cek BMI). */
  tmb?: number;
  /** Weeks pre-made in Log Performa Mingguan. */
  weeks?: number;
  /** Spare formula rows below the Log block. */
  logSpare?: number;
  /** Pre-numbered rows in Penggantian SDM. */
  replacementSlots?: number;
  /** Penggantian SDM already has the engine's ID Sistem / ID SDM columns (P, Q), filled. */
  withIdColumns?: boolean;
}

const serial = (iso: unknown) => (typeof iso === "string" && iso ? isoToSerial(iso) : undefined);
const blank = (v: unknown) => (v === null || v === undefined ? undefined : v);
type Row = Record<string, unknown>;

/** The workbook as imported: same data as the DB, native layout. */
export function buildWorkbook(db: DbSnapshot, opts: WorkbookOptions = {}): FakeWorkbook {
  const { tmb = 3, weeks = 2, logSpare = 4, replacementSlots = 6 } = opts;
  const b = new FakeWorkbook();
  const staff = [...((db.staff ?? []) as Row[])].sort((x, y) => Number(x.sort_order ?? 0) - Number(y.sort_order ?? 0));
  const settings = ((db.settings ?? [])[0] ?? {}) as Row;

  for (const t of ["Petunjuk", "Dashboard"]) b.addTab(t);
  b.set("Petunjuk", "A1", "PETUNJUK PENGGUNAAN");
  b.set("Dashboard", "A1", "DASHBOARD");
  b.set("Dashboard", "B7", 0, "=COUNTIFS('Tindak Lanjut'!C:C,A7)");

  // ---- Parameter: label B, value C
  b.addTab("Parameter");
  b.set("Parameter", "A1", "PARAMETER & DAFTAR PILIHAN");
  b.set("Parameter", "B4", "Parameter");
  b.set("Parameter", "C4", "Nilai");
  b.set("Parameter", "D4", "Keterangan / sumber");
  const paramRows: (string | null)[] = [
    "week1_start", "weeks", "bmi_first_check", "bmi_interval_days", "bmi_periods", "#Klasifikasi BMI",
    "bmi_underweight_below", "bmi_normal_max", "bmi_overweight_max", null, "#Syarat tinggi badan",
    "min_height_female", "min_height_male", "#Kriteria kelulusan", "pass_avg_min", "improve_avg_min", "posttest_min",
  ];
  paramRows.forEach((key, i) => {
    const r = 5 + i;
    if (key === null) return;
    if (key.startsWith("#")) return b.set("Parameter", `B${r}`, key.slice(1));
    const e = SETTINGS_ENTRIES.find((x) => x.key === key)!;
    b.set("Parameter", `B${r}`, e.label);
    const v = settings[key];
    b.set("Parameter", `C${r}`, e.type.kind === "date" ? serial(v) : blank(v));
  });
  b.set("Parameter", "B23", "Tanggal acuan (hari ini)");
  b.set("Parameter", "C23", isoToSerial("2026-10-07"), "=TODAY()");

  // ---- Master SDM (header row 4, data row 5..)
  b.addTab("Master SDM");
  b.set("Master SDM", "A1", "MASTER SDM JOUMPA");
  const msHeader = ["No", "ID SDM", "Stasiun", "Laporan", "Nama Petugas", "NIPP", "L/P", "Pre-test", "Post-test",
    "A\nPenampilan", "B\nGrooming", "C\nPostur", "D\nKomunikasi", "E\nTouch Point", "F\nB. Inggris & Reservasi",
    "Rata-rata Praktik", "Kesimpulan di Laporan", "Status Menurut Kriteria 6.2", "Cek Konsistensi", "Status Penugasan", "Catatan"];
  msHeader.forEach((h, c) => b.setAt("Master SDM", 4, c, h));
  const masterRows: { code: string; row: number; s?: Row }[] = [];
  staff.forEach((s, i) => masterRows.push({ code: String(s.code), row: 5 + i, s }));
  for (let i = 0; i < tmb; i++) masterRows.push({ code: `TMB-${String(i + 1).padStart(2, "0")}`, row: 5 + staff.length + i });
  for (const { code, row: r, s } of masterRows) {
    const m = "Master SDM";
    b.set(m, `A${r}`, r - 4);
    b.set(m, `B${r}`, code);
    b.set(m, `D${r}`, s ? (s.station === "CGK" || s.station === "HLP" ? "CGK & HLP" : s.station) : "", `=IF(C${r}="","",C${r})`);
    b.set(m, `P${r}`, "", `=IF(COUNT(J${r}:O${r})=0,"",ROUND(AVERAGE(J${r}:O${r}),2))`);
    b.set(m, `R${r}`, "", `=IF(P${r}="","",P${r})`);
    b.set(m, `S${r}`, "", `=IF(OR(Q${r}="",R${r}=""),"","OK")`);
    if (!s) continue;
    const put = (col: string, v: unknown) => v !== undefined && v !== null && b.set(m, `${col}${r}`, v);
    put("C", s.station);
    put("E", s.name);
    put("F", s.nipp);
    put("G", s.gender);
    put("H", s.pre_test);
    put("I", s.post_test);
    ["score_a", "score_b", "score_c", "score_d", "score_e", "score_f"].forEach((k, i) => put(a1Column(9 + i), s[k]));
    put("Q", s.report_conclusion);
    put("T", s.assignment_status);
    put("U", s.notes);
  }

  // ---- Cek BMI 2 Mingguan (rows 4-5 headers, data from 6, periods F/K/P/U/Z)
  const bmiT = "Cek BMI 2 Mingguan";
  b.addTab(bmiT);
  ["No", "ID SDM", "Nama Petugas", "Stasiun", "L/P"].forEach((h, c) => b.setAt(bmiT, 4, c, h));
  for (let p = 0; p < 5; p++) {
    const start = 5 + p * 5;
    b.setAt(bmiT, 4, start, `Cek ke-${p + 1} (rencana)`, `="Cek ke-${p + 1} (rencana "&TEXT(Parameter!$C$7,"dd/mm/yyyy")&")"`);
    ["Tgl Cek", "Tinggi (cm)", "Berat (kg)", "BMI", "Kategori"].forEach((h, k) => b.setAt(bmiT, 5, start + k, h));
  }
  ["Tinggi Terakhir (cm)", "Berat Terakhir (kg)", "Δ Berat vs Cek Pertama (kg)", "BMI Terakhir", "Kategori Terakhir", "Syarat Tinggi Badan", "Catatan / Program Penyesuaian BB"].forEach(
    (h, k) => b.setAt(bmiT, 4, 30 + k, h),
  );
  const checks = (db.bmi_checks ?? []) as Row[];
  for (const { code, row: mr, s } of masterRows) {
    const r = mr + 1;
    b.set(bmiT, `A${r}`, mr - 4);
    b.set(bmiT, `B${r}`, code, `='Master SDM'!B${mr}`);
    b.set(bmiT, `C${r}`, s?.name ?? "", `=IF('Master SDM'!E${mr}="","",'Master SDM'!E${mr})`);
    for (let p = 0; p < 5; p++) {
      const start = 5 + p * 5;
      const c = checks.find((x) => x.staff_code === code && x.period === p + 1);
      if (c) {
        if (c.check_date) b.setAt(bmiT, r, start, serial(c.check_date));
        b.setAt(bmiT, r, start + 1, c.height_cm);
        b.setAt(bmiT, r, start + 2, c.weight_kg);
      }
      b.setAt(bmiT, r, start + 3, "", `=IF(OR(${a1Column(start + 1)}${r}="",${a1Column(start + 2)}${r}=""),"",1)`);
      b.setAt(bmiT, r, start + 4, "", `=IF(${a1Column(start + 3)}${r}="","","Normal")`);
    }
    b.set(bmiT, `AE${r}`, "", `=IF(AA${r}<>"",AA${r},"")`);
    if (s?.bmi_note) b.set(bmiT, `AK${r}`, s.bmi_note);
  }

  // ---- Log Performa Mingguan (header row 4, rows 5.., spare formula rows below)
  const logT = "Log Performa Mingguan";
  b.addTab(logT);
  ["Minggu Ke", "Mulai (Senin)", "ID SDM", "Nama Petugas", "Stasiun", "A\nPenampilan", "B\nGrooming", "C\nPostur", "D\nKomunikasi",
    "E\nTouch Point", "F\nB. Inggris & Reservasi", "Rata-rata", "Status Minggu Ini", "Δ vs Baseline", "Observer / Penilai", "Catatan Coaching"].forEach(
    (h, c) => b.setAt(logT, 4, c, h),
  );
  const weekly = (db.weekly_scores ?? []) as Row[];
  let r = 5;
  const logFormulas = (row: number) => {
    b.set(logT, `B${row}`, "", `=IF(A${row}="","",Parameter!$C$5+(A${row}-1)*7)`);
    b.set(logT, `D${row}`, "", `=IF(C${row}="","",INDEX('Master SDM'!$E$5:$E$99,MATCH(C${row},'Master SDM'!$B$5:$B$99,0)))`);
    b.set(logT, `E${row}`, "", `=IF(C${row}="","",INDEX('Master SDM'!$C$5:$C$99,MATCH(C${row},'Master SDM'!$B$5:$B$99,0)))`);
    b.set(logT, `L${row}`, "", `=IF(COUNT(F${row}:K${row})=0,"",ROUND(AVERAGE(F${row}:K${row}),2))`);
    b.set(logT, `M${row}`, "", `=IF(L${row}="","",L${row})`);
    b.set(logT, `N${row}`, "", `=IF(L${row}="","",L${row})`);
  };
  for (let w = 1; w <= weeks; w++) {
    for (const s of staff) {
      b.set(logT, `A${r}`, w);
      b.set(logT, `C${r}`, s.code);
      logFormulas(r);
      const x = weekly.find((y) => y.staff_code === s.code && y.week === w);
      if (x) {
        ["score_a", "score_b", "score_c", "score_d", "score_e", "score_f"].forEach((k, i) => x[k] != null && b.setAt(logT, r, 5 + i, x[k]));
        if (x.observer) b.set(logT, `O${r}`, x.observer);
        if (x.coaching_notes) b.set(logT, `P${r}`, x.coaching_notes);
      }
      r++;
    }
  }
  for (let i = 0; i < logSpare; i++) logFormulas(r++);
  b.tabs.get(logT)!.rowCount = Math.max(r + 5, 20);

  // ---- Tindak Lanjut (header row 4, rows 5..)
  const tlT = "Tindak Lanjut";
  b.addTab(tlT);
  ["No", "ID", "Laporan", "Area", "Tindakan", "Target / Indikator", "Jenis", "Jadwal", "Batas Waktu", "PIC", "Status", "% Progres",
    "Tgl Update", "Realisasi / Bukti", "Catatan KPS", "Sisa Hari", "Flag"].forEach((h, c) => b.setAt(tlT, 4, c, h));
  const items = [...((db.action_items ?? []) as Row[])].sort((x, y) => Number(x.sort_order ?? 0) - Number(y.sort_order ?? 0));
  items.forEach((it, i) => {
    const row = 5 + i;
    b.set(tlT, `A${row}`, i + 1);
    const cols: [string, unknown][] = [["B", it.code], ["C", it.report_group], ["D", it.area], ["E", it.action], ["F", it.target], ["G", it.kind],
      ["H", it.schedule], ["J", it.pic], ["K", it.status], ["L", typeof it.progress === "number" ? it.progress / 100 : it.progress],
      ["M", serial(it.updated_on)], ["N", it.evidence], ["O", it.kps_notes]];
    for (const [c, v] of cols) if (v !== null && v !== undefined) b.set(tlT, `${c}${row}`, v);
    if (it.due_rule) b.set(tlT, `I${row}`, isoToSerial("2026-10-16"), "=MIN(Parameter!$C$5+4,Parameter!$C$23+MOD(6-WEEKDAY(Parameter!$C$23),7))");
    else if (it.due_date) b.set(tlT, `I${row}`, serial(it.due_date));
    b.set(tlT, `P${row}`, "", `=IF(OR(I${row}="",K${row}="Selesai"),"",I${row}-Parameter!$C$23)`);
    b.set(tlT, `Q${row}`, "", `=IF(K${row}="Selesai","Selesai","On Track")`);
  });

  // ---- Penggantian SDM (header row 4, pre-numbered rows 5..)
  const pgT = "Penggantian SDM";
  b.addTab(pgT);
  ["No", "Laporan", "Stasiun", "Nama SDM Diganti", "Alasan / Dasar", "Tgl Ditarik", "Nama SDM Pengganti", "Tgl Efektif", "Tgl Training",
    "Post-test", "Rata-rata Praktik", "Status Kelulusan", "Ketepatan Waktu", "Dilaporkan ke OAO/Direksi", "Catatan"].forEach((h, c) =>
    b.setAt(pgT, 4, c, h),
  );
  if (opts.withIdColumns) {
    b.set(pgT, "P4", "ID Sistem");
    b.set(pgT, "Q4", "ID SDM");
  }
  const reps = [...((db.replacements ?? []) as Row[])].sort((x, y) => Number(x.sort_order ?? x.id) - Number(y.sort_order ?? y.id));
  for (let i = 0; i < replacementSlots; i++) {
    const row = 5 + i;
    b.set(pgT, `A${row}`, i + 1);
    b.set(pgT, `L${row}`, "", `=IF(G${row}="","",IF(OR(J${row}="",K${row}=""),"Belum training/dinilai","?"))`);
    b.set(pgT, `M${row}`, "", `=IF(D${row}="","",IF(H${row}="","Menunggu","?"))`);
    const x = reps[i];
    if (!x) continue;
    const cols: [string, unknown][] = [["B", x.report_group], ["C", x.station], ["D", x.replaced_name], ["E", x.reason], ["F", serial(x.withdrawn_on)],
      ["G", x.replacement_name], ["H", serial(x.effective_on)], ["I", serial(x.training_on)], ["J", x.post_test], ["K", x.practice_avg],
      ["N", x.reported], ["O", x.notes]];
    if (opts.withIdColumns) cols.push(["P", x.id], ["Q", x.staff_code]);
    for (const [c, v] of cols) if (v !== null && v !== undefined) b.set(pgT, `${c}${row}`, v);
  }

  for (const t of ["Rekap Performa", "Laporan Mingguan"]) {
    b.addTab(t);
    b.set(t, "A1", t.toUpperCase());
    b.set(t, "B6", "", "='Master SDM'!B5");
  }
  return b;
}

// ------------------------------------------------------------------ world

export class WorkbookWorld {
  book: FakeWorkbook;
  db: FakeDb;
  baseline: Baseline | null = null;
  specs: TableSpec[] = SYNC_TABLES;

  constructor(db: DbSnapshot, opts: WorkbookOptions & { book?: FakeWorkbook } = {}) {
    this.db = new FakeDb(db);
    this.book = opts.book ?? buildWorkbook(db, opts);
  }

  prepare(opts: { conflictPolicy?: ConflictPolicy; allowMassDelete?: SyncTable[] } = {}) {
    const real = this.book.snapshot();
    const { sheet, projections } = projectAll(real, this.specs);
    const plan: Plan = merge({ baseline: this.baseline, sheet, db: this.db.snapshot(), specs: this.specs, ...opts });
    const ops = translate(plan, projections, real);
    return { plan, ops, counts: countOps(ops) };
  }

  sync(opts: { conflictPolicy?: ConflictPolicy; allowMassDelete?: SyncTable[] } = {}) {
    const prepared = this.prepare(opts);
    const ids = this.db.apply(prepared.plan, this.specs);
    this.book.apply(prepared.ops, ids);
    this.baseline = finalizeBaseline(prepared.plan, ids, this.specs);
    return prepared;
  }
}
