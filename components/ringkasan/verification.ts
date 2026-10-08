/*
 * "Perlu diverifikasi": the known data issues (docs/SPEC.md) as they stand in this
 * workspace, surfaced and never silently fixed. Consistency comes from lib/rules
 * (staffBaseline via lib/aggregate staffDerived).
 */
import { staffDerived, type TrackerData } from "@/lib/aggregate";
import { startsWithText } from "@/lib/rules";

export type StationCount = { station: string; count: number };

export type Verification = {
  /** Report conclusion differs from criteria 6.2 ("Beda – verifikasi"). */
  beda: { total: number; byStation: StationCount[] };
  /** Staff without L/P: the height requirement cannot be checked for them. */
  noGender: { total: number; byStation: StationCount[] };
  /** Minimum heights (L and/or P) missing in Parameter. */
  minHeightMissing: Array<"L" | "P">;
  /** NIPP used by more than one staff member. */
  duplicateNipp: Array<{ nipp: string; staff: Array<{ name: string; station: string | null }> }>;
};

function byStation(stations: string[], rows: Array<{ station: string | null }>): StationCount[] {
  return stations
    .map((station) => ({ station, count: rows.filter((r) => r.station === station).length }))
    .filter((r) => r.count > 0);
}

export function buildVerification(data: TrackerData, stations: string[]): Verification {
  const named = data.staff.filter((s) => s.name && s.name.trim() !== "");
  const beda = staffDerived(data)
    .filter((d) => startsWithText(d.baseline.consistency, "Beda"))
    .map((d) => ({ station: d.staff.station }));
  const noGender = named.filter((s) => !s.gender || s.gender.trim() === "");

  const nipps = new Map<string, Array<{ name: string; station: string | null }>>();
  for (const s of named) {
    const nipp = s.nipp?.trim();
    if (!nipp) continue;
    const list = nipps.get(nipp) ?? [];
    list.push({ name: s.name!, station: s.station });
    nipps.set(nipp, list);
  }

  const minHeightMissing: Array<"L" | "P"> = [];
  if (data.settings.minHeightMale === null) minHeightMissing.push("L");
  if (data.settings.minHeightFemale === null) minHeightMissing.push("P");

  return {
    beda: { total: beda.length, byStation: byStation(stations, beda) },
    noGender: { total: noGender.length, byStation: byStation(stations, noGender) },
    minHeightMissing,
    duplicateNipp: [...nipps.entries()]
      .filter(([, list]) => list.length > 1)
      .map(([nipp, staff]) => ({ nipp, staff })),
  };
}

export function hasIssues(v: Verification): boolean {
  return v.beda.total > 0 || v.noGender.total > 0 || v.minHeightMissing.length > 0 || v.duplicateNipp.length > 0;
}
