import { describe, expect, test } from 'bun:test';
import { SYNTHETIC as D, SYNTHETIC_TODAY as TODAY } from './__fixtures__/synthetic';
import { TOTAL, actionProgress, bmiPeriodByStation, stationCodes, weeklyPerformance } from './aggregate';
import { dashboardSummary } from './dashboard';
import { replacementTimeliness } from './rules';

const STATIONS = stationCodes(D.stations);

describe('dashboard summary', () => {
  test('during the programme: five real tiles that agree with lib/aggregate', () => {
    const sum = dashboardSummary(D, TODAY, STATIONS);
    expect(sum.phase).toBe('during');
    expect(sum.week).toBe(4); // 2 Nov 2026 is in week 4 (week 1 starts 12 Oct)
    expect(sum.bmiPeriod).toBe(2); // checks 12 Okt, 26 Okt, 9 Nov…
    expect(sum.kpis.map((k) => k.key)).toEqual(['tl-selesai', 'tl-overdue', 'dinilai', 'bmi', 'penggantian']);

    const actions = actionProgress(D.actionItems, D.settings, TODAY).find((r) => r.key === TOTAL)!;
    const [done, overdue, assessed, bmi, repl] = sum.kpis;
    expect([done.value, done.total]).toEqual([actions.selesai, actions.total]);
    expect(overdue.value).toBe(actions.overdue);
    expect(overdue.tone).toBe(actions.overdue > 0 ? 'critical' : 'neutral');

    const weekly = weeklyPerformance(D, 4).find((r) => r.key === TOTAL)!;
    expect([assessed.value, assessed.total]).toEqual([weekly.assessed, weekly.staffCount]);
    expect(assessed.link).toEqual({ sheet: 'performa', query: { minggu: 4 } });

    const period = bmiPeriodByStation(D, 2).find((r) => r.key === TOTAL)!;
    expect([bmi.value, bmi.total]).toEqual([period.checked, period.staffCount]);

    const named = D.replacements.filter((r) => r.replacedName);
    const onTime = named.filter((r) => replacementTimeliness(r, D.settings, TODAY) === 'Tepat waktu').length;
    expect([repl.value, repl.total, repl.tone]).toEqual([onTime, named.length, 'critical']); // fixture has OVERDUE rows
    for (const k of sum.kpis) expect(k.note).toBeUndefined();
  });

  test('before the programme: no zeros posing as results', () => {
    const sum = dashboardSummary(D, '2026-10-08', STATIONS);
    expect(sum.phase).toBe('before');
    expect(sum.week).toBeNull();
    expect(sum.bmiPeriod).toBeNull();
    const assessed = sum.kpis.find((k) => k.key === 'dinilai')!;
    const bmi = sum.kpis.find((k) => k.key === 'bmi')!;
    expect(assessed.value).toBeNull();
    expect(assessed.note).toBe('Penilaian mulai Minggu ke-1, Senin, 12 Okt 2026.');
    expect(bmi.value).toBeNull();
    expect(bmi.note).toBe('Cek pertama Senin, 12 Okt 2026.');
    expect(sum.comparison.every((r) => r.assessed.value === null && r.bmiChecked.value === null)).toBe(true);
  });

  test('one row per station, CGK and HLP share the report group, every cell links to its sheet', () => {
    const sum = dashboardSummary(D, TODAY, STATIONS);
    expect(sum.comparison.map((r) => r.station)).toEqual(STATIONS);
    const cgk = sum.comparison.find((r) => r.station === 'CGK')!;
    const hlp = sum.comparison.find((r) => r.station === 'HLP')!;
    expect(cgk.group).toBe('CGK & HLP');
    expect(cgk.sharedGroup).toBe(true);
    expect(hlp.actionsDone).toEqual({ ...cgk.actionsDone, link: hlp.actionsDone.link });
    expect(cgk.assessed.link).toEqual({ sheet: 'performa', query: { stasiun: 'CGK', minggu: 4 } });
    expect(cgk.bmiChecked.link).toEqual({ sheet: 'bmi', query: { stasiun: 'CGK', periode: 2 } });
    expect(sum.comparison.find((r) => r.station === 'SUB')!.sharedGroup).toBe(false);
  });

  test('a single station in view counts only that station', () => {
    const sub = { ...D, staff: D.staff.filter((s) => s.station === 'SUB'), stations: D.stations?.filter((s) => s.code === 'SUB') };
    const sum = dashboardSummary(sub, TODAY, ['SUB']);
    expect(sum.comparison).toHaveLength(1);
    expect(sum.kpis.find((k) => k.key === 'dinilai')!.total).toBe(sub.staff.length);
  });

  test('after the programme the weekly tile refers to the last week', () => {
    const sum = dashboardSummary(D, '2027-01-15', STATIONS);
    expect(sum.phase).toBe('after');
    expect(sum.week).toBe(D.settings.weeks);
    expect(sum.kpis.find((k) => k.key === 'dinilai')!.label).toBe(`SDM dinilai Minggu ke-${D.settings.weeks}`);
  });
});
