/**
 * Workbook parity: lib/aggregate.ts and lib/rules.ts must reproduce the cached results of
 * "Tracker Tindak Lanjut Uplifting JOUMPA.xlsx".
 *
 * - lib/__fixtures__/workbook-expected.json (committed, aggregates only) comes from
 *   `python3 -I scripts/extract_expected.py`.
 * - scripts/out/rows.json (gitignored, personal data) comes from
 *   `python3 -I scripts/import_xlsx.py`: the seed rows plus the workbook's per-row results.
 *   Without it the input-dependent tests are skipped.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dashboard, weeklyReport, type TrackerData } from './aggregate';
import {
  DEFAULT_SETTINGS,
  actionDaysLeft,
  actionDueRule,
  actionFlag,
  effectiveDueDate,
  replacementPass,
  replacementTimeliness,
  staffBaseline,
  inferDueRule,
  type ActionItemRow,
  type ReplacementRow,
  type Settings,
  type StaffRow,
} from './rules';
import expected from './__fixtures__/workbook-expected.json';
import { expectClose } from './__fixtures__/close';

const ROWS_PATH = fileURLToPath(new URL('../scripts/out/rows.json', import.meta.url));

interface RowsFile {
  sha256: string;
  today: string;
  settings: Settings;
  staff: StaffRow[];
  actionItems: ActionItemRow[];
  replacements: ReplacementRow[];
  cached: {
    staff: Record<string, { practiceAvg: number | null; criteriaStatus: string | null; consistency: string | null }>;
    actionItems: Record<string, { dueDate: string | null; dueIsFormula: boolean; daysLeft: number | null; flag: string | null }>;
    replacements: Array<{ pass: string | null; timeliness: string | null }>;
  };
}

const rowsFile: RowsFile | null = existsSync(ROWS_PATH) ? JSON.parse(readFileSync(ROWS_PATH, 'utf8')) : null;
const byKey = <T extends { key: unknown }>(rs: T[]) => Object.fromEntries(rs.map((r) => [String(r.key), r]));

describe('workbook-expected.json (committed cached aggregates)', () => {
  const perf = byKey(expected.dashboard.performance);
  test('known headline numbers', () => {
    expect(expected.today).toBe('2026-10-07');
    expect(perf.TOTAL.baselineAvg).toBeCloseTo(3.3993, 4);
    expect([perf.TOTAL.reportSesuai, perf.TOTAL.reportPerlu, perf.TOTAL.reportTidak]).toEqual([21, 51, 3]);
    expect(perf.TOTAL.criteriaSesuai).toBe(3);
    expect(perf.TOTAL.beda).toBe(20);
    expect(['SUB', 'DPS', 'CGK', 'HLP', 'KNO', 'TOTAL'].map((k) => perf[k].staffCount)).toEqual([5, 26, 27, 4, 13, 75]);
    const actions = byKey(expected.dashboard.actionProgress);
    expect([actions.TOTAL.total, actions.TOTAL.belumMulai, actions.TOTAL.dueSoon]).toEqual([52, 52, 8]);
    const repl = byKey(expected.dashboard.replacements);
    expect([repl.SUB.toReplace, repl.DPS.toReplace, repl['CGK & HLP'].toReplace, repl.KNO.toReplace, repl.TOTAL.toReplace]).toEqual([2, 0, 0, 2, 4]);
    expect(repl.TOTAL.lateOrOverdue).toBe(0);
  });
  test('Dashboard section 1 mirrors Laporan section B', () => {
    expect(expected.dashboard.actionProgress).toEqual(expected.weeklyReport.actionProgress);
  });
});

describe.skipIf(!rowsFile)('parity with the workbook (needs scripts/out/rows.json)', () => {
  const f = rowsFile!;
  const data: TrackerData = {
    settings: f.settings,
    staff: f.staff,
    weeklyScores: [],
    bmiChecks: [],
    actionItems: f.actionItems,
    replacements: f.replacements,
  };

  test('rows.json and the expected fixture come from the same workbook', () => {
    expect(f.sha256).toBe(expected.sha256);
    expect(f.today).toBe(expected.today);
  });

  test('settings read from sheet Parameter equal DEFAULT_SETTINGS', () => {
    expect(f.settings).toEqual({ ...DEFAULT_SETTINGS });
  });

  test('Dashboard sections 1–4', () => {
    expectClose(dashboard(data, f.today), expected.dashboard, 12);
  });

  test('Laporan Mingguan header and sections A–D', () => {
    expectClose(weeklyReport(data, expected.weeklyReport.week, f.today), expected.weeklyReport, 12);
  });

  test('Master SDM P/R/S for all 75 staff', () => {
    expect(f.staff).toHaveLength(75);
    for (const st of f.staff) {
      const c = f.cached.staff[st.code];
      const b = staffBaseline(st, f.settings);
      expect([st.code, b.practiceAvg, b.criteriaStatus, b.consistency]).toEqual([st.code, c.practiceAvg, c.criteriaStatus, c.consistency]);
    }
    const beda = f.staff.filter((st) => staffBaseline(st, f.settings).consistency === 'Beda – verifikasi');
    expect(beda).toHaveLength(20);
  });

  test('Tindak Lanjut I/P/Q for all 52 items, including the 12 rolling due dates', () => {
    expect(f.actionItems).toHaveLength(52);
    for (const it of f.actionItems) {
      const c = f.cached.actionItems[it.code];
      expect([it.code, effectiveDueDate(it, f.settings, f.today), actionDaysLeft(it, f.settings, f.today), actionFlag(it, f.settings, f.today)])
        .toEqual([it.code, c.dueDate, c.daysLeft, c.flag]);
      // the workbook's formula-driven due dates are exactly the items with a rolling rule
      expect([it.code, actionDueRule(it) !== null]).toEqual([it.code, c.dueIsFormula]);
    }
    expect(f.actionItems.filter((it) => actionDueRule(it) !== null)).toHaveLength(12);
    // the seeded due_rule column agrees with what the schedule text implies
    expect(f.actionItems.filter((it) => it.dueRule !== inferDueRule(it.schedule))).toEqual([]);
    expect(f.actionItems.filter((it) => actionFlag(it, f.settings, f.today) === 'Jatuh tempo ≤ 7 hari')).toHaveLength(8);
  });

  test('Penggantian SDM L/M', () => {
    expect(f.replacements.map((r) => [replacementPass(r, f.settings), replacementTimeliness(r, f.settings, f.today)]))
      .toEqual(f.cached.replacements.map((c) => [c.pass, c.timeliness]));
    expect(f.replacements.map((r) => replacementTimeliness(r, f.settings, f.today))).toEqual(['Menunggu', 'Menunggu', 'Menunggu', 'Menunggu']);
  });

  test('every replacement links to a roster staff member of the same station', () => {
    const stationOf = new Map(f.staff.map((st) => [st.code, st.station]));
    expect(f.replacements.map((r) => r.staffCode)).toEqual(['SUB-01', 'KNO-06', 'KNO-12', 'SUB-03']);
    for (const r of f.replacements) expect(stationOf.get(r.staffCode!)).toBe(r.station);
  });
});
