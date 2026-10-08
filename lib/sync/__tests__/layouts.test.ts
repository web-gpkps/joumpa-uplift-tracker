/**
 * Workbook layouts end to end: project -> merge -> translate -> apply on an in-memory copy of the
 * imported workbook (testing/workbook.ts), against a fake DB.
 */
import { describe, expect, test } from "bun:test";
import { LayoutViolation, PERCENT, projectAll, translate } from "../layouts";
import { countPlan, isPlanEmpty, merge } from "../merge";
import { isoToSerial } from "../normalize";
import { a1Column } from "../sheets";
import { actionRow, bmiRow, replacementRow, smallDb, staffRow, weeklyRow } from "../testing/fixtures";
import { WorkbookWorld, type WorkbookOptions } from "../testing/workbook";
import type { DbSnapshot, Plan, SyncTable } from "../types";

const MS = "Master SDM";
const BMI = "Cek BMI 2 Mingguan";
const LOG = "Log Performa Mingguan";
const TL = "Tindak Lanjut";
const PG = "Penggantian SDM";
const PAR = "Parameter";
const TM = "Temuan Mingguan";

/** The fixture plus one rolling-deadline action item (its Batas Waktu is a TODAY() formula). */
function db(): DbSnapshot {
  const d = smallDb();
  d.action_items!.push(actionRow("SUB-TL03", 3, { due_rule: "jumat-berikutnya", due_date: null, kind: "Rutin" }));
  return d;
}

const tp = (plan: Plan, table: SyncTable) => plan.tables.find((t) => t.table === table)!;

function world(opts: WorkbookOptions = {}, data = db()) {
  const w = new WorkbookWorld(data, opts);
  w.sync();
  expectSteady(w);
  return w;
}

function expectSteady(w: WorkbookWorld) {
  const { plan, counts } = w.prepare();
  const busy = Object.entries(countPlan(plan)).filter(([, c]) => c.dbInserts + c.dbUpdates + c.dbDeletes + c.sheetCellUpdates + c.sheetAppends + c.conflicts + c.newIssues > 0 || c.createTab);
  expect(busy).toEqual([]);
  expect(isPlanEmpty(plan)).toBe(true);
  expect(counts.cellWrites + counts.headerCells + counts.formulaCopies + counts.notes + counts.appends).toBe(0);
}

const staff = (w: WorkbookWorld, code: string) => w.db.find("staff", { code })!;

// ------------------------------------------------------------------ first sync

describe("first sync on the imported workbook (same data on both sides)", () => {
  test("no data changes in either direction; only the one-time setup", () => {
    const w = new WorkbookWorld(db());
    const { plan, ops, counts } = w.sync();
    for (const t of plan.tables) {
      expect(t.db).toEqual({ inserts: [], updates: [], deletes: [], pending: [] });
      expect(t.conflicts).toEqual([]);
      expect(t.issues).toEqual([]);
    }
    expect(counts.createTabs).toEqual([TM]);
    expect(ops.headerCells.map((h) => `${h.tab}!${a1Column(h.col)}${h.row}=${h.text}${h.hide ? " (hidden)" : ""}`)).toEqual([
      "Penggantian SDM!P4=ID Sistem (hidden)",
      "Penggantian SDM!Q4=ID SDM",
    ]);
    // The existing replacement is linked to its DB row by station + name: its id lands in P.
    expect(ops.writes.filter((x) => x.tab !== TM).map((x) => `${x.tab}!${a1Column(x.col)}${x.row}`)).toEqual(["Penggantian SDM!P5"]);
    expect(w.book.get(PG, "P5")).toBe(1);
    expect(w.book.hidden(PG, "P")).toBe(true);
    expect([...w.book.written].sort()).toEqual([PG, TM]);
    expect(w.book.get(TM, "A1")).toBe("Minggu Ke");
    expect(w.book.get(TM, "C1")).toBe("Temuan");
    expect(w.book.locale).toBe("id_ID");
    expectSteady(w);
  });

  test("a workbook that already has the engine's columns needs nothing but the Temuan tab", () => {
    const w = new WorkbookWorld(db(), { withIdColumns: true });
    const { ops } = w.sync();
    expect(ops.headerCells).toEqual([]);
    expect(ops.writes.every((x) => x.tab === TM)).toBe(true);
    expectSteady(w);
  });

  test("untouched tabs and workbook formulas survive a busy sequence of edits", () => {
    const w = world();
    const formulasBefore = [w.book.formula(MS, "D5"), w.book.formula(LOG, "B5"), w.book.formula(BMI, "B6"), w.book.formula(TL, "P5"), w.book.formula(PAR, "C23")];
    staff(w, "SUB-01").notes = "web";
    w.book.set(MS, "U6", "sheet");
    w.db.rows("weekly_scores").push(weeklyRow(20, "SUB-01", 3));
    w.db.rows("action_items").push(actionRow("DPS-TL01", 9));
    w.db.rows("bmi_checks").push(bmiRow(9, "SUB-02", 2));
    w.sync();
    expectSteady(w);
    for (const t of ["Petunjuk", "Dashboard", "Rekap Performa", "Laporan Mingguan"]) expect(w.book.written.has(t)).toBe(false);
    expect([w.book.formula(MS, "D5"), w.book.formula(LOG, "B5"), w.book.formula(BMI, "B6"), w.book.formula(TL, "P5"), w.book.formula(PAR, "C23")]).toEqual(formulasBefore);
  });
});

// ------------------------------------------------------------------ formula cells

describe("formula cells are never read as input and never written", () => {
  test("Tindak Lanjut Batas Waktu: formula for rolling items (skipped), literal for the others (synced)", () => {
    const w = world();
    const rolling = w.book.findRow(TL, "B", "SUB-TL03");
    const fixed = w.book.findRow(TL, "B", "SUB-TL01");
    // DB changes the rolling item's stored due date: the formula cell is left alone.
    w.db.find("action_items", { code: "SUB-TL03" })!.due_date = "2026-12-01";
    // The sheet recalculates the formula: never read back.
    w.book.set(TL, `I${rolling}`, isoToSerial("2026-10-23"), w.book.formula(TL, `I${rolling}`));
    // A literal date edited by hand: synced.
    w.book.set(TL, `I${fixed}`, isoToSerial("2026-10-15"));
    const { plan, ops } = w.sync();
    expect(tp(plan, "action_items").db.updates).toEqual([{ key: { code: "SUB-TL01" }, set: { due_date: "2026-10-15" } }]);
    expect(ops.writes.some((x) => x.tab === TL && x.row === rolling)).toBe(false);
    expect(w.book.formula(TL, `I${rolling}`)).toBeDefined();
    expectSteady(w);
  });

  test("translate refuses a plan that would write a formula cell", () => {
    const w = world();
    const real = w.book.snapshot();
    const { sheet, projections } = projectAll(real);
    const plan = merge({ baseline: w.baseline, sheet, db: w.db.snapshot() });
    const t = tp(plan, "action_items");
    const vrow = sheet.tabs[TL]!.values.findIndex((r) => r[0] === "SUB-TL03") + 1;
    t.sheet.updates.push({ row: vrow, col: t.sheet.colIndex.due_date, value: "2026-12-01", fmt: "date" });
    expect(() => translate(plan, projections, real)).toThrow(LayoutViolation);
  });
});

// ------------------------------------------------------------------ Master SDM

describe("Master SDM (header row 4, TMB rows as slots)", () => {
  test("a staff member added on the website fills the matching TMB row (and its BMI note)", () => {
    const w = world();
    w.db.rows("staff").push(staffRow("TMB-02", 10, { station: "KNO", name: "Petugas Baru", nipp: null, bmi_note: "program BB" }));
    const { plan } = w.sync();
    expect(tp(plan, "staff").issues).toEqual([]);
    const r = w.book.findRow(MS, "B", "TMB-02");
    expect([w.book.get(MS, `C${r}`), w.book.get(MS, `E${r}`), w.book.get(MS, `T${r}`), w.book.get(MS, `J${r}`)]).toEqual(["KNO", "Petugas Baru", "Aktif", 4]);
    expect(w.book.get(BMI, `AK${w.book.findRow(BMI, "B", "TMB-02")}`)).toBe("program BB");
    expect(w.book.formula(MS, `D${r}`)).toBeDefined();
    expectSteady(w);
  });

  test("no TMB row left: reported as 'kapasitas baris TMB penuh', nothing appended or deleted", () => {
    const w = world();
    w.db.rows("staff").push(staffRow("TMB-99", 99, { station: "SUB" }));
    const first = w.sync();
    let plan = first.plan;
    const ops = first.ops;
    expect(tp(plan, "staff").issues[0]).toMatchObject({ kind: "no_sheet_row", rowKey: "TMB-99", isNew: true });
    expect(tp(plan, "staff").issues[0].message).toContain("Kapasitas baris TMB penuh");
    expect(ops.writes.filter((x) => x.tab === MS)).toEqual([]);
    ({ plan } = w.sync());
    expect(tp(plan, "staff").issues[0].isNew).toBe(false);
    expect(tp(plan, "staff").db.deletes).toEqual([]);
    expect(staff(w, "TMB-99")).toBeDefined();
  });

  test("filling a TMB row in the sheet (name + station) adds the staff member", () => {
    const w = world();
    const r = w.book.findRow(MS, "B", "TMB-03");
    w.book.set(MS, `C${r}`, "DPS");
    w.book.set(MS, `E${r}`, "Petugas Sheet");
    const { plan } = w.sync();
    expect(tp(plan, "staff").db.inserts).toMatchObject([{ code: "TMB-03", station: "DPS", name: "Petugas Sheet", assignment_status: "Aktif" }]);
    expect(w.book.get(MS, `T${r}`)).toBe("Aktif");
    expectSteady(w);
  });

  test("no name = absent: clearing the name removes the staff member; the row keeps its ID and formulas", () => {
    const w = world();
    const r = w.book.findRow(MS, "B", "DPS-01");
    w.book.set(MS, `E${r}`, undefined);
    const { plan } = w.sync();
    expect(tp(plan, "staff").db.deletes).toEqual([{ code: "DPS-01" }]);
    expect(w.book.get(MS, `B${r}`)).toBe("DPS-01");
    expect(w.book.get(MS, `C${r}`)).toBe("");
    expect(w.book.get(MS, `J${r}`)).toBe("");
    expect(w.book.formula(MS, `P${r}`)).toBeDefined();
    // Cascade: DPS-01's Log entries are cleared, rows kept.
    const logRow = w.book.findRow(LOG, "C", "DPS-01");
    expect(w.book.get(LOG, `A${logRow}`)).toBe(1);
    expectSteady(w);
  });

  test("BMI note lives in Cek BMI column AK and syncs both ways", () => {
    const w = world();
    const r = w.book.findRow(BMI, "B", "SUB-01");
    w.book.set(BMI, `AK${r}`, "turunkan 3 kg");
    w.sync();
    expect(staff(w, "SUB-01").bmi_note).toBe("turunkan 3 kg");
    staff(w, "SUB-02").bmi_note = "dari web";
    w.sync();
    expect(w.book.get(BMI, `AK${w.book.findRow(BMI, "B", "SUB-02")}`)).toBe("dari web");
    expectSteady(w);
  });

  test("renamed header in row 4: Master SDM is not synced at all, other tabs continue", () => {
    const w = world();
    w.book.set(MS, "E4", "Nama");
    staff(w, "SUB-01").name = "Nama Web";
    w.book.set(TL, `J${w.book.findRow(TL, "B", "SUB-TL01")}`, "PIC Baru");
    const { plan, ops } = w.sync();
    expect(tp(plan, "staff").error).toContain('"Nama Petugas"');
    expect(ops.writes.some((x) => x.tab === MS)).toBe(false);
    expect(w.db.find("action_items", { code: "SUB-TL01" })!.pic).toBe("PIC Baru");
  });
});

// ------------------------------------------------------------------ Cek BMI

describe("Cek BMI 2 Mingguan (wide in the sheet, long in the DB)", () => {
  test("period columns map to (staff, period) rows both ways", () => {
    const w = world();
    const sub02 = w.book.findRow(BMI, "B", "SUB-02");
    w.book.set(BMI, `K${sub02}`, isoToSerial("2026-10-26"));
    w.book.set(BMI, `L${sub02}`, 165);
    w.book.set(BMI, `M${sub02}`, "60,5");
    w.db.rows("bmi_checks").push(bmiRow(7, "DPS-01", 3, { check_date: "2026-11-09", height_cm: 158.5, weight_kg: 52 }));
    const { plan } = w.sync();
    expect(tp(plan, "bmi_checks").db.inserts).toEqual([
      { staff_code: "SUB-02", period: 2, check_date: "2026-10-26", height_cm: 165, weight_kg: 60.5 },
    ]);
    const dps = w.book.findRow(BMI, "B", "DPS-01");
    expect([w.book.get(BMI, `P${dps}`), w.book.get(BMI, `Q${dps}`), w.book.get(BMI, `R${dps}`)]).toEqual([isoToSerial("2026-11-09"), 158.5, 52]);
    expectSteady(w);
  });

  test("a date without height and weight is noted, not saved", () => {
    const w = world();
    const r = w.book.findRow(BMI, "B", "SUB-01");
    w.book.set(BMI, `U${r}`, isoToSerial("2026-11-23"));
    const { plan } = w.sync();
    expect(tp(plan, "bmi_checks").db.inserts).toEqual([]);
    expect(tp(plan, "bmi_checks").issues[0]).toMatchObject({ kind: "incomplete_row", rowKey: "SUB-01|4" });
    expect(w.book.note(BMI, `V${r}`)).toContain("Baris belum lengkap");
    expectSteady(w);
  });

  test("clearing height and weight deletes that check; the date is cleared with it", () => {
    const w = world();
    const r = w.book.findRow(BMI, "B", "SUB-01");
    w.book.set(BMI, `G${r}`, undefined);
    w.book.set(BMI, `H${r}`, undefined);
    const { plan } = w.sync();
    expect(tp(plan, "bmi_checks").db.deletes).toEqual([{ staff_code: "SUB-01", period: 1 }]);
    expect(w.book.get(BMI, `F${r}`)).toBe("");
    expect(w.book.formula(BMI, `I${r}`)).toBeDefined();
    expectSteady(w);
  });

  test("a DB check for a period the sheet has no columns for is reported", () => {
    const w = world();
    w.db.rows("bmi_checks").push(bmiRow(8, "SUB-01", 6));
    const { plan, ops } = w.sync();
    expect(tp(plan, "bmi_checks").issues[0]).toMatchObject({ kind: "no_sheet_row", rowKey: "SUB-01|6" });
    expect(ops.writes.filter((x) => x.tab === BMI)).toEqual([]);
  });
});

// ------------------------------------------------------------------ Log Performa

describe("Log Performa Mingguan (pre-made rows, spare rows, formula copy)", () => {
  test("scores typed into a pre-made row are inserted", () => {
    const w = world();
    const r = w.book.findRow(LOG, "C", "DPS-01", w.book.findRow(LOG, "A", 2));
    w.book.set(LOG, `F${r}`, 3);
    w.book.set(LOG, `O${r}`, "SPV");
    const { plan } = w.sync();
    expect(tp(plan, "weekly_scores").db.inserts).toMatchObject([{ staff_code: "DPS-01", week: 2, score_a: 3, observer: "SPV" }]);
    expectSteady(w);
  });

  test("a DB row with no pre-made row goes into the first spare row (formulas already there)", () => {
    const w = world();
    const spare = w.book.findRow(LOG, "A", 2) + 3; // after week 2's three staff rows
    w.db.rows("weekly_scores").push(weeklyRow(30, "SUB-02", 11, { score_a: 2 }));
    const { ops } = w.sync();
    expect([w.book.get(LOG, `A${spare}`), w.book.get(LOG, `C${spare}`), w.book.get(LOG, `F${spare}`)]).toEqual([11, "SUB-02", 2]);
    expect(ops.formulaCopies).toEqual([]);
    expectSteady(w);
  });

  test("no spare rows left: written below the block with the formulas copied from the template row", () => {
    const w = world({ logSpare: 0 });
    w.book.tabs.get(LOG)!.rowCount = 10;
    w.db.rows("weekly_scores").push(weeklyRow(30, "SUB-02", 11, { score_a: 2 }));
    const { ops } = w.sync();
    const r = 11; // block = rows 5..10 (2 weeks x 3 staff)
    expect(ops.grow).toMatchObject([{ tab: LOG }]);
    expect(ops.formulaCopies).toMatchObject([{ tab: LOG, fromRow: 5, toRow: r, cols: [1, 3, 4, 11, 12, 13] }]);
    expect(w.book.formula(LOG, `B${r}`)).toBe(`=IF(A${r}="","",Parameter!$C$5+(A${r}-1)*7)`);
    expect([w.book.get(LOG, `A${r}`), w.book.get(LOG, `C${r}`)]).toEqual([11, "SUB-02"]);
    expectSteady(w);
  });

  test("a row deleted in the DB clears the inputs; week and ID stay", () => {
    const w = world();
    const r = w.book.findRow(LOG, "C", "SUB-02");
    w.db.tables.set("weekly_scores", w.db.rows("weekly_scores").filter((x) => x.staff_code !== "SUB-02"));
    w.sync();
    expect([w.book.get(LOG, `A${r}`), w.book.get(LOG, `C${r}`), w.book.get(LOG, `F${r}`), w.book.get(LOG, `O${r}`)]).toEqual([1, "SUB-02", "", ""]);
    expectSteady(w);
  });
});

// ------------------------------------------------------------------ Tindak Lanjut

describe("Tindak Lanjut (% Progres scaling, new rows)", () => {
  test("PERCENT transform: fraction in the sheet, 0..100 in the DB", () => {
    expect(PERCENT.read(0.5)).toBe(50);
    expect(PERCENT.read(0.29)).toBe(29);
    expect(PERCENT.read(1)).toBe(100);
    expect(PERCENT.read("75%")).toBe(75);
    expect(PERCENT.read(50)).toBe(5000);
    expect(PERCENT.write(75)).toBe(0.75);
    expect(PERCENT.write(null)).toBe("");
  });

  test("progress syncs scaled both ways; 50 typed into a % cell (5000%) is rejected", () => {
    const w = world();
    const r1 = w.book.findRow(TL, "B", "SUB-TL01");
    const r2 = w.book.findRow(TL, "B", "SUB-TL02");
    w.book.set(TL, `L${r1}`, 0.5);
    w.db.find("action_items", { code: "SUB-TL02" })!.progress = 75;
    w.sync();
    expect(w.db.find("action_items", { code: "SUB-TL01" })!.progress).toBe(50);
    expect(w.book.get(TL, `L${r2}`)).toBe(0.75);
    expectSteady(w);

    w.book.set(TL, `L${r1}`, 50);
    const { plan } = w.sync();
    expect(tp(plan, "action_items").db.updates).toEqual([]);
    expect(w.book.note(TL, `L${r1}`)).toContain("Di luar rentang 0–100");
  });

  test("a new action item from the website goes below the list with No and formulas", () => {
    const w = world();
    w.db.rows("action_items").push(actionRow("KNO-TL01", 9));
    const { ops } = w.sync();
    const r = w.book.findRow(TL, "B", "KNO-TL01");
    expect(r).toBe(8);
    expect(w.book.get(TL, `A${r}`)).toBe(4);
    expect(w.book.get(TL, `L${r}`)).toBe(0);
    expect(ops.formulaCopies).toMatchObject([{ tab: TL, fromRow: 5, toRow: 8, cols: [15, 16] }]);
    expectSteady(w);
  });

  test("an item deleted on the website keeps its row (cleared), ID kept", () => {
    const w = world();
    const r = w.book.findRow(TL, "B", "SUB-TL02");
    w.db.tables.set("action_items", w.db.rows("action_items").filter((x) => x.code !== "SUB-TL02"));
    w.sync();
    expect([w.book.get(TL, `B${r}`), w.book.get(TL, `K${r}`), w.book.get(TL, `E${r}`)]).toEqual(["SUB-TL02", "", ""]);
    expectSteady(w);
  });
});

// ------------------------------------------------------------------ Penggantian SDM

describe("Penggantian SDM (pre-numbered slots, ID Sistem / ID SDM columns)", () => {
  test("a replacement typed into a free slot row is inserted and its ID Sistem written back", () => {
    const w = world();
    w.book.set(PG, "C6", "KNO");
    w.book.set(PG, "D6", "Orang Baru");
    w.book.set(PG, "Q6", "SUB-02");
    const { plan } = w.sync();
    expect(tp(plan, "replacements").db.pending).toMatchObject([{ ref: 1, values: { station: "KNO", replaced_name: "Orang Baru", staff_code: "SUB-02" } }]);
    expect(w.book.get(PG, "P6")).toBe(2);
    expectSteady(w);
  });

  test("a replacement added on the website fills the first free slot (with its id)", () => {
    const w = world();
    w.db.rows("replacements").push(replacementRow(5, { station: "DPS", report_group: "DPS", staff_code: "DPS-01" }));
    w.sync();
    expect([w.book.get(PG, "A6"), w.book.get(PG, "C6"), w.book.get(PG, "D6"), w.book.get(PG, "P6"), w.book.get(PG, "Q6")]).toEqual([2, "DPS", "Diganti 5", 5, "DPS-01"]);
    expectSteady(w);
  });

  test("deleted on the website: the slot is cleared (No and formulas stay) and reusable", () => {
    const w = world();
    w.db.tables.set("replacements", []);
    w.sync();
    expect([w.book.get(PG, "A5"), w.book.get(PG, "D5"), w.book.get(PG, "P5")]).toEqual([1, "", ""]);
    expect(w.book.formula(PG, "L5")).toBeDefined();
    w.db.rows("replacements").push(replacementRow(9));
    w.sync();
    expect([w.book.get(PG, "D5"), w.book.get(PG, "P5")]).toEqual(["Diganti 9", 9]);
    expectSteady(w);
  });

  test("all slots used: extends below with the next No and the L/M formulas", () => {
    const w = world({ replacementSlots: 1 });
    w.db.rows("replacements").push(replacementRow(2, { station: "KNO", report_group: "KNO" }));
    const { ops } = w.sync();
    expect([w.book.get(PG, "A6"), w.book.get(PG, "D6"), w.book.get(PG, "P6")]).toEqual([2, "Diganti 2", 2]);
    expect(ops.formulaCopies).toMatchObject([{ tab: PG, fromRow: 5, toRow: 6, cols: [11, 12] }]);
    expectSteady(w);
  });

  test("ID SDM must exist in Master SDM", () => {
    const w = world();
    w.book.set(PG, "Q5", "XXX-01");
    const { plan } = w.sync();
    expect(tp(plan, "replacements").issues[0]).toMatchObject({ kind: "unknown_parent", column: "staff_code" });
    expect(w.book.note(PG, "Q5")).toContain("tidak ada di Master SDM");
  });
});

// ------------------------------------------------------------------ Parameter

describe("Parameter (label in B, value in C)", () => {
  test("a value edited in C syncs; TODAY() in C23 is never touched", () => {
    const w = world();
    const r = w.book.findRow(PAR, "B", "Jumlah minggu pemantauan");
    w.book.set(PAR, `C${r}`, 12);
    const { ops } = w.sync();
    expect(w.db.rows("settings")[0].weeks).toBe(12);
    expect(ops.writes.some((x) => x.tab === PAR)).toBe(false);
    expect(w.book.formula(PAR, "C23")).toBe("=TODAY()");
    w.db.rows("settings")[0].bmi_interval_days = 7;
    w.sync();
    expect(w.book.get(PAR, `C${w.book.findRow(PAR, "B", "Interval cek BMI (hari)")}`)).toBe(7);
    expectSteady(w);
  });

  test("replacement_deadline is DB-only; a renamed label is reported and its value left alone", () => {
    const w = world();
    w.db.rows("settings")[0].replacement_deadline = "2026-11-30";
    expectSteady(w);
    w.book.set(PAR, `B${w.book.findRow(PAR, "B", "Post-test minimal")}`, "Post test min");
    w.db.rows("settings")[0].posttest_min = 75;
    const { plan, ops } = w.sync();
    expect(tp(plan, "settings").issues[0]).toMatchObject({ kind: "no_sheet_row", rowKey: "posttest_min" });
    expect(ops.writes.some((x) => x.tab === PAR)).toBe(false);
    expect(w.db.rows("settings")[0].posttest_min).toBe(75);
  });
});

// ------------------------------------------------------------------ Temuan Mingguan

describe("Temuan Mingguan (engine-owned tab)", () => {
  test("created with its row-1 header and synced both ways", () => {
    const w = world();
    expect([w.book.get(TM, "A1"), w.book.get(TM, "B1"), w.book.get(TM, "C1")]).toEqual(["Minggu Ke", "Lingkup", "Temuan"]);
    w.book.set(TM, "C2", "Diperbarui di Sheet");
    w.sync();
    expect(w.db.find("weekly_reports", { week: 1, scope: "SUB" })!.findings).toBe("Diperbarui di Sheet");
    expectSteady(w);
  });
});
