"use server";

import { refresh } from "next/cache";
import { resolveAccess, toLinkError, type LinkError } from "@/lib/workspace";
import { deleteStaffAs, type DeleteStaffResult, type StaffDeleteClient } from "./delete-staff";

const STATUSES = ["Aktif", "Coaching 30 Hari", "Diganti", "Ditarik"];
const CONCLUSIONS = ["Sesuai", "Sesuai dengan Catatan", "Perlu Perbaikan", "Tidak Sesuai"];

export type StaffBaselineInput = {
  preTest: number | null;
  postTest: number | null;
  /** A to F, each 1 to 5 or null. */
  scores: Array<number | null>;
  reportConclusion: string | null;
};

export type StaffInput = {
  /** null adds a new staff member (the database assigns the next TMB-xx code). */
  code: string | null;
  /** New staff only. Station links are always their own station; KPS must pick one. */
  station: string | null;
  name: string;
  nipp: string;
  gender: "L" | "P" | null;
  assignmentStatus: string;
  notes: string;
  /** KPS only, and only when the baseline changed. */
  baseline: StaffBaselineInput | null;
};

export type StaffSaveResult =
  | { ok: true; code: string; name: string; savedAt: string }
  /** `saved` is true when the profile was saved but the baseline step failed. */
  | { ok: false; error: LinkError; saved?: boolean; code?: string };

/** Cast for RPC args: the generated types are non-nullable, the functions accept NULL. */
function nullable<T>(value: T | null): T {
  return value as T;
}

function blankToNull(value: string | null | undefined): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" ? null : text;
}

function invalid(field: string, message: string): StaffSaveResult {
  return { ok: false, error: { code: "invalid_input", field, message } };
}

/** share_save_staff's field errors in the words of the form. */
function staffError(error: { message?: string; code?: string; details?: string | null }): LinkError {
  const linkError = toLinkError(error);
  if (linkError.code === "invalid_input" && linkError.field === "station") {
    return { ...linkError, message: "Pilih stasiun untuk SDM baru." };
  }
  if (linkError.code === "invalid_input" && linkError.field === "name") {
    return { ...linkError, message: "Nama wajib diisi, paling panjang 200 karakter." };
  }
  return linkError;
}

function checkBaseline(b: StaffBaselineInput): StaffSaveResult | null {
  for (const [key, value] of [
    ["pre_test", b.preTest],
    ["post_test", b.postTest],
  ] as const) {
    if (value !== null && !(Number.isFinite(value) && value >= 0 && value <= 100)) {
      return invalid(key, "Nilai tes harus angka 0 sampai 100.");
    }
  }
  if (!Array.isArray(b.scores) || b.scores.length !== 6) return invalid("score_a", "Nilai A sampai F tidak lengkap.");
  for (let i = 0; i < 6; i++) {
    const v = b.scores[i];
    if (v !== null && !(Number.isInteger(v) && v >= 1 && v <= 5)) {
      return invalid(`score_${"abcdef"[i]}`, `Nilai ${"ABCDEF"[i]} harus angka bulat 1 sampai 5.`);
    }
  }
  if (b.reportConclusion !== null && !CONCLUSIONS.includes(b.reportConclusion)) {
    return invalid("report_conclusion", "Pilih kesimpulan dari daftar.");
  }
  return null;
}

/**
 * Adds or edits one staff member (share_save_staff) and, for KPS links and the owner, the
 * training baseline (share_kps_save_staff_baseline). accessKey is access.key (a link token,
 * or "owner"). The database enforces the rest: a station link's new staff go to its own
 * station, editing staff outside the scope fails with out_of_scope, and the baseline
 * function rejects station links with forbidden_field.
 */
export async function saveStaff(accessKey: string, input: StaffInput): Promise<StaffSaveResult> {
  const resolved = await resolveAccess(accessKey);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  const name = blankToNull(input.name);
  if (!name) return invalid("name", "Nama wajib diisi.");
  if (name.length > 200) return invalid("name", "Nama paling panjang 200 karakter.");
  const nipp = blankToNull(input.nipp);
  if (nipp && nipp.length > 50) return invalid("nipp", "NIPP paling panjang 50 karakter.");
  if (input.gender !== null && input.gender !== "L" && input.gender !== "P") {
    return invalid("gender", "Pilih L, P, atau kosongkan.");
  }
  if (!STATUSES.includes(input.assignmentStatus)) {
    return invalid("assignment_status", "Pilih status penugasan dari daftar.");
  }
  const notes = blankToNull(input.notes);
  // New staff: KPS and the owner must pick a station; a station link may leave it empty.
  const station = input.code === null ? blankToNull(input.station) : null;

  if (input.baseline) {
    const problem = checkBaseline(input.baseline);
    if (problem) return problem;
  }

  const { data, error } = await resolved.rpc("share_save_staff", {
    p_code: nullable(input.code),
    p_station: nullable(station),
    p_name: name,
    p_nipp: nullable(nipp),
    p_gender: nullable(input.gender),
    p_assignment_status: input.assignmentStatus,
    p_notes: nullable(notes),
  });
  if (error) return { ok: false, error: staffError(error) };
  const row = ((data ?? {}) as { row?: { code?: string; updated_at?: string } }).row ?? {};
  const code = row.code ?? input.code ?? "";
  let savedAt = row.updated_at ?? new Date().toISOString();

  if (input.baseline && code) {
    const b = input.baseline;
    const [a, bb, c, d, e, f] = b.scores;
    const res = await resolved.rpc("share_kps_save_staff_baseline", {
      p_code: code,
      p_pre_test: nullable(b.preTest),
      p_post_test: nullable(b.postTest),
      p_score_a: nullable(a),
      p_score_b: nullable(bb),
      p_score_c: nullable(c),
      p_score_d: nullable(d),
      p_score_e: nullable(e),
      p_score_f: nullable(f),
      p_report_conclusion: nullable(b.reportConclusion),
    });
    if (res.error) {
      refresh();
      return { ok: false, error: toLinkError(res.error), saved: true, code };
    }
    savedAt = ((res.data ?? {}) as { row?: { updated_at?: string } }).row?.updated_at ?? savedAt;
  }

  refresh();
  return { ok: true, code, name, savedAt };
}

export type GenderSaveResult = { ok: true; savedAt: string } | { ok: false; error: LinkError };

/** The profile fields share_save_staff writes, as currently shown on the row. */
export type StaffProfileSnapshot = {
  code: string;
  name: string;
  nipp: string | null;
  assignmentStatus: string;
  notes: string | null;
};

/**
 * "Lengkapi L/P": changes only L/P. share_save_staff writes every profile field, so the
 * other fields are sent as the row currently shows them (rendered from share_open on
 * this request; the page refreshes after each save). Station and status are sent as
 * NULL, which the function keeps unchanged.
 */
export async function saveStaffGender(
  accessKey: string,
  current: StaffProfileSnapshot,
  gender: "L" | "P" | null,
): Promise<GenderSaveResult> {
  const resolved = await resolveAccess(accessKey);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  if (gender !== null && gender !== "L" && gender !== "P") {
    return { ok: false, error: { code: "invalid_input", field: "gender", message: "Pilih L, P, atau kosongkan." } };
  }
  if (!current || typeof current.code !== "string" || !blankToNull(current.name)) {
    return {
      ok: false,
      error: { code: "invalid_input", field: "name", message: "Data SDM tidak lengkap. Muat ulang halaman lalu coba lagi." },
    };
  }

  const { data, error } = await resolved.rpc("share_save_staff", {
    p_code: current.code,
    p_station: nullable<string>(null),
    p_name: current.name,
    p_nipp: nullable(current.nipp),
    p_gender: nullable(gender),
    p_assignment_status: nullable<string>(null),
    p_notes: nullable(current.notes),
  });
  if (error) return { ok: false, error: staffError(error) };
  refresh();
  return {
    ok: true,
    savedAt: ((data ?? {}) as { row?: { updated_at?: string } }).row?.updated_at ?? new Date().toISOString(),
  };
}

/**
 * Owner-only "Hapus SDM". Guarded twice: resolveAccess("owner") requires an admin session,
 * and deleteStaffAs refuses anything but owner access. The delete runs with the owner's
 * cookie client under the admin RLS policy; weekly_scores and bmi_checks cascade, and
 * replacements keep their row with staff_code set to NULL.
 */
export async function deleteStaff(accessKey: string, code: string): Promise<DeleteStaffResult> {
  const resolved = await resolveAccess(accessKey);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const result = await deleteStaffAs(
    resolved.access,
    resolved.ownerClient as unknown as StaffDeleteClient | null,
    code,
  );
  if (result.ok) refresh();
  return result;
}
