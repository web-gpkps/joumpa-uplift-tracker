/*
 * Who is looking at a workspace, and where its pages live. Pure and client-safe: no
 * server-only import, so client components may build links with hrefs(access).
 *
 * Two kinds of access, one set of screens (docs/UX.md §1):
 *   link  : /s/<token>, no account; scope comes from the link (SUB … KNO, or KPS).
 *   owner : /admin, the signed-in owner; scope "KPS" with label "Pemilik" in SQL.
 *
 * Server code turns an access into data with getWorkspaceFor(access) and, in Server
 * Actions, turns the serialisable accessKey back into a client with resolveAccess(key)
 * (both in lib/workspace/index.ts, server only).
 */

export type WorkspaceAccess =
  | {
      kind: "link";
      /** The link token (48 hex). A bearer credential: never log it or put it in a cache key. */
      token: string;
      /** Pass this to Server Actions (here: the token itself). */
      key: string;
      basePath: string;
    }
  | {
      kind: "owner";
      key: typeof OWNER_ACCESS_KEY;
      basePath: "/admin";
    };

/** The accessKey a Server Action receives for the owner. Never a valid token (not 48 hex). */
export const OWNER_ACCESS_KEY = "owner";

export function linkAccess(token: string): WorkspaceAccess {
  return { kind: "link", token, key: token, basePath: `/s/${token}` };
}

export const OWNER_ACCESS: WorkspaceAccess = {
  kind: "owner",
  key: OWNER_ACCESS_KEY,
  basePath: "/admin",
};

/** The workbook sheets every role sees (UX.md §1), in nav order, with their path under basePath. */
export const SHEETS = [
  { key: "dashboard", label: "Dashboard", path: "" },
  { key: "sdm", label: "Master SDM", path: "/sdm" },
  { key: "performa", label: "Log Performa", path: "/performa" },
  { key: "bmi", label: "Cek BMI", path: "/bmi" },
  { key: "tindakLanjut", label: "Tindak Lanjut", path: "/tindak-lanjut" },
  { key: "penggantian", label: "Penggantian SDM", path: "/penggantian" },
  { key: "laporan", label: "Laporan Mingguan", path: "/laporan" },
] as const;

export type SheetKey = (typeof SHEETS)[number]["key"];

/** Owner-only pages (no station link ever reaches them). */
export const OWNER_PAGES = [
  { key: "tautan", label: "Tautan", path: "/admin/tautan" },
  { key: "pengaturan", label: "Parameter", path: "/admin/pengaturan" },
  { key: "sinkronisasi", label: "Sinkronisasi", path: "/admin/sinkronisasi" },
] as const;

export type QueryValue = string | number | null | undefined | false;

/** "?minggu=3&stasiun=SUB" from a record; null, undefined, false and "" are left out. */
export function toQuery(query: Record<string, QueryValue> | undefined): string {
  if (!query) return "";
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === false || value === "") continue;
    sp.set(key, String(value));
  }
  const text = sp.toString();
  return text ? `?${text}` : "";
}

export type SheetLinks = Record<SheetKey, string> & {
  /** Sheet path plus query: links.to("bmi", { periode: 2, stasiun: "SUB" }). */
  to: (sheet: SheetKey, query?: Record<string, QueryValue>, hash?: string) => string;
};

/**
 * Every internal path for this access. Use it for all links and redirects inside a screen,
 * never a hard-coded "/s/${token}" or "/admin":
 *   const links = hrefs(access);
 *   <Link href={links.sdm}> … <Link href={links.to("performa", { minggu: 3 })}>
 * The returned object holds only strings plus `to`; pass `links.sdm` (a string) to client
 * components, or call hrefs(access) inside them (access is serialisable).
 */
export function hrefs(access: Pick<WorkspaceAccess, "basePath">): SheetLinks {
  const base = access.basePath;
  const paths = Object.fromEntries(SHEETS.map((s) => [s.key, `${base}${s.path}`])) as Record<SheetKey, string>;
  return {
    ...paths,
    to(sheet, query, hash) {
      return `${paths[sheet]}${toQuery(query)}${hash ? `#${hash}` : ""}`;
    },
  };
}

/** Search params as Next passes them to a page, already awaited. */
export type SearchParams = Record<string, string | string[] | undefined>;
