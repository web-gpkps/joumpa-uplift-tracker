/*
 * Dashboard parts (docs/UX.md §3): the KPI strip and the station comparison, built only
 * from lib/aggregate and lib/rules so they always agree with the workbook tables.
 * Pure: links are { sheet, query } and the screen turns them into hrefs(access).
 */
import {
  TOTAL,
  actionProgress,
  bmiPeriodByStation,
  performanceByStation,
  reportGroups,
  staffDerived,
  weeklyPerformance,
  type TrackerData,
} from "./aggregate";
import { formatHariTanggal, formatTanggal } from "./dates";
import { bmiCheckDate, reportGroupOf, replacementTimeliness, weekEnd, weekOfDate } from "./rules";

export type DashboardSheet = "dashboard" | "sdm" | "performa" | "bmi" | "tindakLanjut" | "penggantian" | "laporan";
export type DashboardLink = { sheet: DashboardSheet; query?: Record<string, string | number | null> };

export type Kpi = {
  key: "tl-selesai" | "tl-overdue" | "dinilai" | "bmi" | "penggantian";
  label: string;
  /** null: nothing to count yet (before the programme or the first BMI check). */
  value: number | null;
  /** Denominator for "n dari m"; null for a plain count. */
  total: number | null;
  /** The comparison basis in words, shown under the number. */
  basis: string;
  /** Honest state shown instead of the number while value is null. */
  note?: string;
  tone: "neutral" | "good" | "critical";
  link: DashboardLink;
};

export type Ratio = { value: number | null; total: number; link: DashboardLink };

export type StationComparisonRow = {
  station: string;
  /** Report group of the station; CGK and HLP share "CGK & HLP" (shown once per pair). */
  group: string;
  sharedGroup: boolean;
  assessed: Ratio;
  score: { current: number | null; baseline: number | null; gain: number | null; link: DashboardLink };
  pctSesuai: { value: number | null; link: DashboardLink };
  bmiChecked: Ratio;
  actionsDone: Ratio;
  overdue: { value: number; link: DashboardLink };
};

export type DashboardSummary = {
  phase: "before" | "during" | "after";
  /** Week the "this week" numbers refer to (the last week after the programme), or null before it. */
  week: number | null;
  /** Latest BMI period whose planned date has come, or null before the first check. */
  bmiPeriod: number | null;
  kpis: Kpi[];
  comparison: StationComparisonRow[];
};

function currentBmiPeriod(data: TrackerData, today: string): number | null {
  let period: number | null = null;
  for (let p = 1; p <= data.settings.bmiPeriods; p++) {
    if (bmiCheckDate(p, data.settings) <= today) period = p;
  }
  return period;
}

/**
 * KPI strip (max 5 tiles) and per-station comparison for `stations` (the stations in
 * view: all for KPS / the owner, one for a station link). `data` must already be limited
 * to that scope (lib/workspace trackerData).
 */
export function dashboardSummary(data: TrackerData, today: string, stations: readonly string[]): DashboardSummary {
  const s = data.settings;
  const lastDay = weekEnd(s.weeks, s);
  const phase = today < s.week1Start ? "before" : today > lastDay ? "after" : "during";
  const week = weekOfDate(today, s) ?? (phase === "after" ? s.weeks : null);
  const bmiPeriod = currentBmiPeriod(data, today);

  const derived = staffDerived(data);
  const groups = [...new Set(stations.map((code) => reportGroupOf(code) ?? code))];
  const groupKeys = reportGroups(data.stations).filter((g) => groups.includes(g));
  const actions = actionProgress(data.actionItems, s, today, groupKeys.length > 0 ? groupKeys : groups);
  const actionTotal = actions.find((r) => r.key === TOTAL);
  const weekly = week ? weeklyPerformance(data, week, derived) : [];
  const perf = performanceByStation(data, derived);
  const bmi = bmiPeriod ? bmiPeriodByStation(data, bmiPeriod, derived) : [];
  const staffTotal = data.staff.length;

  const withReplaced = data.replacements.filter((r) => r.replacedName && r.replacedName.trim() !== "");
  const timeliness = withReplaced.map((r) => replacementTimeliness(r, s, today));
  const onTime = timeliness.filter((t) => t === "Tepat waktu").length;
  const lateOrOverdue = timeliness.filter((t) => t === "OVERDUE" || (t ?? "").startsWith("Lewat")).length;

  const weeklyTotal = weekly.find((r) => r.key === TOTAL);
  const bmiTotal = bmi.find((r) => r.key === TOTAL);
  const overdueCount = actionTotal?.overdue ?? 0;

  const kpis: Kpi[] = [
    {
      key: "tl-selesai",
      label: "Tindak Lanjut selesai",
      value: actionTotal?.selesai ?? 0,
      total: actionTotal?.total ?? 0,
      basis: "butir berstatus Selesai dari semua butir tindak lanjut",
      tone: actionTotal && actionTotal.total > 0 && actionTotal.selesai === actionTotal.total ? "good" : "neutral",
      link: { sheet: "tindakLanjut" },
    },
    {
      key: "tl-overdue",
      label: "OVERDUE",
      value: overdueCount,
      total: null,
      basis: "butir lewat batas waktu dan belum Selesai",
      tone: overdueCount > 0 ? "critical" : "neutral",
      link: { sheet: "tindakLanjut" },
    },
    week
      ? {
          key: "dinilai",
          label: phase === "after" ? `SDM dinilai Minggu ke-${week}` : "SDM dinilai minggu ini",
          value: weeklyTotal?.assessed ?? 0,
          total: weeklyTotal?.staffCount ?? staffTotal,
          basis: `SDM yang sudah punya nilai Minggu ke-${week}`,
          tone: "neutral",
          link: { sheet: "performa", query: { minggu: week } },
        }
      : {
          key: "dinilai",
          label: "SDM dinilai minggu ini",
          value: null,
          total: staffTotal,
          basis: `${staffTotal} SDM akan dinilai tiap minggu`,
          note: `Penilaian mulai Minggu ke-1, ${formatHariTanggal(s.week1Start)}.`,
          tone: "neutral",
          link: { sheet: "performa", query: { minggu: 1 } },
        },
    bmiPeriod
      ? {
          key: "bmi",
          label: `Cek BMI periode ${bmiPeriod}`,
          value: bmiTotal?.checked ?? 0,
          total: bmiTotal?.staffCount ?? staffTotal,
          basis: `SDM yang sudah dicek, jadwal ${formatTanggal(bmiCheckDate(bmiPeriod, s))}`,
          tone: "neutral",
          link: { sheet: "bmi", query: { periode: bmiPeriod } },
        }
      : {
          key: "bmi",
          label: "Cek BMI periode ini",
          value: null,
          total: staffTotal,
          basis: `${s.bmiPeriods} kali cek, tiap ${s.bmiIntervalDays} hari`,
          note: `Cek pertama ${formatHariTanggal(bmiCheckDate(1, s))}.`,
          tone: "neutral",
          link: { sheet: "bmi", query: { periode: 1 } },
        },
    withReplaced.length > 0
      ? {
          key: "penggantian",
          label: "Penggantian tepat waktu",
          value: onTime,
          total: withReplaced.length,
          basis: `efektif paling lambat ${formatTanggal(s.replacementDeadline)}`,
          tone: lateOrOverdue > 0 ? "critical" : "neutral",
          link: { sheet: "penggantian" },
        }
      : {
          key: "penggantian",
          label: "Penggantian tepat waktu",
          value: null,
          total: 0,
          basis: `batas ${formatTanggal(s.replacementDeadline)}`,
          note: "Belum ada SDM yang perlu diganti.",
          tone: "neutral",
          link: { sheet: "penggantian" },
        },
  ];

  const comparison: StationComparisonRow[] = stations.map((station) => {
    const group = reportGroupOf(station) ?? station;
    const w = weekly.find((r) => r.key === station);
    const p = perf.find((r) => r.key === station);
    const b = bmi.find((r) => r.key === station);
    const a = actions.find((r) => r.key === group);
    const staffCount = p?.staffCount ?? data.staff.filter((st) => st.station === station).length;
    return {
      station,
      group,
      sharedGroup: group !== station,
      assessed: {
        value: week ? (w?.assessed ?? 0) : null,
        total: w?.staffCount ?? staffCount,
        link: { sheet: "performa", query: { stasiun: station, minggu: week ?? 1 } },
      },
      score: {
        current: p?.currentAvg ?? null,
        baseline: p?.baselineAvg ?? null,
        gain: p?.gain ?? null,
        link: { sheet: "performa", query: { stasiun: station, tab: "rekap" } },
      },
      pctSesuai: {
        // No current scores yet: a percentage of nobody is not 0 %.
        value: p && p.currentAvg !== null ? p.pctCurrentSesuai : null,
        link: { sheet: "performa", query: { stasiun: station, tab: "rekap" } },
      },
      bmiChecked: {
        value: bmiPeriod ? (b?.checked ?? 0) : null,
        total: b?.staffCount ?? staffCount,
        link: { sheet: "bmi", query: { stasiun: station, periode: bmiPeriod ?? 1 } },
      },
      actionsDone: {
        value: a?.selesai ?? 0,
        total: a?.total ?? 0,
        link: { sheet: "tindakLanjut", query: { stasiun: station } },
      },
      overdue: { value: a?.overdue ?? 0, link: { sheet: "tindakLanjut", query: { stasiun: station } } },
    };
  });

  return { phase, week, bmiPeriod, kpis, comparison };
}
