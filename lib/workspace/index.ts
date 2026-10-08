import "server-only";
import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/database.types";
import { camelize, type Camelize } from "@/lib/rules";
import { getAdminSession, requireAdmin } from "@/lib/supabase/auth";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import {
  OWNER_ACCESS,
  OWNER_ACCESS_KEY,
  linkAccess,
  type SearchParams,
  type WorkspaceAccess,
} from "./access";
import { createLinkClient } from "./client";
import { toLinkError, type LinkError } from "./errors";

export { createLinkClient } from "./client";
export { toLinkError, type LinkError, type LinkErrorCode } from "./errors";
export {
  OWNER_ACCESS,
  OWNER_ACCESS_KEY,
  OWNER_PAGES,
  SHEETS,
  hrefs,
  linkAccess,
  toQuery,
  type SearchParams,
  type SheetKey,
  type SheetLinks,
  type WorkspaceAccess,
} from "./access";
export {
  changedVia,
  firstParam,
  lastChangedLabel,
  parseStation,
  ruleSettings,
  settingsComplete,
  shortDateTime,
  sortedStaff,
  stationCodes,
  trackerData,
} from "./view";

export type WorkspaceScope = "SUB" | "DPS" | "CGK" | "HLP" | "KNO" | "KPS";

/**
 * share_open(token) payload (docs/SPEC.md "Link RPC surface"): full table rows, already
 * filtered to the link's scope in SQL. Link holders never receive auth user ids, so
 * weekly_scores.updated_by and bmi_checks.updated_by_user are left out.
 */
type ShareOpenPayload = {
  scope: WorkspaceScope;
  label: string | null;
  /** NULL for the owner (blank token + is_admin()). */
  link_id: string | null;
  settings: Tables<"settings"> | null;
  stations?: Tables<"stations">[];
  staff?: Tables<"staff">[];
  weekly_scores?: Omit<Tables<"weekly_scores">, "updated_by">[];
  bmi_checks?: Omit<Tables<"bmi_checks">, "updated_by_user">[];
  action_items?: Tables<"action_items">[];
  replacements?: Tables<"replacements">[];
  weekly_reports?: Tables<"weekly_reports">[];
  link_labels?: Record<string, string>;
};

/** The five settings columns the 10-week rail needs (WeekRail accepts this shape as-is). */
export type WorkspaceSchedule = Pick<
  Tables<"settings">,
  "week1_start" | "weeks" | "bmi_first_check" | "bmi_interval_days" | "bmi_periods"
>;

export type WorkspaceStaff = Camelize<Tables<"staff">>;
export type WorkspaceWeeklyScore = Camelize<Omit<Tables<"weekly_scores">, "updated_by">>;
export type WorkspaceBmiCheck = Camelize<Omit<Tables<"bmi_checks">, "updated_by_user">>;
export type WorkspaceActionItem = Camelize<Tables<"action_items">>;
export type WorkspaceReplacement = Camelize<Tables<"replacements">>;
export type WorkspaceWeeklyReport = Camelize<Tables<"weekly_reports">>;

/** Everything one link may see, camelCased with lib/rules camelize (shallow). */
export type Workspace = {
  scope: WorkspaceScope;
  /** "Stasiun SUB", "KPS · semua stasiun" or "Pemilik · semua stasiun": show it wherever the scope matters. */
  scopeLabel: string;
  /** True for KPS links and for the owner (both see every station and the KPS-only fields). */
  isKps: boolean;
  /** The signed-in owner (/admin). Owner-only extras (staff delete, new action items) check this. */
  isOwner: boolean;
  /** The link's own label (set by the owner), e.g. "PIC SUB"; "Pemilik" for the owner. */
  label: string | null;
  /** This link's id (rows whose updatedByLink equals it were changed "lewat tautan ini"); null for the owner. */
  linkId: string | null;
  settings: Camelize<Partial<Tables<"settings">>>;
  /** Complete schedule for the rail, or null if share_open did not send it. */
  schedule: WorkspaceSchedule | null;
  stations: Camelize<Tables<"stations">>[];
  staff: WorkspaceStaff[];
  weeklyScores: WorkspaceWeeklyScore[];
  bmiChecks: WorkspaceBmiCheck[];
  actionItems: WorkspaceActionItem[];
  replacements: WorkspaceReplacement[];
  weeklyReports: WorkspaceWeeklyReport[];
  /** share_links.id → label, to show which link last changed a row (updated_by_link). */
  linkLabels: Record<string, string>;
};

export type WorkspaceResult =
  | { ok: true; workspace: Workspace }
  | { ok: false; reason: "invalid-link" }
  | { ok: false; reason: "unavailable"; detail: string };

/** Props every workbook screen takes (components/<feature>/<Feature>Screen.tsx). */
export type ScreenProps = {
  access: WorkspaceAccess;
  ws: Workspace;
  /** Already awaited. */
  searchParams: SearchParams;
};

/** 24 random bytes as hex (docs/SPEC.md). Anything else is rejected before a database call. */
const TOKEN = /^[0-9a-f]{48}$/i;

export function isWellFormedToken(token: string): boolean {
  return TOKEN.test(token);
}

export function scopeLabel(scope: WorkspaceScope, owner = false): string {
  if (owner) return "Pemilik · semua stasiun";
  return scope === "KPS" ? "KPS · semua stasiun" : `Stasiun ${scope}`;
}

function toSchedule(settings: Tables<"settings"> | null): WorkspaceSchedule | null {
  if (!settings) return null;
  const { week1_start, weeks, bmi_first_check, bmi_interval_days, bmi_periods } = settings;
  if (!week1_start || !weeks || !bmi_first_check || !bmi_interval_days || !bmi_periods) return null;
  return { week1_start, weeks, bmi_first_check, bmi_interval_days, bmi_periods };
}

function toWorkspace(raw: ShareOpenPayload, owner: boolean): Workspace {
  return {
    scope: raw.scope,
    scopeLabel: scopeLabel(raw.scope, owner),
    isKps: raw.scope === "KPS",
    isOwner: owner,
    label: raw.label,
    linkId: owner ? null : raw.link_id,
    settings: camelize(raw.settings ?? {}),
    schedule: toSchedule(raw.settings),
    stations: (raw.stations ?? []).map(camelize),
    staff: (raw.staff ?? []).map(camelize),
    weeklyScores: (raw.weekly_scores ?? []).map(camelize),
    bmiChecks: (raw.bmi_checks ?? []).map(camelize),
    actionItems: (raw.action_items ?? []).map(camelize),
    replacements: (raw.replacements ?? []).map(camelize),
    weeklyReports: (raw.weekly_reports ?? []).map(camelize),
    linkLabels: raw.link_labels ?? {},
  };
}

/** No HTTP answer at all (postgrest-js reports status 0), e.g. "TypeError: fetch failed". */
function isNetworkFailure(status: number, error: { code?: string }): boolean {
  return status === 0 && !error.code;
}

type Client = SupabaseClient<Database>;

async function openShare(client: Client, token: string) {
  const first = await client.rpc("share_open", { p_token: token });
  if (!first.error || !isNetworkFailure(first.status, first.error)) return first;
  // One retry for a dropped connection only; a database answer such as invalid_link is final.
  return client.rpc("share_open", { p_token: token });
}

function toResult(
  { data, error }: { data: unknown; error: PostgrestError | null },
  owner: boolean,
): WorkspaceResult {
  if (error) {
    const linkError = toLinkError(error);
    if (linkError.code === "invalid_link") return { ok: false, reason: "invalid-link" };
    return { ok: false, reason: "unavailable", detail: error.message };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, reason: "unavailable", detail: "Jawaban share_open tidak berbentuk objek." };
  }
  return { ok: true, workspace: toWorkspace(data as unknown as ShareOpenPayload, owner) };
}

/**
 * share_open(token), memoised per request so the layout and page share one call. Never
 * "use cache" it: the token would become a plain-text cache key. connection() keeps it,
 * and the clock reads after it, out of any prerender.
 */
export const getWorkspace = cache(async (token: string): Promise<WorkspaceResult> => {
  if (!isWellFormedToken(token)) return { ok: false, reason: "invalid-link" };
  if (!getSupabasePublicEnv()) {
    return { ok: false, reason: "unavailable", detail: "Supabase belum dikonfigurasi." };
  }

  await connection();
  return toResult(await openShare(createLinkClient(), token), false);
});

/**
 * The owner's workspace: share_open('') with the signed-in session (cookie client), which
 * the database treats as scope KPS, label "Pemilik", no link id. Memoised per request.
 * Returns "unavailable" for anyone who is not a signed-in admin; pages gate with
 * requireWorkspaceFor(OWNER_ACCESS), which redirects a signed-out visitor to /login.
 */
const getOwnerWorkspace = cache(async (): Promise<WorkspaceResult> => {
  const session = await getAdminSession();
  if (session.status !== "admin") {
    return { ok: false, reason: "unavailable", detail: "Masuk sebagai pemilik untuk membuka workbook ini." };
  }
  return toResult(await openShare(await createSessionClient(), ""), true);
});

/** The workspace for any access: a link (share_open(token)) or the owner (share_open('')). */
export function getWorkspaceFor(access: WorkspaceAccess): Promise<WorkspaceResult> {
  return access.kind === "owner" ? getOwnerWorkspace() : getWorkspace(access.token);
}

/**
 * For pages: the workspace or a thrown error. The owner path calls requireAdmin() first,
 * so a signed-out visitor is redirected to /login and a non-admin gets an error.
 */
export async function requireWorkspaceFor(access: WorkspaceAccess): Promise<Workspace> {
  if (access.kind === "owner") await requireAdmin();
  const result = await getWorkspaceFor(access);
  if (result.ok) return result.workspace;
  if (result.reason === "invalid-link") throw new Error("Tautan tidak berlaku atau sudah dicabut.");
  throw new Error(`Ruang kerja tidak bisa dibuka: ${result.detail}`);
}

// ------------------------------------------------------------------------------------------
// Server Actions: accessKey → client + p_token, without a share_open round trip.
// ------------------------------------------------------------------------------------------

type PublicFunctions = Database["public"]["Functions"];

/** Every share_* function in the generated types. */
export type ShareFunction = Extract<keyof PublicFunctions, `share_${string}`>;
/** Its arguments without p_token (resolveAccess injects it). */
export type ShareArgs<F extends ShareFunction> = Omit<PublicFunctions[F]["Args"], "p_token">;
export type ShareResult<F extends ShareFunction> = {
  data: PublicFunctions[F]["Returns"] | null;
  error: PostgrestError | null;
};
export type ShareRpc = <F extends ShareFunction>(fn: F, args: ShareArgs<F>) => Promise<ShareResult<F>>;

export type ResolvedAccess =
  | {
      ok: true;
      access: WorkspaceAccess;
      /** Calls a share_* function with the right client and p_token ('' for the owner). */
      rpc: ShareRpc;
      /** The owner's cookie client, for owner-only direct table writes (RLS: is_admin()). null for links. */
      ownerClient: Client | null;
    }
  | { ok: false; error: LinkError };

function bindRpc(client: Client, token: string): ShareRpc {
  // The generated overloads cannot be called with a generic function name; the call shape is
  // identical for every share_* function, so one cast here keeps the callers fully typed.
  const call = client.rpc.bind(client) as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: PostgrestError | null }>;
  return async (fn, args) => {
    const { data, error } = await call(fn, { ...(args as Record<string, unknown>), p_token: token });
    return { data: data as never, error };
  };
}

/**
 * Guard + client for a Server Action. The client passes `access.key` (a token, or "owner"):
 *
 *   export async function saveSomething(accessKey: string, input: Input) {
 *     const resolved = await resolveAccess(accessKey);
 *     if (!resolved.ok) return { ok: false, error: resolved.error };
 *     const { error } = await resolved.rpc("share_save_check", { p_staff_code, … });
 *   }
 *
 * - owner: requireAdmin() (signed out → redirect to /login; not an admin → error), then the
 *   cookie client with p_token ''.
 * - link: only the token's shape is checked here. The share_* function itself rejects an
 *   unknown or revoked token (invalid_link) and anything outside the link's scope
 *   (out_of_scope / forbidden_field), so no share_open round trip per save.
 */
export async function resolveAccess(accessKey: unknown): Promise<ResolvedAccess> {
  if (!getSupabasePublicEnv()) {
    return { ok: false, error: { code: "unknown", message: "Aplikasi belum terhubung ke database." } };
  }
  if (accessKey === OWNER_ACCESS_KEY) {
    try {
      await requireAdmin();
    } catch (error) {
      unstable_rethrow(error);
      return {
        ok: false,
        error: {
          code: "unauthorized",
          message: "Sesi pemilik tidak bisa diperiksa atau akun ini bukan admin. Masuk lagi, lalu ulangi.",
        },
      };
    }
    const client = await createSessionClient();
    return { ok: true, access: OWNER_ACCESS, rpc: bindRpc(client, ""), ownerClient: client };
  }
  if (typeof accessKey !== "string" || !isWellFormedToken(accessKey)) {
    return { ok: false, error: toLinkError({ message: "invalid_link" }) };
  }
  return { ok: true, access: linkAccess(accessKey), rpc: bindRpc(createLinkClient(), accessKey), ownerClient: null };
}

/**
 * Link-only shorthand for requireWorkspaceFor(linkAccess(token)). Server Actions use
 * resolveAccess(accessKey) instead (no share_open per save).
 */
export async function requireWorkspace(token: string): Promise<Workspace> {
  const result = await getWorkspace(token);
  if (result.ok) return result.workspace;
  if (result.reason === "invalid-link") {
    throw new Error("Tautan tidak berlaku atau sudah dicabut.");
  }
  throw new Error(`Ruang kerja tidak bisa dibuka: ${result.detail}`);
}
