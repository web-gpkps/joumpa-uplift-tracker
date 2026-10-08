import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { ReloadButton } from "@/components/ui/ReloadButton";
import { LinksManager } from "@/components/admin/LinksManager";
import type { LinkRow } from "@/components/admin/link-types";
import { requireAdmin } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { linkAccess } from "@/lib/workspace/access";

export const metadata: Metadata = { title: "Tautan" };

const SCOPE_ORDER = ["SUB", "DPS", "CGK", "HLP", "KNO", "KPS"];

export default function TautanPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tautan stasiun"
        description="Stasiun dan KPS mengisi data lewat tautan, tanpa akun. Buat, salin, ganti, atau cabut tautan di sini. Tautan berlaku seperti kata sandi: bagikan hanya kepada pemegangnya."
      />
      <Suspense fallback={<LoadingState label="Memuat daftar tautan" />}>
        <LinksData />
      </Suspense>
    </div>
  );
}

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? (local ? "http" : "https");
  return `${proto}://${host}`;
}

async function LinksData() {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("share_links")
    .select("id, scope, label, created_at, revoked_at, last_used_at, token")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <Panel>
        <ErrorState
          title="Daftar tautan tidak bisa dimuat"
          cause={`Database menjawab: ${error.message}`}
          action={<ReloadButton />}
        />
      </Panel>
    );
  }

  const base = await origin();
  const links: LinkRow[] = (data ?? [])
    .map((row) => ({
      id: row.id,
      scope: row.scope,
      label: row.label,
      createdAt: row.created_at,
      revokedAt: row.revoked_at,
      lastUsedAt: row.last_used_at,
      // Only working links carry their URL; a revoked token is never sent to the browser.
      url: row.revoked_at ? null : `${base}${linkAccess(row.token).basePath}`,
      isQa: /^qa test/i.test(row.label?.trim() ?? ""),
    }))
    .sort(
      (a, b) =>
        SCOPE_ORDER.indexOf(a.scope) - SCOPE_ORDER.indexOf(b.scope) ||
        Number(a.isQa) - Number(b.isQa) ||
        b.createdAt.localeCompare(a.createdAt),
    );

  return <LinksManager links={links} />;
}
