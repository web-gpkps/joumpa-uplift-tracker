import { Suspense, type ReactNode } from "react";
import { Brand } from "./Brand";
import { ProgrammeContext } from "./ProgrammeContext";
import { ShellFrame, ShellLoading } from "./ShellFrame";
import { SignOutButton } from "./SignOutButton";
import { OWNER_NAV } from "./nav-items";

const ownerBrand = (
  <Brand
    href="/admin"
    linkLabel="Dashboard, pemilik"
    title="Pemilik · semua stasiun"
    subtitle="Uplift Tracker JOUMPA"
  />
);

/**
 * Owner area chrome (/admin): the full workbook for every station (the same sheets as a
 * station link), then Tautan, Parameter and Sinkronisasi. Signed-in admin only.
 */
export function OwnerShell({ email, children }: { email: string; children: ReactNode }) {
  return (
    <ShellFrame
      brand={ownerBrand}
      items={OWNER_NAV}
      navLabel="Menu pemilik"
      aside={
        <>
          <span className="min-w-0 truncate text-sm text-ink-muted" title={email}>
            {email}
          </span>
          <SignOutButton variant="secondary" />
        </>
      }
      context={
        <Suspense fallback={<p className="text-xs text-ink-muted">Memuat jadwal program…</p>}>
          <ProgrammeContext />
        </Suspense>
      }
    >
      {children}
    </ShellFrame>
  );
}

export function OwnerShellLoading() {
  return <ShellLoading brand={ownerBrand} label="Memeriksa akses pemilik" />;
}
