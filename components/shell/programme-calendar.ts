/*
 * The 10-week rail's view of the schedule. Date math comes from lib/dates and lib/rules,
 * so the rail always agrees with Laporan and the entry screens.
 */
import { diffDays, formatHariTanggal, formatTanggal, formatTanggalPendek, toIsoDate, type IsoDate } from "@/lib/dates";
import { DEFAULT_SETTINGS, bmiCheckDate, weekEnd, weekStart, type Settings } from "@/lib/rules";

/** The settings columns the rail needs, in the DB row's snake_case shape (public.settings). */
export type ProgrammeSettingsRow = {
  week1_start: string;
  weeks: number;
  bmi_first_check: string;
  bmi_interval_days: number;
  bmi_periods: number;
};

/** The rail takes the DB row as-is, or the camelCase Settings used by lib/rules. */
export type ProgrammeSettings = ProgrammeSettingsRow | Settings;

/** Only the schedule fields are read; the rest of Settings is filled with defaults it never uses. */
function asRuleSettings(settings: ProgrammeSettings): Settings {
  if ("week1Start" in settings) return settings;
  return {
    ...DEFAULT_SETTINGS,
    week1Start: settings.week1_start,
    weeks: settings.weeks,
    bmiFirstCheck: settings.bmi_first_check,
    bmiIntervalDays: settings.bmi_interval_days,
    bmiPeriods: settings.bmi_periods,
  };
}

/**
 * Today's calendar date in Asia/Jakarta as 'YYYY-MM-DD'.
 * Reads the clock: with cacheComponents, call it only at request time (after
 * cookies(), a Supabase query, or `await connection()`), never in a prerendered component.
 */
export function todayInJakarta(now: Date = new Date()): IsoDate {
  return toIsoDate(now);
}

export type RailWeek = {
  week: number;
  start: IsoDate;
  end: IsoDate;
  /** BMI period whose check date falls in this week, if any. */
  bmiPeriod: number | null;
  bmiDate: IsoDate | null;
  phase: "past" | "current" | "future";
};

export function railWeeks(settings: ProgrammeSettings, today: IsoDate): RailWeek[] {
  const s = asRuleSettings(settings);
  const checks = Array.from({ length: s.bmiPeriods }, (_, i) => ({
    period: i + 1,
    date: bmiCheckDate(i + 1, s),
  }));
  return Array.from({ length: s.weeks }, (_, i) => {
    const week = i + 1;
    const start = weekStart(week, s);
    const end = weekEnd(week, s);
    const check = checks.find((c) => c.date >= start && c.date <= end) ?? null;
    const phase = today < start ? "future" : today > end ? "past" : "current";
    return { week, start, end, bmiPeriod: check?.period ?? null, bmiDate: check?.date ?? null, phase };
  });
}

export type ProgrammeStatus =
  | { phase: "before"; startDate: IsoDate; daysUntilStart: number }
  | { phase: "during"; week: number; start: IsoDate; end: IsoDate }
  | { phase: "after"; endDate: IsoDate };

export function programmeStatus(settings: ProgrammeSettings, today: IsoDate): ProgrammeStatus {
  const s = asRuleSettings(settings);
  const startDate = s.week1Start;
  const endDate = weekEnd(s.weeks, s);
  if (today < startDate) {
    return { phase: "before", startDate, daysUntilStart: diffDays(startDate, today) };
  }
  if (today > endDate) return { phase: "after", endDate };
  const week = Math.floor(diffDays(today, startDate) / 7) + 1;
  return { phase: "during", week, start: weekStart(week, s), end: weekEnd(week, s) };
}

/** The first BMI check on or after today, or null when the last one has passed. */
export function nextBmiCheck(
  settings: ProgrammeSettings,
  today: IsoDate,
): { period: number; date: IsoDate } | null {
  const s = asRuleSettings(settings);
  for (let period = 1; period <= s.bmiPeriods; period++) {
    const date = bmiCheckDate(period, s);
    if (date >= today) return { period, date };
  }
  return null;
}

/** One honest sentence about where the programme stands today (Bahasa Indonesia). */
export function programmeSummary(settings: ProgrammeSettings, today: IsoDate): string {
  const s = asRuleSettings(settings);
  const status = programmeStatus(s, today);
  const next = nextBmiCheck(s, today);

  let first: string;
  if (status.phase === "before") {
    const when = status.daysUntilStart === 1 ? "besok" : `${status.daysUntilStart} hari lagi`;
    first = `Program belum mulai. Minggu ke-1 dimulai ${formatHariTanggal(status.startDate)} (${when}).`;
  } else if (status.phase === "during") {
    first = `Minggu ke-${status.week} dari ${s.weeks}: ${formatTanggalPendek(status.start)} s.d. ${formatTanggal(status.end)}.`;
  } else {
    first = `Program ${s.weeks} minggu selesai pada ${formatTanggal(status.endDate)}.`;
  }

  let second = "";
  if (next && next.date === today) {
    second = ` Cek BMI periode ${next.period} dijadwalkan hari ini.`;
  } else if (next) {
    second = ` Cek BMI berikutnya: periode ${next.period}, ${formatHariTanggal(next.date)}.`;
  } else if (status.phase !== "before") {
    second = ` Jadwal cek BMI terakhir (periode ${s.bmiPeriods}) sudah lewat.`;
  }
  return first + second;
}

/** Readable week label for screen readers: "Minggu ke-3, mulai Senin, 26 Okt 2026". */
export function describeWeekStart(start: IsoDate): string {
  return formatHariTanggal(start);
}

/** "26 Okt" for rail cells. */
export function shortDate(date: IsoDate): string {
  return formatTanggalPendek(date);
}

