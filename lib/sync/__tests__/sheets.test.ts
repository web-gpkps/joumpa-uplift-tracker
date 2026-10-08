import { describe, expect, test } from "bun:test";
import { emptyOps, encodeRaw, tabsToRead, type RealOps } from "../layouts";
import { isoToSerial } from "../normalize";
import { GoogleSheets, a1Column, contiguousDesc, quoteTab } from "../sheets";
import { SYNC_TABLES } from "../tables";
import { smallDb } from "../testing/fixtures";
import { WorkbookWorld } from "../testing/workbook";

// Google batchUpdate request objects, loosely typed for assertions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Req = Record<string, any>;

interface Call {
  method: string;
  url: string;
  body: Record<string, unknown> | undefined;
}

function mockFetch(responses: ((c: Call) => { status?: number; json: unknown } | undefined)[] = []) {
  const calls: Call[] = [];
  const f = async (url: string, init?: RequestInit) => {
    const call = { method: init?.method ?? "GET", url, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    for (const r of responses) {
      const hit = r(call);
      if (hit) return new Response(JSON.stringify(hit.json), { status: hit.status ?? 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };
  return { calls, fetch: f };
}

const token = async () => "test-token";

describe("helpers", () => {
  test("a1Column", () => {
    expect([0, 1, 25, 26, 27, 36, 51, 52, 701, 702].map(a1Column)).toEqual(["A", "B", "Z", "AA", "AB", "AK", "AZ", "BA", "ZZ", "AAA"]);
  });
  test("quoteTab escapes quotes", () => {
    expect(quoteTab("Cek BMI 2 Mingguan")).toBe("'Cek BMI 2 Mingguan'");
    expect(quoteTab("O'Brien")).toBe("'O''Brien'");
  });
  test("contiguousDesc groups rows bottom-up", () => {
    expect(contiguousDesc([2, 3, 4, 9, 7, 8, 12])).toEqual([[12, 12], [7, 9], [2, 4]]);
  });
  test("encodeRaw: dates as serials, null clears, text stays literal", () => {
    expect(encodeRaw("2026-10-12", "date")).toBe(isoToSerial("2026-10-12"));
    expect(encodeRaw(null, "text")).toBe("");
    expect(encodeRaw("=SUM(A1)", "text")).toBe("=SUM(A1)");
    expect(encodeRaw("1234", "text")).toBe("1234");
  });
});

const META = (sheets: { title: string; sheetId: number }[], locale = "id_ID", timeZone = "Asia/Jakarta") => (c: Call) =>
  c.url.includes("?fields=")
    ? { json: { properties: { locale, timeZone }, sheets: sheets.map((s) => ({ properties: { ...s, gridProperties: { rowCount: 1000, columnCount: 26 } } })) } }
    : undefined;

describe("GoogleSheets.read", () => {
  test("one metadata call + values and formulas for the synced tabs only", async () => {
    const m = mockFetch([
      META([{ title: "Master SDM", sheetId: 1 }, { title: "Dashboard", sheetId: 2 }], "en_US", "America/Los_Angeles"),
      (c) =>
        c.url.includes("values:batchGet")
          ? { json: { valueRanges: [{ values: c.url.includes("FORMULA") ? [["ID SDM", "=B5"]] : [["ID SDM", "SUB-01"]] }] } }
          : undefined,
    ]);
    const gs = new GoogleSheets("sheet-id", token, { fetch: m.fetch });
    const real = await gs.read(tabsToRead());
    expect(m.calls).toHaveLength(3);
    expect(m.calls.every((c) => c.method === "GET")).toBe(true);
    const urls = m.calls.slice(1).map((c) => decodeURIComponent(c.url.replace(/\+/g, " ")));
    expect(urls.some((u) => u.includes("valueRenderOption=UNFORMATTED_VALUE"))).toBe(true);
    expect(urls.some((u) => u.includes("valueRenderOption=FORMULA"))).toBe(true);
    expect(urls.every((u) => u.includes("ranges='Master SDM'") && !u.includes("Dashboard") && u.includes("dateTimeRenderOption=SERIAL_NUMBER"))).toBe(true);
    expect(real.tabs["Master SDM"]).toMatchObject({ values: [["ID SDM", "SUB-01"]], formulas: [["ID SDM", "=B5"]], rowCount: 1000 });
    expect(real.tabs["Tindak Lanjut"]).toBeUndefined();
    expect(real.locale).toBe("en_US");
    expect(SYNC_TABLES.length).toBe(7);
  });

  test("retries 429 and 5xx, then surfaces a SheetsError without a token in the message", async () => {
    let n = 0;
    const m = mockFetch([() => (n++ < 2 ? { status: 429, json: { error: { status: "RESOURCE_EXHAUSTED" } } } : { json: { properties: {}, sheets: [] } })]);
    await new GoogleSheets("id", token, { fetch: m.fetch, retryDelayMs: 1 }).read(["Master SDM"]);
    expect(m.calls).toHaveLength(3);

    const deny = mockFetch([() => ({ status: 403, json: { error: { status: "PERMISSION_DENIED", message: "The caller does not have permission" } } })]);
    await expect(new GoogleSheets("id", token, { fetch: deny.fetch, retryDelayMs: 1 }).read(["Master SDM"])).rejects.toThrow(/403 PERMISSION_DENIED/);
    expect(deny.calls).toHaveLength(1);
  });
});

async function applyWith(ops: RealOps, ids = new Map<number, number>(), locale = "id_ID") {
  const sheets = ["Parameter", "Master SDM", "Cek BMI 2 Mingguan", "Log Performa Mingguan", "Tindak Lanjut", "Penggantian SDM"].map((title, i) => ({ title, sheetId: i + 1 }));
  const m = mockFetch([META(sheets, locale), (c) => (c.url.includes("values:batchGet") ? { json: { valueRanges: sheets.map(() => ({ values: [] })) } } : undefined)]);
  const gs = new GoogleSheets("id", token, { fetch: m.fetch });
  await gs.read(sheets.map((s) => s.title));
  m.calls.length = 0;
  await gs.apply(ops, ids);
  return m.calls;
}

describe("GoogleSheets.apply", () => {
  test("first sync of the workbook: locale, Temuan tab, ID columns (format copied, P hidden), then RAW values", async () => {
    const w = new WorkbookWorld(smallDb());
    const { ops } = w.prepare();
    const calls = await applyWith(ops, new Map([[1, 1]]), "en_US");
    const setup = calls[0].body!.requests as Req[];
    expect(calls[0].url).toEndWith(":batchUpdate");
    expect(setup[0].updateSpreadsheetProperties.properties).toEqual({ locale: "id_ID", timeZone: "Asia/Jakarta" });
    expect(setup.filter((r) => r.addSheet).map((r) => r.addSheet.properties.title)).toEqual(["Temuan Mingguan"]);
    expect(setup.some((r) => r.addProtectedRange?.protectedRange?.warningOnly === true)).toBe(true);
    expect(setup.some((r) => r.copyPaste?.pasteType === "PASTE_FORMAT" && r.copyPaste.destination.startColumnIndex === 15)).toBe(true);
    expect(setup.find((r) => r.updateDimensionProperties)!.updateDimensionProperties).toMatchObject({ range: { sheetId: 6, dimension: "COLUMNS", startIndex: 15, endIndex: 16 }, properties: { hiddenByUser: true } });
    const header = setup.filter((r) => r.updateCells?.rows?.[0]?.values?.[0]?.userEnteredValue?.stringValue).map((r) => r.updateCells.rows[0].values.map((v: Req) => v.userEnteredValue.stringValue));
    expect(header).toContainEqual(["ID Sistem"]);
    expect(header).toContainEqual(["ID SDM"]);
    expect(header).toContainEqual(["Minggu Ke", "Lingkup", "Temuan"]);

    const values = calls.find((c) => c.url.endsWith("values:batchUpdate"))!;
    expect(values.body!.valueInputOption).toBe("RAW");
    const data = values.body!.data as { range: string; values: unknown[][] }[];
    expect(data).toContainEqual({ range: "'Penggantian SDM'!P5", values: [[1]] });
    expect(data).toContainEqual({ range: "'Temuan Mingguan'!C2", values: [["Temuan minggu 1"]] });
    expect(calls.some((c) => c.url.includes(":append"))).toBe(false);
  });

  test("formula copies (PASTE_FORMULA) and notes go in one structural batch after the values", async () => {
    const ops = emptyOps();
    ops.writes.push({ table: "weekly_scores", tab: "Log Performa Mingguan", row: 955, col: 0, value: 11 });
    ops.formulaCopies.push({ table: "weekly_scores", tab: "Log Performa Mingguan", fromRow: 5, toRow: 955, cols: [1, 3] });
    ops.notes.push({ table: "staff", tab: "Master SDM", row: 6, col: 9, text: "JOUMPA sync: Di luar rentang 1–5." });
    ops.grow.push({ table: "weekly_scores", tab: "Log Performa Mingguan", rowCount: 1100 });
    const calls = await applyWith(ops);
    expect((calls[0].body!.requests as Req[])[0].updateSheetProperties.properties).toEqual({ sheetId: 4, gridProperties: { rowCount: 1100 } });
    expect(calls[1].url).toEndWith("values:batchUpdate");
    const structural = calls[2].body!.requests as Req[];
    expect(structural.slice(0, 2).map((r) => [r.copyPaste.pasteType, r.copyPaste.source.startRowIndex, r.copyPaste.destination.startRowIndex, r.copyPaste.destination.startColumnIndex])).toEqual([
      ["PASTE_FORMULA", 4, 954, 1],
      ["PASTE_FORMULA", 4, 954, 3],
    ]);
    expect(structural[2].updateCells).toMatchObject({ fields: "note", range: { sheetId: 2, startRowIndex: 5, startColumnIndex: 9 } });
  });

  test("ids resolved after the DB insert; unknown refs skipped; skipped tables untouched", async () => {
    const ops = emptyOps();
    ops.writes.push({ table: "replacements", tab: "Penggantian SDM", row: 6, col: 15, value: null, ref: 1 });
    ops.writes.push({ table: "replacements", tab: "Penggantian SDM", row: 7, col: 15, value: null, ref: 2 });
    ops.writes.push({ table: "action_items", tab: "Tindak Lanjut", row: 5, col: 9, value: "PIC" });
    const sheets = ["Penggantian SDM", "Tindak Lanjut"].map((title, i) => ({ title, sheetId: i + 1 }));
    const m = mockFetch([META(sheets), (c) => (c.url.includes("batchGet") ? { json: { valueRanges: [{}, {}] } } : undefined)]);
    const gs = new GoogleSheets("id", token, { fetch: m.fetch });
    await gs.read(sheets.map((s) => s.title));
    m.calls.length = 0;
    await gs.apply(ops, new Map([[1, 42]]), { skipTables: new Set(["action_items"]) });
    expect(m.calls).toHaveLength(1);
    expect(m.calls[0].body!.data).toEqual([{ range: "'Penggantian SDM'!P6", values: [[42]] }]);
  });

  test("no requests at all when there is nothing to do and the locale is right", async () => {
    const calls = await applyWith(emptyOps());
    expect(calls).toEqual([]);
  });
});
