import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { merge } from "../merge";
import { SupabaseSyncStore, issueToLog } from "../supabase";
import { World } from "../testing/fakes";
import { smallDb, staffRow, weeklyRow } from "../testing/fixtures";

/** Records every PostgREST call as "table.op(args)" in order. */
function recordingClient(opts: { failOn?: string; rpc?: Record<string, unknown>; rows?: Record<string, unknown[]> } = {}) {
  const calls: string[] = [];
  let nextId = 100;
  const builder = (table: string) => {
    let op = "";
    const parts: string[] = [];
    const b: Record<string, unknown> = {};
    const chain = (name: string) => (...args: unknown[]) => {
      parts.push(`${name}(${args.map((a) => JSON.stringify(a)).join(",")})`);
      if (["upsert", "update", "delete", "insert", "select"].includes(name) && !op) op = name;
      return b;
    };
    for (const n of ["select", "upsert", "update", "delete", "insert", "eq", "in", "match", "order", "single", "maybeSingle"]) b[n] = chain(n);
    b.range = (from: number) => {
      parts.push(`range(${from})`);
      return b;
    };
    b.then = (resolve: (v: unknown) => void) => {
      const line = `${table}.${parts.join(".")}`;
      calls.push(line);
      if (opts.failOn && line.includes(opts.failOn)) return resolve({ data: null, error: { code: "23514", message: "violates check", details: "Failing row contains (secret)" } });
      if (op === "insert") return resolve({ data: { id: nextId++ }, error: null });
      if (op === "select") return resolve({ data: opts.rows?.[table] ?? [], error: null });
      return resolve({ data: null, error: null });
    };
    return b;
  };
  const client = {
    from: (t: string) => builder(t),
    rpc: async (name: string, args: unknown) => {
      calls.push(`rpc.${name}(${JSON.stringify(args)})`);
      return { data: opts.rpc?.[name] ?? null, error: null };
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("SupabaseSyncStore.apply", () => {
  test("parents before children for writes; children before parents for deletes; settings in one update", async () => {
    const w = new World(smallDb());
    w.sync();
    w.db.rows("staff").push(staffRow("KNO-01", 9, { station: "KNO" }));
    w.db.rows("weekly_scores").push(weeklyRow(5, "KNO-01", 1));
    w.sync(); // KNO-01 is now known on both sides
    w.sheet.setCell("Parameter", 2, "Nilai", "19/10/2026");
    w.sheet.setCell("Parameter", 3, "Nilai", 12);
    // Sheet: delete DPS-01 staff and SUB-02's week 1 entry; add a new staff + their score.
    const sdm = w.sheet.tabs.get("Master SDM")!.values;
    sdm.splice(sdm.findIndex((r) => r[0] === "DPS-01"), 1);
    const n = sdm.length + 1;
    w.sheet.setCell("Master SDM", n, "ID SDM", "TMB-01");
    w.sheet.setCell("Master SDM", n, "Stasiun", "SUB");
    w.sheet.setCell("Master SDM", n, "Nama Petugas", "Baru");
    const log = w.sheet.tabs.get("Log Performa Mingguan")!.values;
    const r = log.findIndex((x) => x.includes("SUB-02")) + 1;
    for (const h of ["A Penampilan", "B Grooming", "C Postur", "D Komunikasi", "E Touch Point", "F B. Inggris & Reservasi", "Observer / Penilai"]) {
      w.sheet.setCell("Log Performa Mingguan", r, h, "");
    }
    const m = log.length + 1;
    w.sheet.setCell("Log Performa Mingguan", m, "Minggu Ke", 1);
    w.sheet.setCell("Log Performa Mingguan", m, "ID SDM", "TMB-01");
    w.sheet.setCell("Log Performa Mingguan", m, "A Penampilan", 3);
    const nr = w.sheet.rows("Penggantian SDM").length + 2;
    w.sheet.setCell("Penggantian SDM", nr, "Nama SDM Diganti", "X");
    const plan = w.plan();

    const { client, calls } = recordingClient();
    const res = await new SupabaseSyncStore(client).apply(plan);
    expect(res.failed.size).toBe(0);
    expect(res.ids.get(1)).toBe(100);
    const idx = (s: string) => calls.findIndex((c) => c.includes(s));
    expect(calls.filter((c) => c.startsWith("settings."))).toEqual(['settings.update({"week1_start":"2026-10-19","weeks":12}).eq("id",1)']);
    expect(idx("staff.upsert")).toBeLessThan(idx("weekly_scores.upsert"));
    expect(calls[idx("staff.upsert")]).toContain('"onConflict":"code"');
    expect(calls[idx("weekly_scores.upsert")]).toContain('"onConflict":"staff_code,week"');
    expect(idx("replacements.insert")).toBeGreaterThan(-1);
    expect(idx("weekly_scores.delete")).toBeLessThan(idx("staff.delete"));
    expect(calls[idx("weekly_scores.delete")]).toContain('match({"staff_code":"SUB-02","week":1})');
    expect(calls[idx("staff.delete")]).toContain('in("code",["DPS-01"])');
  });

  test("a failing table is reported with code + message only (no row details) and others continue", async () => {
    const w = new World(smallDb());
    w.sync();
    w.sheet.setCell("Master SDM", 2, "Catatan", "x");
    w.sheet.setCell("Tindak Lanjut", 2, "PIC", "y");
    const { client, calls } = recordingClient({ failOn: "staff.update" });
    const res = await new SupabaseSyncStore(client).apply(w.plan());
    expect(res.failed.get("staff")).toBe("23514: violates check");
    expect(calls.some((c) => c.startsWith("action_items.update"))).toBe(true);
  });
});

describe("SupabaseSyncStore lease + state", () => {
  test("RPC argument names match the migration", async () => {
    const { client, calls } = recordingClient({ rpc: { sync_claim_lease: "tok", sync_release_lease: true } });
    const store = new SupabaseSyncStore(client);
    expect(await store.claimLease(60)).toBe("tok");
    expect(await store.releaseLease("tok", null, "x")).toBe(true);
    expect(calls).toEqual(['rpc.sync_claim_lease({"p_ttl_seconds":60})', 'rpc.sync_release_lease({"p_token":"tok","p_baseline":null,"p_error":"x"})']);
  });

  test("an empty '{}' baseline reads as first run", async () => {
    const { client } = recordingClient();
    (client as unknown as { from: unknown }).from = () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { baseline: {} }, error: null }) }) }),
    });
    expect(await new SupabaseSyncStore(client).readBaseline()).toBeNull();
  });

  test("readAll pages through tables ordered by key", async () => {
    const { client, calls } = recordingClient({ rows: { settings: [{ id: 1 }] } });
    const snap = await new SupabaseSyncStore(client).readAll();
    expect(snap.settings).toEqual([{ id: 1 }]);
    expect(calls.find((c) => c.startsWith("weekly_scores."))).toContain('order("staff_code",{"ascending":true}).order("week",{"ascending":true}).range(0)');
  });
});

test("issueToLog uses rejected:<kind>", () => {
  const w = new World(smallDb());
  w.sync();
  const r = w.sheet.rows("Master SDM").findIndex((x) => x["ID SDM"] === "SUB-01") + 2;
  w.sheet.setCell("Master SDM", r, "A Penampilan", 9);
  const issue = merge({ baseline: w.baseline, sheet: w.sheet.snapshot(), db: w.db.snapshot(), specs: w.specs }).tables.find((t) => t.table === "staff")!.issues[0];
  expect(issueToLog(issue)).toEqual({
    table_name: "staff",
    row_key: "SUB-01",
    column_name: "score_a",
    baseline: null,
    sheet_value: 9,
    db_value: 4,
    resolution: "rejected:invalid_value",
  });
});
