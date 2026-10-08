/**
 * In-memory Sheet and DB that apply a Plan with the same semantics as the real adapters
 * (dates come back as serials, cleared cells as "", rows deleted bottom-up, FK cascade).
 * Used by unit tests and by the local Supabase integration test as the "mocked sheet".
 */
import { finalizeBaseline, merge, type MergeInput } from "../merge";
import { isoToSerial } from "../normalize";
import { SYNC_TABLES, rowOneSpecs, specFor } from "../tables";
import type { Baseline, Canon, CellFormat, DbSnapshot, Plan, SheetSnapshot, SyncTable, TableSpec } from "../types";

export function encodeCell(value: Canon, fmt: CellFormat): unknown {
  if (value === null) return "";
  if (fmt === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return isoToSerial(value);
  return value;
}

interface FakeTab {
  sheetId: number;
  values: unknown[][];
  notes: Map<string, string>;
}

export class FakeSheet {
  tabs = new Map<string, FakeTab>();
  locale = "id_ID";
  private nextId = 100;

  addTab(title: string, values: unknown[][] = []) {
    this.tabs.set(title, { sheetId: this.nextId++, values: values.map((r) => [...r]), notes: new Map() });
  }

  /** Mark a cell as holding a formula (never read as input, never written). */
  lock(title: string, row: number, header: string) {
    const t = this.tabs.get(title)!;
    const col = t.values[0].findIndex((h) => h === header);
    if (!this.locks.has(title)) this.locks.set(title, new Set());
    this.locks.get(title)!.add(`${row}:${col}`);
  }
  locks = new Map<string, Set<string>>();

  snapshot(): SheetSnapshot {
    const tabs: SheetSnapshot["tabs"] = {};
    for (const [title, t] of this.tabs) {
      tabs[title] = { title, sheetId: t.sheetId, values: trimValues(t.values), locked: this.locks.get(title) };
    }
    return { tabs, locale: this.locale, timeZone: "Asia/Jakarta" };
  }

  /** Row objects (by header) of a tab, data rows only. */
  rows(title: string): Record<string, unknown>[] {
    const t = this.tabs.get(title);
    if (!t) return [];
    const [header = [], ...rest] = t.values;
    return rest.map((r) => Object.fromEntries(header.map((h, i) => [String(h), r[i] ?? ""])));
  }

  cell(title: string, row: number, header: string): unknown {
    const t = this.tabs.get(title)!;
    const col = t.values[0].findIndex((h) => h === header);
    return t.values[row - 1]?.[col] ?? "";
  }

  setCell(title: string, row: number, header: string, value: unknown) {
    const t = this.tabs.get(title)!;
    const col = t.values[0].findIndex((h) => h === header);
    if (col < 0) throw new Error(`no header ${header}`);
    while (t.values.length < row) t.values.push([]);
    t.values[row - 1][col] = value;
  }

  note(title: string, row: number, header: string): string | undefined {
    const t = this.tabs.get(title)!;
    const col = t.values[0].findIndex((h) => h === header);
    return t.notes.get(`${row}:${col}`);
  }

  apply(plan: Plan, ids: Map<number, number | string>) {
    for (const tp of plan.tables) {
      if (tp.error) continue;
      const s = tp.sheet;
      if (s.create) this.addTab(s.tab, [s.header]);
      else if (s.writeHeader) this.tabs.get(s.tab)!.values = [s.header];
      const t = this.tabs.get(s.tab)!;
      const set = (row: number, col: number, v: unknown) => {
        while (t.values.length < row) t.values.push([]);
        const r = t.values[row - 1];
        while (r.length < col) r.push("");
        r[col] = v;
      };
      for (const u of s.updates) {
        if (this.locks.get(s.tab)?.has(`${u.row}:${u.col}`)) throw new Error(`write to locked cell ${s.tab} ${u.row}:${u.col}`);
        set(u.row, u.col, encodeCell(u.value, u.fmt));
      }
      for (const w of s.idWrites) {
        const id = ids.get(w.ref);
        if (id !== undefined) set(w.row, w.col, typeof id === "string" ? Number(id) : id);
      }
      for (const n of s.notes) {
        if (n.text) t.notes.set(`${n.row}:${n.col}`, n.text);
        else t.notes.delete(`${n.row}:${n.col}`);
      }
      for (const row of [...s.deleteRows].sort((a, b) => b - a)) {
        t.values.splice(row - 1, 1);
        const moved = new Map<string, string>();
        for (const [k, v] of t.notes) {
          const [r, c] = k.split(":").map(Number);
          if (r === row) continue;
          moved.set(`${r > row ? r - 1 : r}:${c}`, v);
        }
        t.notes = moved;
      }
      const last = lastNonEmptyRow(t.values);
      t.values.length = last;
      for (const cells of s.appends) t.values.push(cells.map((c) => encodeCell(c.value, c.fmt)));
    }
  }
}

function lastNonEmptyRow(values: unknown[][]): number {
  for (let i = values.length - 1; i >= 0; i--) {
    if ((values[i] ?? []).some((c) => c !== "" && c !== null && c !== undefined)) return i + 1;
  }
  return 0;
}

/** What values.batchGet returns: trailing empty rows and trailing empty cells dropped. */
function trimValues(values: unknown[][]): unknown[][] {
  const out = values.slice(0, lastNonEmptyRow(values)).map((r) => {
    const row = [...(r ?? [])];
    while (row.length && (row[row.length - 1] === "" || row[row.length - 1] == null)) row.pop();
    return row;
  });
  return out;
}

export class FakeDb {
  tables = new Map<SyncTable, Record<string, unknown>[]>();
  private nextIds = new Map<SyncTable, number>();

  constructor(init: DbSnapshot = {}) {
    for (const [t, rows] of Object.entries(init)) this.tables.set(t as SyncTable, (rows ?? []).map((r) => ({ ...r })));
  }

  snapshot(): DbSnapshot {
    const out: DbSnapshot = {};
    for (const [t, rows] of this.tables) out[t] = rows.map((r) => ({ ...r }));
    return out;
  }

  rows(t: SyncTable) {
    return this.tables.get(t) ?? [];
  }

  find(t: SyncTable, key: Record<string, unknown>) {
    return this.rows(t).find((r) => Object.entries(key).every(([k, v]) => r[k] === v));
  }

  /** Apply in adapter order: parents first for writes, children first for deletes. */
  apply(plan: Plan, specs: TableSpec[] = SYNC_TABLES): Map<number, number> {
    const ids = new Map<number, number>();
    const order = specs.map((s) => s.table);
    const byTable = new Map(plan.tables.map((t) => [t.table, t]));
    for (const table of order) {
      const tp = byTable.get(table);
      if (!tp || tp.error) continue;
      const spec = specFor(table, specs);
      const rows = this.tables.get(table) ?? [];
      this.tables.set(table, rows);
      if (spec.kv) {
        for (const u of tp.db.updates) rows[0][String(u.key.key)] = u.set.value;
        continue;
      }
      const match = (r: Record<string, unknown>, key: Record<string, unknown>) =>
        spec.key.every((k) => r[k] === key[k]);
      for (const ins of tp.db.inserts) {
        const i = rows.findIndex((r) => match(r, ins));
        if (i >= 0) rows[i] = { ...rows[i], ...ins };
        else rows.push({ ...ins });
      }
      for (const u of tp.db.updates) {
        const r = rows.find((x) => match(x, u.key));
        if (!r) throw new Error(`update of missing row ${JSON.stringify(u.key)}`);
        Object.assign(r, u.set);
      }
      for (const p of tp.db.pending) {
        const next = this.nextIds.get(table) ?? Math.max(0, ...rows.map((r) => Number(r.id) || 0)) + 1;
        this.nextIds.set(table, next + 1);
        rows.push({ ...p.values, id: next });
        ids.set(p.ref, next);
      }
    }
    for (const table of [...order].reverse()) {
      const tp = byTable.get(table);
      if (!tp || tp.error) continue;
      const spec = specFor(table, specs);
      const rows = this.tables.get(table) ?? [];
      for (const del of tp.db.deletes) {
        const i = rows.findIndex((r) => spec.key.every((k) => r[k] === del[k]));
        if (i >= 0) rows.splice(i, 1);
        if (table === "staff") {
          // FK actions: children cascade, replacements.staff_code is set null.
          for (const child of ["weekly_scores", "bmi_checks"] as SyncTable[]) {
            this.tables.set(
              child,
              (this.tables.get(child) ?? []).filter((r) => r.staff_code !== del.code),
            );
          }
          for (const r of this.tables.get("replacements") ?? []) if (r.staff_code === del.code) r.staff_code = null;
        }
      }
    }
    return ids;
  }
}

export type WorldOptions = Partial<Omit<MergeInput, "baseline" | "sheet" | "db">>;

/**
 * Merge-engine test world: row-1 tabs (no workbook layout), a DB, and the stored baseline.
 * Workbook layouts are exercised by WorkbookWorld (testing/workbook.ts).
 */
export class World {
  sheet = new FakeSheet();
  db: FakeDb;
  baseline: Baseline | null = null;
  specs: TableSpec[];

  constructor(db: DbSnapshot, specs: TableSpec[] = rowOneSpecs()) {
    this.db = new FakeDb(db);
    this.specs = specs;
  }

  plan(opts: WorldOptions = {}): Plan {
    return merge({
      baseline: this.baseline,
      sheet: this.sheet.snapshot(),
      db: this.db.snapshot(),
      specs: this.specs,
      ...opts,
    });
  }

  sync(opts: WorldOptions = {}): Plan {
    const plan = this.plan(opts);
    const ids = this.db.apply(plan, this.specs);
    this.sheet.apply(plan, ids);
    this.baseline = finalizeBaseline(plan, ids, this.specs);
    return plan;
  }
}
