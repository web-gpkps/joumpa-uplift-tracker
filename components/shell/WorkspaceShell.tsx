import type { ReactNode } from "react";
import type { Workspace } from "@/lib/workspace";
import type { WorkspaceAccess } from "@/lib/workspace/access";
import { APP_NAME } from "@/lib/app-info";
import { Brand } from "./Brand";
import { Logo } from "./Logo";
import { ShellFrame, ShellLoading } from "./ShellFrame";
import { WeekRail } from "./WeekRail";
import { sheetNav } from "./nav-items";

type WorkspaceShellProps = {
  access: WorkspaceAccess;
  workspace: Workspace;
  /** Today in Asia/Jakarta, from todayInJakarta() at request time. */
  today: string;
  children: ReactNode;
};

/**
 * Station workspace chrome (/s/<token>, no account): the scope is the first thing
 * next to the logo ("Stasiun SUB" / "KPS · semua stasiun"), the link's label sits on
 * the right, and the 10-week rail is the context line.
 */
export function WorkspaceShell({ access, workspace, today, children }: WorkspaceShellProps) {
  return (
    <ShellFrame
      brand={
        <Brand
          href={access.basePath}
          linkLabel={`Dashboard, ${workspace.scopeLabel}`}
          title={workspace.scopeLabel}
          subtitle={APP_NAME}
        />
      }
      items={sheetNav(access)}
      navLabel={`Menu ${workspace.scopeLabel}`}
      aside={
        workspace.label ? (
          <span className="min-w-0 truncate text-sm text-ink-muted" title={workspace.label}>
            Tautan: {workspace.label}
          </span>
        ) : undefined
      }
      context={
        workspace.schedule ? (
          <WeekRail
            variant="compact"
            settings={workspace.schedule}
            today={today}
            className="lg:flex-row lg:items-center lg:justify-between lg:gap-6"
          />
        ) : (
          <p className="text-xs text-ink-muted">
            Jadwal 10 minggu belum terbaca dari tautan ini. Halaman tetap bisa dipakai.
          </p>
        )
      }
    >
      {children}
    </ShellFrame>
  );
}

export function WorkspaceShellLoading() {
  return (
    <ShellLoading
      brand={
        <div className="flex min-w-0 items-center gap-3">
          <Logo height={36} className="-ml-[9px]" />
          <p className="truncate border-l border-line pl-3 text-sm font-semibold text-ink">
            {APP_NAME}
          </p>
        </div>
      }
      label="Membuka ruang kerja stasiun"
    />
  );
}
