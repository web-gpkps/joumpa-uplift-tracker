"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export type ResolveResult = { ok: true; resolvedAt: string } | { ok: false; message: string };

/** "Tandai selesai": records that the owner has reviewed one conflict log row. */
export async function markConflictResolved(id: number): Promise<ResolveResult> {
  const admin = await requireAdmin();
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, message: "Baris konflik tidak dikenali." };

  const supabase = await createClient();
  const resolvedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("sync_conflicts")
    .update({ resolved_at: resolvedAt, resolved_by: admin.userId })
    .eq("id", id)
    .is("resolved_at", null)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, message: `Belum tersimpan: database menolak (${error.message}).` };
  if (!data) return { ok: false, message: "Konflik ini sudah ditandai selesai sebelumnya." };
  refresh();
  return { ok: true, resolvedAt };
}
