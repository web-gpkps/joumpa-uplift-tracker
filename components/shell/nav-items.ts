import { OWNER_ACCESS, OWNER_PAGES, SHEETS, type WorkspaceAccess } from "@/lib/workspace/access";

export type NavItem = {
  href: string;
  label: string;
  /** Active only on this exact path (index pages), not on its children. */
  exact?: boolean;
  /**
   * Starts a new group: a thin divider on desktop, this text as a small heading in the
   * phone menu (e.g. the owner-only pages after the workbook sheets).
   */
  groupLabel?: string;
};

/**
 * The workbook sheets (docs/UX.md §1), the same names for every role. Paths come from
 * the access's base path: /s/<token>/… for a link, /admin/… for the owner.
 */
export function sheetNav(access: Pick<WorkspaceAccess, "basePath">): NavItem[] {
  return SHEETS.map((sheet) => ({
    href: `${access.basePath}${sheet.path}`,
    label: sheet.label,
    exact: sheet.path === "",
  }));
}

/** Owner area: the workbook for all stations, then Tautan, Parameter, Sinkronisasi. */
export const OWNER_NAV: NavItem[] = [
  ...sheetNav(OWNER_ACCESS),
  ...OWNER_PAGES.map((page, i) => ({
    href: page.path,
    label: page.label,
    groupLabel: i === 0 ? "Pengaturan pemilik" : undefined,
  })),
];

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
