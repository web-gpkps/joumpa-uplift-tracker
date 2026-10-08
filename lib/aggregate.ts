/**
 * Dashboard (sections 1–4) and Laporan Mingguan (sections A–D), ported from the workbook.
 *
 * Input: plain arrays of DB rows with **camelCase** keys, typed in `./rules`
 * (`StaffRow`, `WeeklyScoreRow`, `BmiCheckRow`, `ActionItemRow`, `ReplacementRow`, `StationRow`).
 * Map supabase-js results with `camelize()` from `./rules`. "Today" is always an argument.
 *
 * Output conventions:
 * - A section is an array of rows: one per station (performance, BMI) or per report group
 *   (action items, replacements), in station `sort` order, then a `TOTAL` row
 *   (section D ends with `SEMUA`, as in the workbook).
 * - Excel `""` (nothing to show) is `null`.
 * - Ratios (`pctDone`, `pctSesuai`, `pctNormal`, `pctCurrentSesuai`) are fractions 0..1, like the
 *   workbook's `0%` cells. `avgProgress` is in DB units 0..100 (same unit as `action_items.progress`).
 * - Averages are not rounded; format at display (scores 2 dp, kg 1 dp).
 * - TOTAL rows follow the workbook: counts and averages are over ALL rows (no group filter),
 *   except "Jumlah SDM" (`staffCount`), which is the sum of the station rows.
 */

import {
  REPORT_GROUPS,
  STATIONS,
  actionFlag,
  average,
  bmiCheckDate,
  bmiPeriodForWeek,
  bmiSummary,
  cleanFloat,
  practiceAvg,
  replacementPass,
  replacementTimeliness,
  sameText,
  staffBaseline,
  staffRekap,
  startsWithText,
  weekEnd,
  weekStart,
  weeklyStatus,
  type ActionItemRow,
  type BmiCheckRow,
  type BmiSummary,
  type DateInput,
  type IsoDate,
  type ReplacementRow,
  type Settings,
  type StaffBaseline,
  type StaffRekap,
  type StaffRow,
  type StationRow,
  type WeeklyScoreRow,
} from './rules';
import { toIsoDate } from './dates';

export const TOTAL = 'TOTAL';
export const SEMUA = 'SEMUA';

export interface TrackerData {
  settings: Settings;
  staff: readonly StaffRow[];
  weeklyScores: readonly WeeklyScoreRow[];
  bmiChecks: readonly BmiCheckRow[];
  actionItems: readonly ActionItemRow[];
  replacements: readonly ReplacementRow[];
  /** Defaults to SUB, DPS, CGK, HLP, KNO with CGK/HLP → "CGK & HLP". */
  stations?: readonly StationRow[];
}

// ---------------------------------------------------------------------------
// Output rows
// ---------------------------------------------------------------------------

/** Dashboard 1 / Laporan B (per report group). */
export interface ActionProgressRow {
  key: string;
  total: number;
  selesai: number;
  onProgress: number;
  belumMulai: number;
  tertunda: number;
  overdue: number;
  /** Flag "Jatuh tempo ≤ 7 hari". */
  dueSoon: number;
  /** Selesai / total, 0..1. */
  pctDone: number | null;
  /** Mean progress, 0..100. */
  avgProgress: number | null;
}

/** Dashboard 2 (per station). */
export interface PerformanceRow {
  key: string;
  staffCount: number;
  /** Report conclusion "Sesuai*" (includes "Sesuai dengan Catatan"). */
  reportSesuai: number;
  reportPerlu: number;
  reportTidak: number;
  /** Criteria 6.2 status = Sesuai. */
  criteriaSesuai: number;
  /** Consistency "Beda – verifikasi". */
  beda: number;
  baselineAvg: number | null;
  /** Mean of the latest weekly score, over staff who have one. */
  currentAvg: number | null;
  gain: number | null;
  /** Trend ▲. */
  improved: number;
  /** Current status = Sesuai. */
  currentSesuai: number;
  /** currentSesuai / staffCount, 0..1. */
  pctCurrentSesuai: number | null;
}

/** Dashboard 3 (per station, latest check of each staff member). */
export interface BmiOverviewRow {
  key: string;
  staffCount: number;
  everChecked: number;
  normal: number;
  kurus: number;
  overweight: number;
  obesitas: number;
  heightNotMet: number;
  avgWeightDelta: number | null;
}

/** Dashboard 4 (per report group). */
export interface ReplacementOverviewRow {
  key: string;
  /** "SDM Akan Diganti": rows with a replaced name. */
  toReplace: number;
  /** "Pengganti Sudah Ditempatkan": rows with a replacement name. */
  placed: number;
  passed: number;
  /** OVERDUE or "Lewat …". */
  lateOrOverdue: number;
  /** Reported = Ya. */
  reported: number;
}

/** Laporan A (per station, selected week). */
export interface WeeklyPerformanceRow {
  key: string;
  staffCount: number;
  assessed: number;
  avgThisWeek: number | null;
  avgLastWeek: number | null;
  changeVsLastWeek: number | null;
  baselineAvg: number | null;
  gainVsBaseline: number | null;
  sesuai: number;
  perlu: number;
  tidak: number;
  /** sesuai / assessed, 0..1. */
  pctSesuai: number | null;
}

/** Laporan C (per station, BMI period of the selected week). */
export interface BmiPeriodRow {
  key: string;
  staffCount: number;
  checked: number;
  notChecked: number;
  normal: number;
  kurus: number;
  overweight: number;
  obesitas: number;
  /** normal / checked, 0..1. */
  pctNormal: number | null;
  /** From each staff member's latest check, not the selected period (as in the workbook). */
  heightNotMet: number;
}

/** Laporan D (per station + SEMUA). `weeks[0]` is week 1. */
export interface TrendRow {
  key: string;
  weeks: Array<number | null>;
}

export interface Dashboard {
  asOf: IsoDate;
  actionProgress: ActionProgressRow[];
  performance: PerformanceRow[];
  bmi: BmiOverviewRow[];
  replacements: ReplacementOverviewRow[];
}

export interface WeeklyReport {
  week: number;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  bmiPeriod: number;
  bmiPlannedDate: IsoDate;
  asOf: IsoDate;
  performance: WeeklyPerformanceRow[];
  actionProgress: ActionProgressRow[];
  bmi: BmiPeriodRow[];
  trend: TrendRow[];
}

export interface StaffDerived {
  staff: StaffRow;
  baseline: StaffBaseline;
  rekap: StaffRekap | null;
  bmi: BmiSummary;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasText(v: string | null | undefined): boolean {
  return v != null && v.trim() !== '';
}

function count<T>(rows: readonly T[], pred: (r: T) => boolean): number {
  let n = 0;
  for (const r of rows) if (pred(r)) n += 1;
  return n;
}

function ratio(num: number, den: number): number | null {
  return den === 0 ? null : num / den;
}

function diff(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : cleanFloat(a - b);
}

export function stationCodes(stations?: readonly StationRow[]): string[] {
  if (!stations || stations.length === 0) return [...STATIONS];
  return [...stations]
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (a.s.sort ?? a.i) - (b.s.sort ?? b.i) || a.i - b.i)
    .map(({ s }) => s.code);
}

export function reportGroups(stations?: readonly StationRow[]): string[] {
  if (!stations || stations.length === 0) return [...REPORT_GROUPS];
  const out: string[] = [];
  for (const code of stationCodes(stations)) {
    const g = stations.find((s) => s.code === code)!.reportGroup;
    if (!out.includes(g)) out.push(g);
  }
  return out;
}

function groupBy<T>(rows: readonly T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return m;
}

/** Per-staff derived values (Master SDM P–S, Rekap Performa, Cek BMI), in input order. */
export function staffDerived(data: TrackerData): StaffDerived[] {
  const s = data.settings;
  const scoresByStaff = groupBy(data.weeklyScores, (r) => r.staffCode);
  const checksByStaff = groupBy(data.bmiChecks, (r) => r.staffCode);
  return data.staff.map((st) => ({
    staff: st,
    baseline: staffBaseline(st, s),
    // Rekap F–O are blank when the name is blank.
    rekap: hasText(st.name) ? staffRekap(st, scoresByStaff.get(st.code) ?? [], s) : null,
    bmi: bmiSummary(checksByStaff.get(st.code) ?? [], st.gender, s),
  }));
}

/** Laporan C10…C14 / Dashboard C15…: staff with a name per station, TOTAL = sum. */
function staffCounts(staff: readonly StaffRow[], stations: string[]): Map<string, number> {
  const m = new Map<string, number>();
  let total = 0;
  for (const code of stations) {
    const n = count(staff, (r) => sameText(r.station, code) && hasText(r.name));
    m.set(code, n);
    total += n;
  }
  m.set(TOTAL, total);
  return m;
}

function inKey(station: string | null | undefined, key: string): boolean {
  return key === TOTAL || key === SEMUA || sameText(station, key);
}

// ---------------------------------------------------------------------------
// Dashboard 1 / Laporan B: action items per report group
// ---------------------------------------------------------------------------

export function actionProgress(
  items: readonly ActionItemRow[],
  s: Settings,
  today: DateInput,
  groups: readonly string[] = REPORT_GROUPS,
): ActionProgressRow[] {
  const flagged = items.map((it) => ({ it, flag: actionFlag(it, s, today) }));
  const row = (key: string): ActionProgressRow => {
    const rows = key === TOTAL ? flagged : flagged.filter(({ it }) => sameText(it.reportGroup, key));
    // TOTAL "Total Butir" is COUNTA of the ID column.
    const total = key === TOTAL ? count(rows, ({ it }) => hasText(it.code)) : rows.length;
    const selesai = count(rows, ({ it }) => sameText(it.status, 'Selesai'));
    return {
      key,
      total,
      selesai,
      onProgress: count(rows, ({ it }) => sameText(it.status, 'On Progress')),
      belumMulai: count(rows, ({ it }) => sameText(it.status, 'Belum Mulai')),
      tertunda: count(rows, ({ it }) => sameText(it.status, 'Tertunda')),
      overdue: count(rows, ({ flag }) => flag === 'OVERDUE'),
      dueSoon: count(rows, ({ flag }) => startsWithText(flag, 'Jatuh tempo')),
      pctDone: ratio(selesai, total),
      avgProgress: average(rows.map(({ it }) => it.progress)),
    };
  };
  return [...groups.map(row), row(TOTAL)];
}

// ---------------------------------------------------------------------------
// Dashboard 2: performance per station
// ---------------------------------------------------------------------------

export function performanceByStation(data: TrackerData, derived = staffDerived(data)): PerformanceRow[] {
  const stations = stationCodes(data.stations);
  const counts = staffCounts(data.staff, stations);
  const row = (key: string): PerformanceRow => {
    const rows = derived.filter((d) => inKey(d.staff.station, key));
    const staffCount = counts.get(key) ?? 0;
    const baselineAvg = average(rows.map((d) => d.baseline.practiceAvg));
    const currentAvg = average(rows.map((d) => d.rekap?.latest ?? null));
    const currentSesuai = count(rows, (d) => d.rekap?.currentStatus === 'Sesuai');
    return {
      key,
      staffCount,
      reportSesuai: count(rows, (d) => startsWithText(d.staff.reportConclusion, 'Sesuai')),
      reportPerlu: count(rows, (d) => startsWithText(d.staff.reportConclusion, 'Perlu')),
      reportTidak: count(rows, (d) => startsWithText(d.staff.reportConclusion, 'Tidak')),
      criteriaSesuai: count(rows, (d) => d.baseline.criteriaStatus === 'Sesuai'),
      beda: count(rows, (d) => startsWithText(d.baseline.consistency, 'Beda')),
      baselineAvg,
      currentAvg,
      gain: diff(currentAvg, baselineAvg),
      improved: count(rows, (d) => startsWithText(d.rekap?.trend, '▲')),
      currentSesuai,
      pctCurrentSesuai: ratio(currentSesuai, staffCount),
    };
  };
  return [...stations.map(row), row(TOTAL)];
}

// ---------------------------------------------------------------------------
// Dashboard 3: BMI per station (latest check)
// ---------------------------------------------------------------------------

export function bmiByStation(data: TrackerData, derived = staffDerived(data)): BmiOverviewRow[] {
  const stations = stationCodes(data.stations);
  const counts = staffCounts(data.staff, stations);
  const row = (key: string): BmiOverviewRow => {
    const rows = derived.filter((d) => inKey(d.staff.station, key));
    return {
      key,
      staffCount: counts.get(key) ?? 0,
      everChecked: count(rows, (d) => (d.bmi.latestBmi ?? 0) > 0),
      normal: count(rows, (d) => d.bmi.latestCategory === 'Normal'),
      kurus: count(rows, (d) => d.bmi.latestCategory === 'Kurus'),
      overweight: count(rows, (d) => d.bmi.latestCategory === 'Overweight'),
      obesitas: count(rows, (d) => d.bmi.latestCategory === 'Obesitas'),
      heightNotMet: count(rows, (d) => d.bmi.heightRequirement === 'Tidak Memenuhi'),
      avgWeightDelta: average(rows.map((d) => d.bmi.weightDelta)),
    };
  };
  return [...stations.map(row), row(TOTAL)];
}

// ---------------------------------------------------------------------------
// Dashboard 4: replacements per report group
// ---------------------------------------------------------------------------

export function replacementsByGroup(
  replacements: readonly ReplacementRow[],
  s: Settings,
  today: DateInput,
  groups: readonly string[] = REPORT_GROUPS,
): ReplacementOverviewRow[] {
  const row = (key: string): ReplacementOverviewRow => {
    const rows = key === TOTAL ? replacements : replacements.filter((r) => sameText(r.reportGroup, key));
    return {
      key,
      toReplace: count(rows, (r) => hasText(r.replacedName)),
      placed: count(rows, (r) => hasText(r.replacementName)),
      passed: count(rows, (r) => startsWithText(replacementPass(r, s), 'Lulus')),
      lateOrOverdue: count(rows, (r) => {
        const t = replacementTimeliness(r, s, today);
        return t === 'OVERDUE' || startsWithText(t, 'Lewat');
      }),
      reported: count(rows, (r) => sameText(r.reported, 'Ya')),
    };
  };
  return [...groups.map(row), row(TOTAL)];
}

export function dashboard(data: TrackerData, today: DateInput): Dashboard {
  const derived = staffDerived(data);
  const groups = reportGroups(data.stations);
  return {
    asOf: toIsoDate(today),
    actionProgress: actionProgress(data.actionItems, data.settings, today, groups),
    performance: performanceByStation(data, derived),
    bmi: bmiByStation(data, derived),
    replacements: replacementsByGroup(data.replacements, data.settings, today, groups),
  };
}

// ---------------------------------------------------------------------------
// Laporan Mingguan
// ---------------------------------------------------------------------------

interface LogRow {
  week: number;
  station: string | null;
  avg: number | null;
}

/** Log Performa rows with their computed average (L) and station looked up from the staff (E). */
function logRows(data: TrackerData): LogRow[] {
  const stationOf = new Map(data.staff.map((st) => [st.code, st.station] as const));
  return data.weeklyScores.map((r) => ({
    week: r.week,
    station: stationOf.get(r.staffCode) ?? null,
    avg: practiceAvg(r),
  }));
}

/** Laporan A for `week`. */
export function weeklyPerformance(
  data: TrackerData,
  week: number,
  derived = staffDerived(data),
  logs = logRows(data),
): WeeklyPerformanceRow[] {
  const s = data.settings;
  const stations = stationCodes(data.stations);
  const counts = staffCounts(data.staff, stations);
  const row = (key: string): WeeklyPerformanceRow => {
    const forKey = logs.filter((l) => inKey(l.station, key));
    const thisWeek = forKey.filter((l) => l.week === week);
    const avgThisWeek = average(thisWeek.map((l) => l.avg));
    const avgLastWeek = week === 1 ? null : average(forKey.filter((l) => l.week === week - 1).map((l) => l.avg));
    const baselineAvg = average(derived.filter((d) => inKey(d.staff.station, key)).map((d) => d.baseline.practiceAvg));
    const assessed = count(thisWeek, (l) => (l.avg ?? 0) > 0);
    const sesuai = count(thisWeek, (l) => weeklyStatus(l.avg, s) === 'Sesuai');
    return {
      key,
      staffCount: counts.get(key) ?? 0,
      assessed,
      avgThisWeek,
      avgLastWeek,
      changeVsLastWeek: diff(avgThisWeek, avgLastWeek),
      baselineAvg,
      gainVsBaseline: diff(avgThisWeek, baselineAvg),
      sesuai,
      perlu: count(thisWeek, (l) => weeklyStatus(l.avg, s) === 'Perlu Perbaikan'),
      tidak: count(thisWeek, (l) => weeklyStatus(l.avg, s) === 'Tidak Sesuai'),
      pctSesuai: ratio(sesuai, assessed),
    };
  };
  return [...stations.map(row), row(TOTAL)];
}

/** Laporan C for BMI `period`. */
export function bmiPeriodByStation(
  data: TrackerData,
  period: number,
  derived = staffDerived(data),
): BmiPeriodRow[] {
  const stations = stationCodes(data.stations);
  const counts = staffCounts(data.staff, stations);
  const row = (key: string): BmiPeriodRow => {
    const rows = derived.filter((d) => inKey(d.staff.station, key));
    const inPeriod = rows.map((d) => d.bmi.periods[period - 1] ?? null);
    const staffCount = counts.get(key) ?? 0;
    const checked = count(inPeriod, (p) => (p?.bmi ?? 0) > 0);
    const normal = count(inPeriod, (p) => p?.category === 'Normal');
    return {
      key,
      staffCount,
      checked,
      notChecked: staffCount - checked,
      normal,
      kurus: count(inPeriod, (p) => p?.category === 'Kurus'),
      overweight: count(inPeriod, (p) => p?.category === 'Overweight'),
      obesitas: count(inPeriod, (p) => p?.category === 'Obesitas'),
      pctNormal: ratio(normal, checked),
      heightNotMet: count(rows, (d) => d.bmi.heightRequirement === 'Tidak Memenuhi'),
    };
  };
  return [...stations.map(row), row(TOTAL)];
}

/** Laporan D: mean weekly score per station and for everyone, weeks 1 … settings.weeks. */
export function weeklyTrend(data: TrackerData, logs = logRows(data)): TrendRow[] {
  const weeks = Array.from({ length: data.settings.weeks }, (_, i) => i + 1);
  const row = (key: string): TrendRow => {
    const forKey = logs.filter((l) => inKey(l.station, key));
    return { key, weeks: weeks.map((w) => average(forKey.filter((l) => l.week === w).map((l) => l.avg))) };
  };
  return [...stationCodes(data.stations).map(row), row(SEMUA)];
}

export function weeklyReport(data: TrackerData, week: number, today: DateInput): WeeklyReport {
  const s = data.settings;
  if (!Number.isInteger(week) || week < 1) throw new Error(`Invalid week: ${week}`);
  const derived = staffDerived(data);
  const logs = logRows(data);
  const bmiPeriod = bmiPeriodForWeek(week, s);
  return {
    week,
    periodStart: weekStart(week, s),
    periodEnd: weekEnd(week, s),
    bmiPeriod,
    bmiPlannedDate: bmiCheckDate(bmiPeriod, s),
    asOf: toIsoDate(today),
    performance: weeklyPerformance(data, week, derived, logs),
    actionProgress: actionProgress(data.actionItems, s, today, reportGroups(data.stations)),
    bmi: bmiPeriodByStation(data, bmiPeriod, derived),
    trend: weeklyTrend(data, logs),
  };
}
