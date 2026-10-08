import type { ReactNode } from "react";
import { LoadingState } from "@/components/ui/States";
import { ShellNav } from "./ShellNav";
import type { NavItem } from "./nav-items";

export const shellFrame = "mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8";

type ShellFrameProps = {
  brand: ReactNode;
  items: NavItem[];
  navLabel: string;
  aside?: ReactNode;
  /** Row 3: the programme context line (compact WeekRail). */
  context?: ReactNode;
  children: ReactNode;
};

/**
 * Top bar shared by both shells (a top bar, not a sidebar, so wide tables keep the width).
 * Not sticky, so tables get the whole screen; hidden when printing.
 */
export function ShellFrame({ brand, items, navLabel, aside, context, children }: ShellFrameProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#isi"
        className="sr-only z-50 rounded-control border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink shadow-float focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Lewati ke isi halaman
      </a>
      <header className="border-b border-line bg-paper" data-print="hide">
        <div className={shellFrame}>
          <ShellNav brand={brand} items={items} aside={aside} label={navLabel} />
          {context ? <div className="py-3">{context}</div> : null}
        </div>
      </header>
      <main id="isi" className={`${shellFrame} flex-1 py-6 sm:py-8 print:py-0`}>
        {children}
      </main>
    </div>
  );
}

/** Static shell shown while a gate runs (prerendered; reads no request data). */
export function ShellLoading({ brand, label }: { brand: ReactNode; label: string }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-paper" data-print="hide">
        <div className={`${shellFrame} flex min-h-14 items-center`}>{brand}</div>
      </header>
      <main className={`${shellFrame} flex-1 py-6 sm:py-8`}>
        <LoadingState label={label} />
      </main>
    </div>
  );
}
