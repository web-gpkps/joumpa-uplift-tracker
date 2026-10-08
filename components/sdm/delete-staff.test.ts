import { describe, expect, test } from "bun:test";
import { deleteStaffAs, type StaffDeleteClient } from "./delete-staff";

type Call = { table: string; op: "select" | "delete"; columns?: string; head?: boolean; eq: [string, string] };

/** Fake supabase-js client: records every query and answers from a small in-memory table set. */
function fakeClient(opts: {
  staff?: Array<{ code: string; name: string }>;
  counts?: Partial<Record<"weekly_scores" | "bmi_checks" | "replacements", number>>;
  deleteCount?: number;
  failOn?: string;
}) {
  const calls: Call[] = [];
  const client: StaffDeleteClient = {
    from(table) {
      return {
        select(columns, options) {
          return {
            eq(column, value) {
              calls.push({ table, op: "select", columns, head: options?.head, eq: [column, value] });
              if (opts.failOn === `select:${table}`) return Promise.resolve({ error: { message: "boom" } });
              if (options?.head) {
                const key = table as "weekly_scores" | "bmi_checks" | "replacements";
                return Promise.resolve({ data: null, error: null, count: opts.counts?.[key] ?? 0 });
              }
              return Promise.resolve({ data: (opts.staff ?? []).filter((s) => s.code === value), error: null });
            },
          };
        },
        delete() {
          return {
            eq(column, value) {
              calls.push({ table, op: "delete", eq: [column, value] });
              if (opts.failOn === `delete:${table}`) return Promise.resolve({ error: { message: "fk" } });
              return Promise.resolve({ error: null, count: opts.deleteCount ?? 1 });
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

const OWNER = { kind: "owner" as const };
const LINK = { kind: "link" as const };
const STAFF = { code: "TST-01", name: "Petugas Uji" };

describe("deleteStaffAs", () => {
  test("refuses link access before any query", async () => {
    const { client, calls } = fakeClient({ staff: [STAFF] });
    const result = await deleteStaffAs(LINK, client, "TST-01");
    expect(result.ok ? null : result.error.code).toBe("unauthorized");
    expect(calls).toHaveLength(0);
  });

  test("refuses owner access without an owner client", async () => {
    const result = await deleteStaffAs(OWNER, null, "TST-01");
    expect(result.ok).toBe(false);
  });

  test("rejects a blank or non-string code", async () => {
    const { client, calls } = fakeClient({ staff: [STAFF] });
    expect((await deleteStaffAs(OWNER, client, "  ")).ok).toBe(false);
    expect((await deleteStaffAs(OWNER, client, 42)).ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  test("unknown code: no delete is sent", async () => {
    const { client, calls } = fakeClient({ staff: [STAFF] });
    const result = await deleteStaffAs(OWNER, client, "SUB-99");
    expect(result.ok).toBe(false);
    expect(calls.some((c) => c.op === "delete")).toBe(false);
  });

  test("deletes the staff row and reports the dependent counts", async () => {
    const { client, calls } = fakeClient({
      staff: [STAFF],
      counts: { weekly_scores: 3, bmi_checks: 1, replacements: 2 },
    });
    const result = await deleteStaffAs(OWNER, client, "TST-01");
    expect(result).toEqual({ ok: true, code: "TST-01", name: "Petugas Uji", weeklyScores: 3, bmiChecks: 1, replacements: 2 });
    const del = calls.filter((c) => c.op === "delete");
    expect(del).toEqual([{ table: "staff", op: "delete", eq: ["code", "TST-01"] }]);
    // Dependants are only counted (the database cascades / unlinks them), never deleted here.
    for (const table of ["weekly_scores", "bmi_checks", "replacements"]) {
      expect(calls).toContainEqual({ table, op: "select", columns: "id", head: true, eq: ["staff_code", "TST-01"] });
    }
  });

  test("a delete that removes nothing (RLS: not an admin) is reported as refused", async () => {
    const { client } = fakeClient({ staff: [STAFF], deleteCount: 0 });
    const result = await deleteStaffAs(OWNER, client, "TST-01");
    expect(result.ok ? null : result.error.code).toBe("unauthorized");
  });

  test("database errors are passed on, and a failed count stops before the delete", async () => {
    const countFails = fakeClient({ staff: [STAFF], failOn: "select:bmi_checks" });
    const r1 = await deleteStaffAs(OWNER, countFails.client, "TST-01");
    expect(r1.ok).toBe(false);
    expect(countFails.calls.some((c) => c.op === "delete")).toBe(false);

    const deleteFails = fakeClient({ staff: [STAFF], failOn: "delete:staff" });
    const r2 = await deleteStaffAs(OWNER, deleteFails.client, "TST-01");
    expect(r2.ok ? null : r2.error.code).toBe("unknown");
  });
});
