"use server";

import { refresh } from "next/cache";
import { resolveAccess, toLinkError } from "@/lib/workspace";

export type FindingsState =
  | { status: "idle" }
  | { status: "saved"; at: string; findings: string }
  /** `invalid` marks a value the database rejected (the textarea gets aria-invalid). */
  | { status: "error"; message: string; invalid?: boolean };

/**
 * Laporan Mingguan section E for the link's own scope (weekly_reports keyed by week + scope;
 * the owner writes the KPS row). Blank text deletes the row. accessKey is access.key; the
 * function re-checks the token, the scope and the week range in SQL.
 */
export async function saveWeeklyFindings(
  accessKey: string,
  week: number,
  _previous: FindingsState,
  formData: FormData,
): Promise<FindingsState> {
  const raw = formData.get("findings");
  const findings = typeof raw === "string" ? raw : "";

  const resolved = await resolveAccess(accessKey);
  if (!resolved.ok) return { status: "error", message: resolved.error.message };
  if (!Number.isInteger(week) || week < 1 || week > 20) {
    return { status: "error", message: `Minggu ke-${week} di luar jadwal program.` };
  }

  const { error } = await resolved.rpc("share_save_weekly_report", {
    p_week: week,
    p_findings: findings,
  });
  if (error) {
    const linkError = toLinkError(error);
    return { status: "error", message: linkError.message, invalid: linkError.code === "invalid_input" };
  }

  refresh();
  return { status: "saved", at: new Date().toISOString(), findings: findings.trim() };
}
