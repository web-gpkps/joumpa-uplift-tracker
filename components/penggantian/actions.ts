"use server";

import { refresh } from "next/cache";
import { resolveAccess, toLinkError, type LinkError } from "@/lib/workspace";
import { isPlausibleDate } from "@/components/bmi/format";

export type ReplacementActionResult =
  | { ok: true; savedAt: string }
  | { ok: false; error: LinkError };

export type ReplacementInput = {
  /** null inserts a new row. */
  id: number | null;
  /** KPS chooses; a station link is forced to its own station by the database. */
  station: string | null;
  staffCode: string | null;
  replacedName: string | null;
  reason: string | null;
  withdrawnOn: string | null;
  replacementName: string | null;
  effectiveOn: string | null;
  trainingOn: string | null;
  postTest: number | null;
  practiceAvg: number | null;
  reported: "Ya" | "Belum" | null;
  notes: string | null;
};

function invalid(field: string, message: string): ReplacementActionResult {
  return { ok: false, error: { code: "invalid_input", field, message } };
}

function textOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function dateOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && isPlausibleDate(value));
}

function numberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

/**
 * share_save_replacement: insert (id null) or update one replacement row. accessKey is
 * access.key (a link token, or "owner"); the station and scope are enforced in SQL.
 */
export async function saveReplacement(
  accessKey: string,
  input: ReplacementInput,
): Promise<ReplacementActionResult> {
  const resolved = await resolveAccess(accessKey);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  if (!input || (input.id !== null && !Number.isInteger(input.id))) {
    return invalid("id", "Baris penggantian tidak dikenal. Muat ulang halaman lalu coba lagi.");
  }
  for (const field of ["station", "staffCode", "replacedName", "reason", "replacementName", "notes"] as const) {
    if (!textOrNull(input[field])) return invalid(field, "Isian teks tidak valid.");
  }
  for (const field of ["withdrawnOn", "effectiveOn", "trainingOn"] as const) {
    if (!dateOrNull(input[field])) return invalid(field, "Tanggal tidak valid.");
  }
  if (!numberOrNull(input.postTest)) return invalid("post_test", "Post-test harus berupa angka.");
  if (!numberOrNull(input.practiceAvg)) return invalid("practice_avg", "Rata-rata praktik harus berupa angka.");
  if (input.reported !== null && input.reported !== "Ya" && input.reported !== "Belum") {
    return invalid("reported", "Pilih Ya, Belum, atau kosongkan.");
  }

  const { error } = await resolved.rpc("share_save_replacement", {
    p_id: input.id as number,
    p_station: input.station as string,
    // Derived from the station by the database.
    p_report_group: null as unknown as string,
    p_staff_code: input.staffCode as string,
    p_replaced_name: input.replacedName as string,
    p_reason: input.reason as string,
    p_withdrawn_on: input.withdrawnOn as string,
    p_replacement_name: input.replacementName as string,
    p_effective_on: input.effectiveOn as string,
    p_training_on: input.trainingOn as string,
    p_post_test: input.postTest as number,
    p_practice_avg: input.practiceAvg as number,
    p_reported: input.reported as string,
    p_notes: input.notes as string,
  });
  if (error) return { ok: false, error: toLinkError(error) };

  refresh();
  return { ok: true, savedAt: new Date().toISOString() };
}

/** share_delete_replacement. */
export async function deleteReplacement(accessKey: string, id: number): Promise<ReplacementActionResult> {
  const resolved = await resolveAccess(accessKey);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  if (!Number.isInteger(id)) {
    return invalid("id", "Baris penggantian tidak dikenal. Muat ulang halaman lalu coba lagi.");
  }

  const { error } = await resolved.rpc("share_delete_replacement", { p_id: id });
  if (error) return { ok: false, error: toLinkError(error) };

  refresh();
  return { ok: true, savedAt: new Date().toISOString() };
}
