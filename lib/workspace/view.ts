/*
 * Views over one link's Workspace that every screen shares: the rule settings, station
 * order, the KPS station filter, workbook staff order, lib/aggregate input, and "last
 * changed via". Pure (no server-only import), so client components may use it too.
 * No formula lives here: those stay in lib/rules and lib/aggregate.
 */
import type { TrackerData } from "@/lib/aggregate";
import { formatJam, formatTanggalPendek, toIsoDate } from "@/lib/dates";
import { DEFAULT_SETTINGS, reportGroupOf, type DueRule, type Settings } from "@/lib/rules";
import type { Workspace, WorkspaceStaff } from "./index";

const NUMERIC_KEYS = [
  "weeks",
  "bmiIntervalDays",
  "bmiPeriods",
  "bmiUnderweightBelow",
  "bmiNormalMax",
  "bmiOverweightMax",
  "passAvgMin",
  "improveAvgMin",
  "posttestMin",
] as const satisfies ReadonlyArray<keyof Settings>;

const DATE_KEYS = ["week1Start", "bmiFirstCheck", "replacementDeadline"] as const satisfies ReadonlyArray<
  keyof Settings
>;

/**
 * lib/rules Settings from share_open's settings row (sheet Parameter). A value the
 * payload did not carry falls back to the workbook default; the minimum heights stay
 * null when blank, as the workbook leaves them.
 */
export function ruleSettings(raw: Workspace["settings"]): Settings {
  const source = raw as Record<string, unknown>;
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const key of NUMERIC_KEYS) {
    const value = source[key];
    if (value !== null && value !== undefined && Number.isFinite(Number(value))) out[key] = Number(value);
  }
  for (const key of DATE_KEYS) {
    const value = source[key];
    if (typeof value === "string" && value !== "") out[key] = value;
  }
  for (const key of ["minHeightFemale", "minHeightMale"] as const) {
    const value = source[key];
    out[key] = value === null || value === undefined ? null : Number(value);
  }
  return out;
}

/** False when share_open left out a Parameter column, so a screen can say defaults are in use. */
export function settingsComplete(raw: Workspace["settings"]): boolean {
  return (Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>).every((key) => key in raw);
}

/** Station codes in this workspace, in the stations table's order. */
export function stationCodes(ws: Pick<Workspace, "stations">): string[] {
  return [...ws.stations]
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.code.localeCompare(b.code))
    .map((s) => s.code);
}

/** First value of a search param. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * KPS station filter from `?stasiun=`: a station code of this workspace, or null for
 * "Semua stasiun". Station links always see their own station and get null.
 */
export function parseStation(ws: Workspace, raw: string | string[] | undefined): string | null {
  if (!ws.isKps) return null;
  const code = firstParam(raw)?.toUpperCase();
  return code && stationCodes(ws).includes(code) ? code : null;
}

/** Staff in workbook order: station order, then Master SDM row order. */
export function sortedStaff(ws: Workspace): WorkspaceStaff[] {
  const order = new Map(stationCodes(ws).map((code, i) => [code, i] as const));
  return [...ws.staff].sort(
    (a, b) =>
      (order.get(a.station) ?? 99) - (order.get(b.station) ?? 99) ||
      (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) ||
      a.code.localeCompare(b.code),
  );
}

/**
 * lib/aggregate input for the whole workspace, or for one station of a KPS workspace.
 * A station view keeps exactly what that station's own link would receive: its staff
 * with their scores and checks, its report group's action items, its replacements.
 */
export function trackerData(ws: Workspace, station: string | null = null): TrackerData {
  const stations = station ? ws.stations.filter((s) => s.code === station) : ws.stations;
  const staff = station ? ws.staff.filter((s) => s.station === station) : ws.staff;
  const codes = new Set(staff.map((s) => s.code));
  const group = station ? reportGroupOf(station) : null;
  return {
    settings: ruleSettings(ws.settings),
    stations,
    staff,
    weeklyScores: station ? ws.weeklyScores.filter((r) => codes.has(r.staffCode)) : ws.weeklyScores,
    bmiChecks: station ? ws.bmiChecks.filter((r) => codes.has(r.staffCode)) : ws.bmiChecks,
    actionItems: (group ? ws.actionItems.filter((a) => a.reportGroup === group) : ws.actionItems).map((a) => ({
      ...a,
      dueRule: a.dueRule as DueRule | null,
    })),
    replacements: station ? ws.replacements.filter((r) => r.station === station) : ws.replacements,
  };
}

type LinkContext = Pick<Workspace, "linkId" | "linkLabels">;
type ChangedRow = { updatedByLink?: string | null; updatedAt?: string | null };

/** Who last changed a row: "tautan ini", another link's label, or "pemilik / Google Sheet". */
export function changedVia(row: ChangedRow, ws: LinkContext): string {
  if (!row.updatedByLink) return "pemilik / Google Sheet";
  if (row.updatedByLink === ws.linkId) return "tautan ini";
  return ws.linkLabels[row.updatedByLink] ?? "tautan lain";
}

/** "8 Okt 14.05" in Asia/Jakarta, or null for a missing or unreadable timestamp. */
export function shortDateTime(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return `${formatTanggalPendek(toIsoDate(date))} ${formatJam(date)}`;
}

/** "Diubah lewat tautan ini, 8 Okt 14.05". */
export function lastChangedLabel(row: ChangedRow, ws: LinkContext): string {
  const when = shortDateTime(row.updatedAt);
  return `Diubah lewat ${changedVia(row, ws)}${when ? `, ${when}` : ""}`;
}
