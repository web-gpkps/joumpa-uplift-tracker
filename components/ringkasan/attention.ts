/*
 * "What needs my attention this week?" for one workspace (or one station of KPS).
 * Every status comes from lib/rules (actionFlag, effectiveDueDate, actionDaysLeft,
 * practiceAvg, bmiPeriodForWeek, bmiCheckDate, replacementTimeliness); this file only
 * selects and orders the exceptions. Pure: "today" is an argument.
 */
import type { TrackerData } from "@/lib/aggregate";
import { diffDays, type IsoDate } from "@/lib/dates";
import {
  actionDaysLeft,
  actionFlag,
  bmi,
  bmiCheckDate,
  bmiPeriodForWeek,
  effectiveDueDate,
  practiceAvg,
  replacementTimeliness,
  type ReplacementTimeliness,
} from "@/lib/rules";
import { programmeStatus, type ProgrammeStatus } from "@/components/shell/programme-calendar";
import { isOnDuty } from "./data";

export type DueItem = {
  code: string;
  reportGroup: string | null;
  area: string | null;
  action: string | null;
  pic: string | null;
  status: string | null;
  flag: "OVERDUE" | "Jatuh tempo ≤ 7 hari";
  dueDate: IsoDate;
  daysLeft: number;
};

export type StaffRef = { code: string; name: string };

export type StationGap = {
  station: string;
  /** Staff on duty (not Diganti / Ditarik) in this station. */
  onDuty: number;
  missing: StaffRef[];
};

export type ReplacementAlert = {
  id: number | undefined;
  station: string | null;
  replacedName: string;
  reason: string | null;
  timeliness: ReplacementTimeliness;
};

export type Attention = {
  programme: ProgrammeStatus;
  dueItems: DueItem[];
  /** Weekly practice scores for the running week; null outside the programme. */
  scores: { week: number; stations: StationGap[]; missing: number } | null;
  /** The BMI period of the running week, once its check date has come; else null. */
  bmi: { period: number; checkDate: IsoDate; stations: StationGap[]; missing: number } | null;
  replacements: ReplacementAlert[];
  replacementDeadline: IsoDate;
  daysToReplacementDeadline: number;
};

function gaps(
  data: TrackerData,
  stations: string[],
  done: (staffCode: string) => boolean,
): { stations: StationGap[]; missing: number } {
  const result = stations.map((station) => {
    const staff = data.staff.filter((s) => s.station === station && s.name && isOnDuty(s.assignmentStatus));
    return {
      station,
      onDuty: staff.length,
      missing: staff.filter((s) => !done(s.code)).map((s) => ({ code: s.code, name: s.name ?? s.code })),
    };
  });
  return { stations: result, missing: result.reduce((n, s) => n + s.missing.length, 0) };
}

export function buildAttention(data: TrackerData, stations: string[], today: IsoDate): Attention {
  const s = data.settings;
  const programme = programmeStatus(s, today);

  const dueItems: DueItem[] = [];
  for (const it of data.actionItems) {
    const flag = actionFlag(it, s, today);
    if (flag !== "OVERDUE" && flag !== "Jatuh tempo ≤ 7 hari") continue;
    dueItems.push({
      code: it.code,
      reportGroup: it.reportGroup,
      area: it.area ?? null,
      action: it.action ?? null,
      pic: it.pic ?? null,
      status: it.status,
      flag,
      dueDate: effectiveDueDate(it, s, today)!,
      daysLeft: actionDaysLeft(it, s, today)!,
    });
  }
  dueItems.sort((a, b) => a.daysLeft - b.daysLeft || a.code.localeCompare(b.code));

  let scores: Attention["scores"] = null;
  let bmiGap: Attention["bmi"] = null;
  if (programme.phase === "during") {
    const week = programme.week;
    const assessed = new Set(
      data.weeklyScores.filter((r) => r.week === week && practiceAvg(r) !== null).map((r) => r.staffCode),
    );
    scores = { week, ...gaps(data, stations, (code) => assessed.has(code)) };

    const period = bmiPeriodForWeek(week, s);
    const checkDate = bmiCheckDate(period, s);
    if (diffDays(today, checkDate) >= 0) {
      const measured = new Set(
        data.bmiChecks.filter((c) => c.period === period && bmi(c.heightCm, c.weightKg) !== null).map((c) => c.staffCode),
      );
      bmiGap = { period, checkDate, ...gaps(data, stations, (code) => measured.has(code)) };
    }
  }

  const replacements: ReplacementAlert[] = [];
  for (const r of data.replacements) {
    const t = replacementTimeliness(r, s, today);
    if (t === "OVERDUE" || t === "Menunggu" || (t !== null && t.startsWith("Lewat"))) {
      replacements.push({
        id: r.id,
        station: r.station ?? null,
        replacedName: r.replacedName ?? "",
        reason: r.reason ?? null,
        timeliness: t,
      });
    }
  }

  return {
    programme,
    dueItems,
    scores,
    bmi: bmiGap,
    replacements,
    replacementDeadline: s.replacementDeadline,
    daysToReplacementDeadline: diffDays(s.replacementDeadline, today),
  };
}

/** Nothing to act on this week. */
export function isQuiet(a: Attention): boolean {
  return (
    a.dueItems.length === 0 &&
    (a.scores?.missing ?? 0) === 0 &&
    (a.bmi?.missing ?? 0) === 0 &&
    a.replacements.length === 0
  );
}
