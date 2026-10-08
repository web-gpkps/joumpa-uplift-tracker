import { describe, expect, test } from 'bun:test';
import {
  actionProgress,
  dashboard,
  reportGroups,
  stationCodes,
  staffDerived,
  weeklyReport,
} from './aggregate';
import { SYNTHETIC as D, SYNTHETIC_TODAY as TODAY } from './__fixtures__/synthetic';
import { expectClose, rows } from './__fixtures__/close';
import { actionFlag, replacementPass, replacementTimeliness } from './rules';

// Every expected number below is worked out by hand from lib/__fixtures__/synthetic.ts.
const n = null;
const ACTION = ['key', 'total', 'selesai', 'onProgress', 'belumMulai', 'tertunda', 'overdue', 'dueSoon', 'pctDone', 'avgProgress'] as const;
const expectedActions = rows(
  ACTION,
  ['SUB', 3, 0, 1, 2, 0, 1, 2, 0, 50 / 3],
  ['DPS', 2, 1, 1, 0, 0, 0, 0, 0.5, 62.5],
  ['CGK & HLP', 2, 0, 0, 1, 1, 0, 0, 0, 5],
  ['KNO', 3, 0, 0, 3, 0, 0, 3, 0, 0], // all three are rolling due dates within 7 days
  ['TOTAL', 10, 1, 2, 6, 1, 1, 5, 0.1, 18.5],
);

describe('per-row results on the synthetic data', () => {
  test('action flags', () => {
    expect(D.actionItems.map((it) => actionFlag(it, D.settings, TODAY))).toEqual([
      'OVERDUE',
      'Jatuh tempo ≤ 7 hari',
      'Jatuh tempo ≤ 7 hari',
      'Rutin – pantau',
      'Selesai',
      null,
      'On Track',
      'Jatuh tempo ≤ 7 hari',
      'Jatuh tempo ≤ 7 hari',
      'Jatuh tempo ≤ 7 hari',
    ]);
  });

  test('replacement statuses', () => {
    expect(D.replacements.map((r) => [replacementPass(r, D.settings), replacementTimeliness(r, D.settings, TODAY)])).toEqual([
      ['Lulus – boleh bertugas', 'Tepat waktu'],
      [null, 'OVERDUE'],
      ['Belum lulus', 'Lewat 31 Okt'],
      ['Belum training/dinilai', 'OVERDUE'],
      ['Belum lulus', 'Tepat waktu'],
    ]);
  });

  test('staff baseline, rekap and BMI', () => {
    const d = staffDerived(D);
    expect(d.map((x) => [x.staff.code, x.baseline.practiceAvg, x.baseline.criteriaStatus, x.baseline.consistency])).toEqual([
      ['SUB-01', 4, 'Sesuai', 'OK'],
      ['SUB-02', 4, 'Perlu Perbaikan', 'Beda – verifikasi'],
      ['DPS-01', 2.83, 'Tidak Sesuai', 'OK'],
      ['DPS-02', 3, 'Perlu Perbaikan', null],
      ['CGK-01', 4, 'Sesuai', 'OK'],
      ['HLP-01', null, null, null],
      ['KNO-01', 3.5, 'Perlu Perbaikan', 'Beda – verifikasi'],
      ['KNO-02', 4.33, 'Sesuai', 'OK'],
    ]);
    expect(d.map((x) => [x.rekap?.latest, x.rekap?.latestWeek, x.rekap?.gain, x.rekap?.weeksAssessed, x.rekap?.currentStatus, x.rekap?.trend])).toEqual([
      [4.17, 4, 0.17, 3, 'Sesuai', '▲ Naik'],
      [3.5, 2, -0.5, 2, 'Perlu Perbaikan', '▼ Turun'],
      [4, 10, 1.17, 2, 'Sesuai', '▲ Naik'],
      [2.17, 1, -0.83, 1, 'Tidak Sesuai', '▼ Turun'],
      [4, 1, 0, 1, 'Sesuai', '= Tetap'],
      [null, null, null, 0, null, null],
      [3.67, 2, 0.17, 2, 'Perlu Perbaikan', '▲ Naik'],
      [null, null, null, 0, null, null],
    ]);
    expect(d.map((x) => [x.bmi.latestBmi, x.bmi.latestCategory, x.bmi.weightDelta, x.bmi.heightRequirement])).toEqual([
      [25, 'Normal', -2, 'Memenuhi'],
      [18.5, 'Normal', 0, 'Memenuhi'],
      [18.2, 'Kurus', 0, 'Tidak Memenuhi'],
      [27.3, 'Obesitas', 1, null],
      [30.1, 'Obesitas', 0, 'Tidak Memenuhi'],
      [null, null, null, null],
      [22.4, 'Normal', -1.5, 'Memenuhi'],
      [null, null, null, null],
    ]);
    expect(d[3].bmi.periods.map((p) => p?.category ?? null)).toEqual(['Overweight', 'Overweight', 'Obesitas', null, null]);
  });
});

describe('Dashboard on the synthetic data (today 2 Nov 2026)', () => {
  const dash = dashboard(D, TODAY);

  test('1. progress per report group', () => {
    expect(dash.asOf).toBe(TODAY);
    expectClose(dash.actionProgress, expectedActions);
  });

  test('2. performance per station', () => {
    expectClose(
      dash.performance,
      rows(
        ['key', 'staffCount', 'reportSesuai', 'reportPerlu', 'reportTidak', 'criteriaSesuai', 'beda', 'baselineAvg', 'currentAvg', 'gain', 'improved', 'currentSesuai', 'pctCurrentSesuai'],
        ['SUB', 2, 2, 0, 0, 1, 1, 4, 3.835, -0.165, 1, 1, 0.5],
        ['DPS', 2, 0, 0, 1, 0, 0, 2.915, 3.085, 0.17, 1, 1, 0.5],
        ['CGK', 1, 1, 0, 0, 1, 0, 4, 4, 0, 0, 1, 1],
        ['HLP', 1, 0, 1, 0, 0, 0, n, n, n, 0, 0, 0],
        ['KNO', 2, 1, 0, 1, 1, 1, 3.915, 3.67, -0.245, 1, 0, 0],
        // TOTAL baseline: 25.66 / 7 staff with a baseline; current: 21.51 / 6 staff with a weekly score
        ['TOTAL', 8, 4, 1, 2, 3, 2, 25.66 / 7, 3.585, 3.585 - 25.66 / 7, 3, 3, 0.375],
      ),
    );
  });

  test('3. BMI per station (latest check)', () => {
    expectClose(
      dash.bmi,
      rows(
        ['key', 'staffCount', 'everChecked', 'normal', 'kurus', 'overweight', 'obesitas', 'heightNotMet', 'avgWeightDelta'],
        ['SUB', 2, 2, 2, 0, 0, 0, 0, -1],
        ['DPS', 2, 2, 0, 1, 0, 1, 1, 0.5],
        ['CGK', 1, 1, 0, 0, 0, 1, 1, 0],
        ['HLP', 1, 0, 0, 0, 0, 0, 0, n],
        ['KNO', 2, 1, 1, 0, 0, 0, 0, -1.5],
        ['TOTAL', 8, 6, 3, 1, 0, 2, 2, -2.5 / 6],
      ),
    );
  });

  test('4. replacements per report group', () => {
    expectClose(
      dash.replacements,
      rows(
        ['key', 'toReplace', 'placed', 'passed', 'lateOrOverdue', 'reported'],
        ['SUB', 2, 1, 1, 1, 1],
        ['DPS', 1, 1, 0, 0, 0],
        ['CGK & HLP', 1, 1, 0, 1, 0],
        ['KNO', 1, 1, 0, 1, 1],
        ['TOTAL', 5, 4, 1, 3, 2],
      ),
    );
  });

  test('TOTAL rows count rows outside the listed groups (like COUNTIFS without a group)', () => {
    const extra = [...D.actionItems, { code: 'X-1', reportGroup: null, kind: 'Sekali', dueDate: '2026-10-01', status: 'Belum Mulai', progress: 40 }];
    const r = actionProgress(extra, D.settings, TODAY);
    expect(r.at(-1)).toMatchObject({ key: 'TOTAL', total: 11, overdue: 2, belumMulai: 7 });
    expect(r.slice(0, -1).reduce((a, x) => a + x.total, 0)).toBe(10);
  });
});

const WEEKLY = ['key', 'staffCount', 'assessed', 'avgThisWeek', 'avgLastWeek', 'changeVsLastWeek', 'baselineAvg', 'gainVsBaseline', 'sesuai', 'perlu', 'tidak', 'pctSesuai'] as const;
const BMI_PERIOD = ['key', 'staffCount', 'checked', 'notChecked', 'normal', 'kurus', 'overweight', 'obesitas', 'pctNormal', 'heightNotMet'] as const;
const TOTAL_BASELINE = 25.66 / 7;

describe('Laporan Mingguan on the synthetic data', () => {
  test('week 1: no previous week, BMI period 1', () => {
    const r = weeklyReport(D, 1, TODAY);
    expect([r.periodStart, r.periodEnd, r.bmiPeriod, r.bmiPlannedDate]).toEqual(['2026-10-12', '2026-10-18', 1, '2026-10-12']);
    expectClose(
      r.performance,
      rows(
        WEEKLY,
        ['SUB', 2, 2, 3.5, n, n, 4, -0.5, 1, 1, 0, 0.5], // 3.00 Perlu, 4.00 Sesuai
        ['DPS', 2, 1, 2.17, n, n, 2.915, 2.17 - 2.915, 0, 0, 1, 0],
        ['CGK', 1, 1, 4, n, n, 4, 0, 1, 0, 0, 1],
        ['HLP', 1, 0, n, n, n, n, n, 0, 0, 0, n], // a row without scores is not "assessed"
        ['KNO', 2, 1, 3.33, n, n, 3.915, 3.33 - 3.915, 0, 1, 0, 0],
        ['TOTAL', 8, 5, 3.3, n, n, TOTAL_BASELINE, 3.3 - TOTAL_BASELINE, 2, 2, 1, 0.4],
      ),
    );
    expectClose(
      r.bmi,
      rows(
        BMI_PERIOD,
        ['SUB', 2, 2, 0, 1, 0, 1, 0, 0.5, 0],
        ['DPS', 2, 2, 0, 0, 1, 1, 0, 0, 1],
        ['CGK', 1, 0, 1, 0, 0, 0, 0, n, 1],
        ['HLP', 1, 0, 1, 0, 0, 0, 0, n, 0],
        ['KNO', 2, 1, 1, 1, 0, 0, 0, 1, 0],
        ['TOTAL', 8, 5, 3, 2, 1, 2, 0, 0.4, 2],
      ),
    );
  });

  test('week 2: change vs last week', () => {
    const r = weeklyReport(D, 2, TODAY);
    expect(r.bmiPeriod).toBe(1);
    expectClose(
      r.performance,
      rows(
        WEEKLY,
        ['SUB', 2, 2, 3.75, 3.5, 0.25, 4, -0.25, 1, 1, 0, 0.5],
        ['DPS', 2, 1, 3, 2.17, 0.83, 2.915, 0.085, 0, 1, 0, 0],
        ['CGK', 1, 0, n, 4, n, 4, n, 0, 0, 0, n],
        ['HLP', 1, 0, n, n, n, n, n, 0, 0, 0, n],
        ['KNO', 2, 1, 3.67, 3.33, 0.34, 3.915, -0.245, 0, 1, 0, 0],
        ['TOTAL', 8, 4, 3.5425, 3.3, 0.2425, TOTAL_BASELINE, 3.5425 - TOTAL_BASELINE, 1, 3, 0, 0.25],
      ),
    );
  });

  test('week 4: BMI period 2, height column uses the latest check', () => {
    const r = weeklyReport(D, 4, TODAY);
    expect([r.periodStart, r.periodEnd, r.bmiPeriod, r.bmiPlannedDate]).toEqual(['2026-11-02', '2026-11-08', 2, '2026-10-26']);
    expectClose(
      r.performance,
      rows(
        WEEKLY,
        ['SUB', 2, 1, 4.17, n, n, 4, 0.17, 1, 0, 0, 1],
        ['DPS', 2, 0, n, n, n, 2.915, n, 0, 0, 0, n],
        ['CGK', 1, 0, n, n, n, 4, n, 0, 0, 0, n],
        ['HLP', 1, 0, n, n, n, n, n, 0, 0, 0, n],
        ['KNO', 2, 0, n, n, n, 3.915, n, 0, 0, 0, n],
        ['TOTAL', 8, 1, 4.17, n, n, TOTAL_BASELINE, 4.17 - TOTAL_BASELINE, 1, 0, 0, 1],
      ),
    );
    expectClose(
      r.bmi,
      rows(
        BMI_PERIOD,
        ['SUB', 2, 1, 1, 1, 0, 0, 0, 1, 0],
        ['DPS', 2, 1, 1, 0, 0, 1, 0, 0, 1],
        ['CGK', 1, 1, 0, 0, 0, 0, 1, 0, 1],
        ['HLP', 1, 0, 1, 0, 0, 0, 0, n, 0],
        ['KNO', 2, 1, 1, 1, 0, 0, 0, 1, 0],
        ['TOTAL', 8, 4, 4, 2, 0, 1, 1, 0.5, 2],
      ),
    );
    expectClose(r.actionProgress, expectedActions);
  });

  test('D. trend per station and SEMUA', () => {
    const r = weeklyReport(D, 10, TODAY);
    expect(r.bmiPeriod).toBe(5);
    const w = (...xs: Array<number | null>) => [...xs, ...Array(10 - xs.length).fill(null)];
    expectClose(r.trend, [
      { key: 'SUB', weeks: w(3.5, 3.75, n, 4.17) },
      { key: 'DPS', weeks: w(2.17, 3, n, n, n, n, n, n, n, 4) },
      { key: 'CGK', weeks: w(4) },
      { key: 'HLP', weeks: w() },
      { key: 'KNO', weeks: w(3.33, 3.67) },
      { key: 'SEMUA', weeks: w(3.3, 3.5425, n, 4.17, n, n, n, n, n, 4) },
    ]);
  });

  test('rejects an invalid week', () => {
    expect(() => weeklyReport(D, 0, TODAY)).toThrow();
  });
});

describe('stations', () => {
  test('defaults and custom order', () => {
    expect(stationCodes()).toEqual(['SUB', 'DPS', 'CGK', 'HLP', 'KNO']);
    expect(reportGroups()).toEqual(['SUB', 'DPS', 'CGK & HLP', 'KNO']);
    const custom = [
      { code: 'KNO', reportGroup: 'KNO', sort: 5 },
      { code: 'HLP', reportGroup: 'CGK & HLP', sort: 4 },
      { code: 'SUB', reportGroup: 'SUB', sort: 1 },
      { code: 'CGK', reportGroup: 'CGK & HLP', sort: 3 },
      { code: 'DPS', reportGroup: 'DPS', sort: 2 },
    ];
    expect(stationCodes(custom)).toEqual(['SUB', 'DPS', 'CGK', 'HLP', 'KNO']);
    expect(reportGroups(custom)).toEqual(['SUB', 'DPS', 'CGK & HLP', 'KNO']);
  });
});
