"use server";

import { refresh } from "next/cache";
import { resolveAccess, toLinkError, type LinkError } from "@/lib/workspace";

export type WeeklyScoreInput = {
  staffCode: string;
  week: number;
  /** A to F, each 1 to 5 or null. */
  scores: Array<number | null>;
  observer: string;
  coachingNotes: string;
};

export type WeeklyScoreResult =
  | { ok: true; deleted: boolean; savedAt: string }
  | { ok: false; error: LinkError };

/** Cast for RPC args: the generated types are non-nullable, the functions accept NULL. */
function nullable<T>(value: T | null): T {
  return value as T;
}

function invalid(field: string, message: string): WeeklyScoreResult {
  return { ok: false, error: { code: "invalid_input", field, message } };
}

/** weekly_scores.week is 1..20 in the table; the function narrows it to settings.weeks. */
const MAX_WEEK = 20;

/**
 * Upserts one staff member's row for one week (share_save_weekly_score). All fields
 * empty deletes the row. accessKey is access.key (a link token, or "owner"); the
 * function re-checks the token, the scope and the week range in SQL.
 */
export async function saveWeeklyScore(accessKey: string, input: WeeklyScoreInput): Promise<WeeklyScoreResult> {
  const resolved = await resolveAccess(accessKey);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  if (typeof input.staffCode !== "string" || input.staffCode.trim() === "") {
    return invalid("staff_code", "SDM tidak dikenal. Muat ulang halaman lalu coba lagi.");
  }
  if (!Number.isInteger(input.week) || input.week < 1 || input.week > MAX_WEEK) {
    return invalid("week", "Minggu di luar jadwal program. Muat ulang halaman lalu coba lagi.");
  }
  if (!Array.isArray(input.scores) || input.scores.length !== 6) {
    return invalid("score_a", "Nilai A sampai F tidak lengkap. Muat ulang halaman lalu coba lagi.");
  }
  const fields = ["score_a", "score_b", "score_c", "score_d", "score_e", "score_f"];
  for (let i = 0; i < 6; i++) {
    const v = input.scores[i];
    if (v !== null && !(Number.isInteger(v) && v >= 1 && v <= 5)) {
      return invalid(fields[i], `Nilai ${"ABCDEF"[i]} harus angka 1 sampai 5.`);
    }
  }
  const observer = typeof input.observer === "string" ? input.observer.trim() : "";
  const notes = typeof input.coachingNotes === "string" ? input.coachingNotes.trim() : "";

  const [a, b, c, d, e, f] = input.scores;
  const { data, error } = await resolved.rpc("share_save_weekly_score", {
    p_staff_code: input.staffCode,
    p_week: input.week,
    p_score_a: nullable(a),
    p_score_b: nullable(b),
    p_score_c: nullable(c),
    p_score_d: nullable(d),
    p_score_e: nullable(e),
    p_score_f: nullable(f),
    p_observer: nullable(observer === "" ? null : observer),
    p_coaching_notes: nullable(notes === "" ? null : notes),
  });
  if (error) {
    const linkError = toLinkError(error);
    if (linkError.field === "week") {
      return invalid("week", "Minggu di luar jadwal program. Muat ulang halaman lalu coba lagi.");
    }
    return { ok: false, error: linkError };
  }

  const result = (data ?? {}) as { deleted?: boolean; row?: { updated_at?: string } };
  refresh();
  return {
    ok: true,
    deleted: result.deleted === true,
    savedAt: result.row?.updated_at ?? new Date().toISOString(),
  };
}
