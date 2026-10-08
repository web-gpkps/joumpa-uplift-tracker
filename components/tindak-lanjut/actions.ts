"use server";

import { refresh } from "next/cache";
import { resolveAccess, toLinkError } from "@/lib/workspace";
import {
  ACTION_KINDS,
  ACTION_STATUSES,
  DUE_RULES,
} from "@/components/tindak-lanjut/action-view";
import {
  FIELD_LABEL,
  type ActionSaveResult,
  type DefinitionField,
  type DefinitionInput,
  type ProgressField,
  type ProgressInput,
} from "@/components/tindak-lanjut/types";
import {
  addActionItem,
  removeActionItem,
  type ActionItemsPort,
  type NewItemInput,
  type OwnerResult,
} from "@/components/tindak-lanjut/owner-items";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 4000;

/** DB argument names (error `details`) → form fields. */
const PROGRESS_FIELD: Record<string, ProgressField> = {
  status: "status",
  progress: "progress",
  updated_on: "updatedOn",
  evidence: "evidence",
};

const DEFINITION_FIELD: Record<string, DefinitionField> = {
  area: "area",
  action: "action",
  target: "target",
  kind: "kind",
  schedule: "schedule",
  due_date: "dueDate",
  due_rule: "dueRule",
  pic: "pic",
  kps_notes: "kpsNotes",
};

function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function clean(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return text === "" ? null : text;
}

/**
 * Status, % progres, Tgl update, Realisasi / Bukti: any link whose report group holds the
 * item, and the owner. accessKey is access.key (a link token, or "owner"); the report
 * group is enforced in SQL (out_of_scope).
 */
export async function saveActionProgress(
  accessKey: string,
  input: ProgressInput,
): Promise<ActionSaveResult<ProgressField>> {
  const resolved = await resolveAccess(accessKey);
  if (!resolved.ok) return { ok: false, message: resolved.error.message };

  const fieldErrors: Partial<Record<ProgressField, string>> = {};
  if (!(ACTION_STATUSES as readonly string[]).includes(input.status)) {
    fieldErrors.status = "Pilih salah satu status.";
  }
  if (!Number.isInteger(input.progress) || input.progress < 0 || input.progress > 100) {
    fieldErrors.progress = "Isi bilangan bulat 0 sampai 100.";
  }
  const updatedOn = clean(input.updatedOn);
  if (updatedOn !== null && !isIsoDate(updatedOn)) {
    fieldErrors.updatedOn = "Tanggal tidak valid.";
  }
  const evidence = clean(input.evidence);
  if (evidence !== null && evidence.length > MAX_TEXT) {
    fieldErrors.evidence = `Maksimal ${MAX_TEXT} karakter (sekarang ${evidence.length}).`;
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, message: "Periksa isian yang ditandai.", fieldErrors };
  }

  const { error } = await resolved.rpc("share_update_action_item", {
    p_code: input.code,
    p_status: input.status,
    p_progress: input.progress,
    p_updated_on: updatedOn as string,
    p_evidence: evidence as string,
  });
  if (error) {
    const linkError = toLinkError(error);
    const field = linkError.field ? PROGRESS_FIELD[linkError.field] : undefined;
    if (!field) return { ok: false, message: linkError.message };
    const message = `${FIELD_LABEL[field]} ditolak database. Periksa lagi isinya.`;
    return { ok: false, message, fieldErrors: { [field]: message } };
  }

  refresh();
  return { ok: true, savedAt: new Date().toISOString() };
}

/**
 * KPS links and the owner: Catatan KPS and the item's definition (area, tindakan, target,
 * jenis, jadwal, batas waktu, PIC). A station link gets forbidden_field from the database
 * ("Kolom ini hanya bisa diubah lewat tautan KPS.").
 */
export async function saveActionDefinition(
  accessKey: string,
  input: DefinitionInput,
): Promise<ActionSaveResult<DefinitionField>> {
  const resolved = await resolveAccess(accessKey);
  if (!resolved.ok) return { ok: false, message: resolved.error.message };

  const fieldErrors: Partial<Record<DefinitionField, string>> = {};
  const texts = {
    area: clean(input.area),
    action: clean(input.action),
    target: clean(input.target),
    schedule: clean(input.schedule),
    pic: clean(input.pic),
    kpsNotes: clean(input.kpsNotes),
  };
  for (const [field, value] of Object.entries(texts) as Array<[DefinitionField, string | null]>) {
    if (value !== null && value.length > MAX_TEXT) {
      fieldErrors[field] = `Maksimal ${MAX_TEXT} karakter (sekarang ${value.length}).`;
    }
  }
  const kind = clean(input.kind);
  if (kind !== null && !(ACTION_KINDS as readonly string[]).includes(kind)) {
    fieldErrors.kind = "Pilih Sekali atau Rutin.";
  }
  const dueDate = clean(input.dueDate);
  if (dueDate !== null && !isIsoDate(dueDate)) {
    fieldErrors.dueDate = "Tanggal tidak valid.";
  }
  const dueRule = clean(input.dueRule);
  if (dueRule !== null && !(DUE_RULES as readonly string[]).includes(dueRule)) {
    fieldErrors.dueRule = "Pilih salah satu aturan batas waktu.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, message: "Periksa isian yang ditandai.", fieldErrors };
  }

  // Generated RPC types are non-nullable; NULL clears a field (docs/SPEC.md, RPC contract).
  const { error } = await resolved.rpc("share_kps_update_action_item", {
    p_code: input.code,
    p_area: texts.area as string,
    p_action: texts.action as string,
    p_target: texts.target as string,
    p_kind: kind as string,
    p_schedule: texts.schedule as string,
    p_due_date: dueDate as string,
    p_due_rule: dueRule as string,
    p_pic: texts.pic as string,
    p_kps_notes: texts.kpsNotes as string,
  });
  if (error) {
    const linkError = toLinkError(error);
    const field = linkError.field ? DEFINITION_FIELD[linkError.field] : undefined;
    if (!field) return { ok: false, message: linkError.message };
    const message = `${FIELD_LABEL[field]} ditolak database. Periksa lagi isinya.`;
    return { ok: false, message, fieldErrors: { [field]: message } };
  }

  refresh();
  return { ok: true, savedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Owner only: add and delete items (direct table writes under the admin RLS policy).
// ---------------------------------------------------------------------------

type OwnerClient = NonNullable<Extract<Awaited<ReturnType<typeof resolveAccess>>, { ok: true }>["ownerClient"]>;

function itemsPort(client: OwnerClient): ActionItemsPort {
  return {
    async list() {
      const { data, error } = await client.from("action_items").select("code, report_group, sort_order");
      return {
        data: (data ?? []).map((r) => ({ code: r.code, reportGroup: r.report_group, sortOrder: r.sort_order })),
        error,
      };
    },
    async insert(row) {
      const { error } = await client.from("action_items").insert(row);
      return { error };
    },
    async remove(code) {
      const { data, error } = await client.from("action_items").delete().eq("code", code).select("code");
      return { deleted: data?.length ?? 0, error };
    },
  };
}

/** "Tambah butir": owner only (resolveAccess runs requireAdmin for the "owner" key). */
export async function createActionItem(accessKey: string, input: NewItemInput): Promise<OwnerResult> {
  const resolved = await resolveAccess(accessKey);
  if (!resolved.ok) return { ok: false, message: resolved.error.message };
  const isOwner = resolved.access.kind === "owner" && resolved.ownerClient !== null;
  const result = await addActionItem(isOwner, resolved.ownerClient ? itemsPort(resolved.ownerClient) : null, input);
  if (result.ok) refresh();
  return result;
}

/** "Hapus butir": owner only. */
export async function deleteActionItem(accessKey: string, code: string): Promise<OwnerResult> {
  const resolved = await resolveAccess(accessKey);
  if (!resolved.ok) return { ok: false, message: resolved.error.message };
  const isOwner = resolved.access.kind === "owner" && resolved.ownerClient !== null;
  const result = await removeActionItem(isOwner, resolved.ownerClient ? itemsPort(resolved.ownerClient) : null, code);
  if (result.ok) refresh();
  return result;
}
