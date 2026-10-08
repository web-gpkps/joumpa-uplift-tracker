/** Share-link scopes and the shapes the Tautan stasiun screen passes around. */

export const LINK_SCOPES = ["SUB", "DPS", "CGK", "HLP", "KNO", "KPS"] as const;
export type LinkScope = (typeof LINK_SCOPES)[number];

export function isLinkScope(value: string): value is LinkScope {
  return (LINK_SCOPES as readonly string[]).includes(value);
}

/** What each scope opens, in the words the share page itself uses (lib/workspace scopeLabel). */
export const SCOPE_DESCRIPTION: Record<LinkScope, string> = {
  SUB: "Stasiun SUB: data SUB saja",
  DPS: "Stasiun DPS: data DPS saja",
  CGK: "Stasiun CGK: data CGK, tindak lanjut laporan CGK & HLP",
  HLP: "Stasiun HLP: data HLP, tindak lanjut laporan CGK & HLP",
  KNO: "Stasiun KNO: data KNO saja",
  KPS: "KPS: semua stasiun, termasuk Catatan KPS dan definisi tindak lanjut",
};

export type LinkRow = {
  id: string;
  scope: string;
  label: string | null;
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  /** Full URL for active links (the owner can copy it again); null once revoked. */
  url: string | null;
  /** Labels starting with "QA test" mark temporary links made for testing. */
  isQa: boolean;
};

export type NewLink = { scope: string; label: string | null; url: string };

export type LinkActionResult =
  | { ok: true; link?: NewLink; message: string }
  | { ok: false; message: string; fieldErrors?: { scope?: string; label?: string } };
