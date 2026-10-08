import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./Logo";

type BrandProps = {
  /** Where the logo leads: the shell's home (/admin, or /s/<token>). */
  href: string;
  /** Accessible name of the logo link, e.g. "Ringkasan, Stasiun SUB". */
  linkLabel: string;
  /** Main line next to the logo: the scope in the workspace, the area name for the owner. */
  title: ReactNode;
  /** Muted second line. */
  subtitle?: ReactNode;
};

/**
 * Logo (36 px, DESIGN.md header size) plus who/where you are. The logo keeps its 9 px
 * clear space; the negative margin lines its visible edge up with the page content.
 * The title stays visible on phones because it carries the scope. Server-component friendly.
 */
export function Brand({ href, linkLabel, title, subtitle }: BrandProps) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Link href={href} aria-label={linkLabel} className="-ml-[9px] shrink-0 rounded-control">
        <Logo height={36} />
      </Link>
      <div className="min-w-0 border-l border-line pl-3">
        <p className="truncate text-sm font-semibold text-ink">{title}</p>
        {subtitle ? <p className="truncate text-xs text-ink-muted">{subtitle}</p> : null}
      </div>
    </div>
  );
}
