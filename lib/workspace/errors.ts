/**
 * Errors raised by the share_* RPCs (see supabase/migrations/*share_rpcs.sql):
 * - invalid_link   (P0001): unknown or revoked token
 * - out_of_scope   (P0001): the row belongs to another station
 * - forbidden_field        : a KPS-only field sent by a station link
 * - invalid_input  (22023): a value failed validation; `details` names the field
 * Plus, from resolveAccess: unauthorized (the owner's session is gone or not an admin).
 */
export type LinkErrorCode =
  | "invalid_link"
  | "out_of_scope"
  | "forbidden_field"
  | "invalid_input"
  | "unauthorized"
  | "unknown";

export type LinkError = {
  code: LinkErrorCode;
  /** For invalid_input: the field name from `details` (e.g. "height_cm"). */
  field?: string;
  /** Plain-language message for the UI (Bahasa Indonesia). */
  message: string;
};

const MESSAGES: Record<Exclude<LinkErrorCode, "unknown" | "invalid_input" | "unauthorized">, string> = {
  invalid_link: "Tautan tidak berlaku atau sudah dicabut. Minta tautan baru ke pemilik aplikasi.",
  out_of_scope: "Data ini milik stasiun lain dan tidak bisa diubah lewat tautan ini.",
  forbidden_field: "Kolom ini hanya bisa diubah lewat tautan KPS.",
};

type PostgrestLikeError = { message?: string; code?: string; details?: string | null };

/** Maps a PostgREST error from a share_* RPC to a code + Indonesian message. */
export function toLinkError(error: PostgrestLikeError): LinkError {
  const message = error.message ?? "";
  if (message === "invalid_link" || message === "out_of_scope" || message === "forbidden_field") {
    return { code: message, message: MESSAGES[message] };
  }
  if (message === "invalid_input" || error.code === "22023") {
    const field = error.details ?? undefined;
    return {
      code: "invalid_input",
      field,
      message: field ? `Nilai ${field} tidak valid. Periksa lagi isinya.` : "Ada nilai yang tidak valid.",
    };
  }
  return {
    code: "unknown",
    message: `Database menolak permintaan (${message || "tanpa pesan"}). Coba lagi.`,
  };
}
