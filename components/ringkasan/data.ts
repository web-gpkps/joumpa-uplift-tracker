/*
 * Ringkasan and Laporan view helpers on top of lib/workspace/view (trackerData, station
 * order). No formula lives here: every number comes from lib/aggregate and lib/rules.
 */
import { TOTAL, SEMUA } from "@/lib/aggregate";

/**
 * One station on screen (a station link, or KPS filtered to a station): the workbook's
 * TOTAL / SEMUA row would only repeat that station, so it is left out.
 */
export function withoutTotals<T extends { key: string }>(rows: T[], single: boolean): T[] {
  return single ? rows.filter((r) => r.key !== TOTAL && r.key !== SEMUA) : rows;
}

/** Staff still on duty: "Diganti" and "Ditarik" are no longer assessed or measured. */
export function isOnDuty(assignmentStatus: string | null | undefined): boolean {
  return assignmentStatus !== "Diganti" && assignmentStatus !== "Ditarik";
}
