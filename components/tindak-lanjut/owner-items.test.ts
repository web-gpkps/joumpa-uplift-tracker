import { describe, expect, test } from "bun:test";
import {
  OWNER_ONLY_MESSAGE,
  addActionItem,
  nextActionCode,
  removeActionItem,
  validateNewItem,
  type ActionItemsPort,
  type ExistingItem,
  type NewItemInput,
  type NewItemRow,
} from "./owner-items";

const EXISTING: ExistingItem[] = [
  { code: "SUB-TL12", reportGroup: "SUB", sortOrder: 12 },
  { code: "SUB-TL13", reportGroup: "SUB", sortOrder: 13 },
  { code: "CGKHLP-TL13", reportGroup: "CGK & HLP", sortOrder: 39 },
  { code: "KNO-TL13", reportGroup: "KNO", sortOrder: 52 },
];

const INPUT: NewItemInput = {
  reportGroup: "CGK & HLP",
  code: "CGKHLP-TL14",
  area: " Evaluasi tambahan ",
  action: "Kunjungan KPS kedua",
  target: "",
  kind: "Sekali",
  schedule: "",
  dueDate: "2026-12-18",
  dueRule: "",
  pic: "OAO",
};

function mockPort(overrides: Partial<ActionItemsPort> = {}) {
  const calls = { inserted: [] as NewItemRow[], removed: [] as string[], listed: 0 };
  const port: ActionItemsPort = {
    list: async () => {
      calls.listed += 1;
      return { data: EXISTING, error: null };
    },
    insert: async (row) => {
      calls.inserted.push(row);
      return { error: null };
    },
    remove: async (code) => {
      calls.removed.push(code);
      return { deleted: 1, error: null };
    },
    ...overrides,
  };
  return { port, calls };
}

describe("nextActionCode", () => {
  test("follows the group's own prefix and pads to two digits", () => {
    expect(nextActionCode("CGK & HLP", EXISTING)).toBe("CGKHLP-TL14");
    expect(nextActionCode("SUB", EXISTING)).toBe("SUB-TL14");
  });
  test("a group without items starts at 01 with a prefix from its name", () => {
    expect(nextActionCode("DPS", EXISTING)).toBe("DPS-TL01");
  });
});

describe("validateNewItem", () => {
  test("cleans text, defaults status/progress, places the row after its group", () => {
    const { row, fieldErrors } = validateNewItem(INPUT, EXISTING);
    expect(fieldErrors).toEqual({});
    expect(row).toEqual({
      code: "CGKHLP-TL14",
      report_group: "CGK & HLP",
      area: "Evaluasi tambahan",
      action: "Kunjungan KPS kedua",
      target: null,
      kind: "Sekali",
      schedule: null,
      due_date: "2026-12-18",
      due_rule: null,
      pic: "OAO",
      status: "Belum Mulai",
      progress: 0,
      sort_order: 39,
    });
  });
  test("requires group, code, area and tindakan; refuses a taken code and bad enums", () => {
    const { row, fieldErrors } = validateNewItem(
      { ...INPUT, reportGroup: "CGK", code: "sub-tl13", area: " ", action: "", kind: "Kadang", dueDate: "2026-13-01", dueRule: "x" },
      EXISTING,
    );
    expect(row).toBeNull();
    expect(Object.keys(fieldErrors).sort()).toEqual(["action", "area", "code", "dueDate", "dueRule", "kind", "reportGroup"]);
  });
});

describe("addActionItem", () => {
  test("refuses anyone but the owner without touching the table", async () => {
    const { port, calls } = mockPort();
    expect(await addActionItem(false, port, INPUT)).toEqual({ ok: false, message: OWNER_ONLY_MESSAGE });
    expect(await addActionItem(true, null, INPUT)).toEqual({ ok: false, message: OWNER_ONLY_MESSAGE });
    expect(calls.listed).toBe(0);
    expect(calls.inserted).toHaveLength(0);
  });
  test("owner: inserts the validated row", async () => {
    const { port, calls } = mockPort();
    expect(await addActionItem(true, port, INPUT)).toEqual({ ok: true, code: "CGKHLP-TL14" });
    expect(calls.inserted).toHaveLength(1);
    expect(calls.inserted[0].report_group).toBe("CGK & HLP");
  });
  test("owner: invalid input never reaches insert", async () => {
    const { port, calls } = mockPort();
    const result = await addActionItem(true, port, { ...INPUT, area: "" });
    expect(result.ok).toBe(false);
    expect(calls.inserted).toHaveLength(0);
  });
  test("maps a duplicate key (23505) to the code field", async () => {
    const { port } = mockPort({ insert: async () => ({ error: { code: "23505", message: "duplicate key" } }) });
    const result = await addActionItem(true, port, INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors?.code).toContain("sudah dipakai");
  });
});

describe("removeActionItem", () => {
  test("refuses anyone but the owner", async () => {
    const { port, calls } = mockPort();
    expect(await removeActionItem(false, port, "SUB-TL13")).toEqual({ ok: false, message: OWNER_ONLY_MESSAGE });
    expect(calls.removed).toHaveLength(0);
  });
  test("owner: deletes by code, reports a missing row", async () => {
    const { port, calls } = mockPort();
    expect(await removeActionItem(true, port, " SUB-TL13 ")).toEqual({ ok: true, code: "SUB-TL13" });
    expect(calls.removed).toEqual(["SUB-TL13"]);
    const gone = mockPort({ remove: async () => ({ deleted: 0, error: null }) });
    const result = await removeActionItem(true, gone.port, "SUB-TL99");
    expect(result.ok).toBe(false);
  });
});
