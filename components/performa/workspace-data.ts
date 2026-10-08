import { weekOfDate, type Settings } from "@/lib/rules";
import type { IsoDate } from "@/lib/dates";
import { firstParam } from "@/lib/workspace/view";

/** Monitoring week shown by default: this week, week 1 before the programme, the last week after it. */
export function defaultWeek(settings: Settings, today: IsoDate): number {
  const current = weekOfDate(today, settings);
  if (current !== null) return current;
  return today < settings.week1Start ? 1 : settings.weeks;
}

/** `?minggu=` as a week of the programme, or the default week. */
export function parseWeek(raw: string | string[] | undefined, settings: Settings, today: IsoDate): number {
  const text = firstParam(raw)?.trim();
  const n = text && /^\d{1,2}$/.test(text) ? Number(text) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= settings.weeks ? n : defaultWeek(settings, today);
}
