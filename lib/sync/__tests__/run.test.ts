import { describe, expect, test } from "bun:test";
import { projectAll, type RealOps } from "../layouts";
import { isPlanEmpty, merge } from "../merge";
import { parsePolicy, runSync } from "../run";
import type { SheetsPort } from "../sheets";
import type { DbApplyResult, SyncLogEntry, SyncStore } from "../supabase";
import { FakeDb } from "../testing/fakes";
import { smallDb } from "../testing/fixtures";
import { FakeWorkbook, buildWorkbook } from "../testing/workbook";
import type { Baseline, Plan, SyncTable } from "../types";

class FakeStore implements SyncStore {
  lease: string | null = null;
  baseline: Baseline | null = null;
  lastError: string | null = null;
  logs: SyncLogEntry[] = [];
  failTables = new Set<SyncTable>();
  claims = 0;
  constructor(public db: FakeDb) {}
  async claimLease() {
    this.claims++;
    if (this.lease) return null;
    this.lease = `lease-${this.claims}`;
    return this.lease;
  }
  async releaseLease(token: string, baseline: Baseline | null, error: string | null) {
    if (token !== this.lease) return false;
    this.lease = null;
    if (baseline) this.baseline = JSON.parse(JSON.stringify(baseline));
    this.lastError = error;
    return true;
  }
  async readBaseline() {
    return this.baseline;
  }
  async readAll() {
    return this.db.snapshot();
  }
  async apply(plan: Plan): Promise<DbApplyResult> {
    const failed = new Map<SyncTable, string>();
    const ok: Plan = { ...plan, tables: plan.tables.filter((t) => !this.failTables.has(t.table)) };
    for (const t of this.failTables) failed.set(t, "23514: check violation");
    return { ids: this.db.apply(ok), failed };
  }
  async log(entries: SyncLogEntry[]) {
    this.logs.push(...entries);
  }
}

class WorkbookPort implements SheetsPort {
  failApply = false;
  constructor(public book: FakeWorkbook) {}
  async read() {
    return this.book.snapshot();
  }
  async apply(ops: RealOps, ids: Map<number, number | string>, opts: { skipTables?: Set<string> } = {}) {
    if (this.failApply) throw new Error("Google Sheets POST failed (403 PERMISSION_DENIED)");
    this.book.apply(ops, ids, opts.skipTables);
  }
}

function setup() {
  const data = smallDb();
  const db = new FakeDb(data);
  const book = buildWorkbook(data);
  const store = new FakeStore(db);
  const sheets = new WorkbookPort(book);
  const deps = { store, sheets };
  const steady = () => isPlanEmpty(merge({ baseline: store.baseline, sheet: projectAll(book.snapshot()).sheet, db: db.snapshot() }));
  return { db, book, store, sheets, deps, steady };
}

const MS = "Master SDM";

describe("runSync", () => {
  test("first run on the imported workbook: only setup, baseline stored, lease released", async () => {
    const { store, book, deps, steady } = setup();
    const s = await runSync(deps);
    expect(s.status).toBe("ok");
    expect(s.policy).toBe("db-wins");
    expect(Object.values(s.tables!).every((t) => t.dbInserts + t.dbUpdates + t.dbDeletes === 0)).toBe(true);
    expect(s.sheet).toMatchObject({ createTabs: ["Temuan Mingguan"], headerCells: 2, setLocale: true });
    expect(store.lease).toBeNull();
    expect(store.baseline!.tables.staff!["SUB-01"]).toBeDefined();
    expect(book.get("Penggantian SDM", "P5")).toBe(1);
    expect(steady()).toBe(true);
    const again = await runSync(deps);
    expect(again.status).toBe("ok");
    expect(again.sheet).toMatchObject({ cellWrites: 0, headerCells: 0, createTabs: [], setLocale: false });
  });

  test("busy when another run holds the lease; nothing read or written", async () => {
    const { store, book, deps } = setup();
    store.lease = "someone-else";
    const s = await runSync(deps);
    expect(s.status).toBe("busy");
    expect(book.written.size).toBe(0);
  });

  test("dry run: no lease, no writes on either side, counts and planned setup returned", async () => {
    const { store, book, db, deps } = setup();
    const before = JSON.stringify(db.snapshot());
    const s = await runSync(deps, { dryRun: true });
    expect(s.status).toBe("dry-run");
    expect(s.tables!.weekly_reports.createTab).toBe(true);
    expect(s.sheet).toMatchObject({ createTabs: ["Temuan Mingguan"], headerCells: 2, cellWrites: 7, tabsWritten: ["Penggantian SDM", "Temuan Mingguan"], setLocale: true });
    expect(store.claims).toBe(0);
    expect(store.baseline).toBeNull();
    expect(book.written.size).toBe(0);
    expect(book.locale).toBe("en_US");
    expect(JSON.stringify(db.snapshot())).toBe(before);
  });

  test("conflicts are logged with the policy as resolution (db-wins by default)", async () => {
    const { store, book, db, deps } = setup();
    await runSync(deps);
    const r = book.findRow(MS, "B", "SUB-01");
    db.find("staff", { code: "SUB-01" })!.score_a = 5;
    book.set(MS, `J${r}`, 2);
    await runSync(deps);
    expect(store.logs).toEqual([
      { table_name: "staff", row_key: "SUB-01", column_name: "score_a", baseline: 4, sheet_value: 2, db_value: 5, resolution: "db-wins" },
    ]);
    expect(book.get(MS, `J${r}`)).toBe(5);
    db.find("staff", { code: "SUB-01" })!.score_b = 1;
    book.set(MS, `K${r}`, 2);
    await runSync(deps, { conflictPolicy: "sheet-wins" });
    expect(store.logs[1]).toMatchObject({ column_name: "score_b", resolution: "sheet-wins", sheet_value: 2, db_value: 1 });
  });

  test("validation problems are logged once with a rejected:<kind> resolution", async () => {
    const { store, book, deps } = setup();
    await runSync(deps);
    book.set(MS, `J${book.findRow(MS, "B", "SUB-01")}`, 7);
    await runSync(deps);
    await runSync(deps);
    expect(store.logs).toEqual([
      { table_name: "staff", row_key: "SUB-01", column_name: "score_a", baseline: null, sheet_value: 7, db_value: 4, resolution: "rejected:invalid_value" },
    ]);
  });

  test("sheet write failure: error recorded, baseline kept, sheet-wins conflict already logged, next run converges", async () => {
    const { store, book, db, sheets, deps, steady } = setup();
    await runSync(deps);
    const baseline = JSON.stringify(store.baseline);
    const r = book.findRow(MS, "B", "SUB-02");
    db.find("staff", { code: "SUB-02" })!.notes = "web";
    book.set(MS, `U${r}`, "sheet");
    sheets.failApply = true;
    const s = await runSync(deps, { conflictPolicy: "sheet-wins" });
    expect(s.status).toBe("error");
    expect(s.errors![0]).toContain("403");
    expect(store.lastError).toContain("403");
    expect(store.lease).toBeNull();
    expect(JSON.stringify(store.baseline)).toBe(baseline);
    expect(db.find("staff", { code: "SUB-02" })!.notes).toBe("sheet");
    expect(store.logs.map((l) => l.resolution)).toEqual(["sheet-wins"]);

    sheets.failApply = false;
    expect((await runSync(deps)).status).toBe("ok");
    expect(store.logs).toHaveLength(1);
    expect(steady()).toBe(true);
  });

  test("one table's DB failure: that table is skipped (sheet + baseline), others sync, status partial", async () => {
    const { store, book, db, deps, steady } = setup();
    await runSync(deps);
    const tl = book.findRow("Tindak Lanjut", "B", "SUB-TL01");
    book.set("Tindak Lanjut", `J${tl}`, "Baru");
    book.set(MS, `U${book.findRow(MS, "B", "SUB-01")}`, "ok");
    db.find("action_items", { code: "SUB-TL01" })!.evidence = "bukti";
    store.failTables.add("action_items");
    const s = await runSync(deps);
    expect(s.status).toBe("partial");
    expect(s.tables!.action_items.dbFailed).toBe(true);
    expect(store.lastError).toContain("DB action_items: 23514");
    expect(db.find("staff", { code: "SUB-01" })!.notes).toBe("ok");
    expect(book.get("Tindak Lanjut", `N${tl}`)).toBe("");
    expect(store.baseline!.tables.action_items!["SUB-TL01"].pic).toBe("PIC");

    store.failTables.clear();
    expect((await runSync(deps)).status).toBe("ok");
    expect(db.find("action_items", { code: "SUB-TL01" })!.pic).toBe("Baru");
    expect(book.get("Tindak Lanjut", `N${tl}`)).toBe("bukti");
    expect(steady()).toBe(true);
  });

  test("header error makes the run partial and names the tab", async () => {
    const { store, book, deps } = setup();
    await runSync(deps);
    book.set(MS, "B4", "Kode");
    const s = await runSync(deps);
    expect(s.status).toBe("partial");
    expect(s.tables!.staff.error).toBe(true);
    expect(store.lastError).toContain('Tab "Master SDM"');
  });

  test("parsePolicy defaults to db-wins", () => {
    expect(parsePolicy(undefined)).toBe("db-wins");
    expect(parsePolicy("nonsense")).toBe("db-wins");
    expect(parsePolicy("sheet-wins")).toBe("sheet-wins");
  });
});
