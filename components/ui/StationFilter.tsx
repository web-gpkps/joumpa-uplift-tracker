import Link from "next/link";
import { cx } from "./cx";

export type StationFilterOption = {
  /** Station code, or null for "Semua stasiun". */
  code: string | null;
  label: string;
  /** Short extra text after the label, e.g. "2/5" dinilai or "26" SDM. */
  meta?: string;
  /** Spoken version of `meta`, e.g. "2 dari 5 sudah dinilai". */
  metaLabel?: string;
  href: string;
};

type StationFilterProps = {
  options: StationFilterOption[];
  current: string | null;
  /** Accessible name of the group. */
  label?: string;
};

/**
 * The KPS station filter on every workspace screen: real links (?stasiun=SUB), so the
 * choice survives a reload, and chips that wrap instead of scrolling on phones.
 * Current option: --brand border on --brand-tint plus aria-current. Render it inside
 * the PageHeader, and only for KPS links (a station link sees one station).
 */
export function StationFilter({ options, current, label = "Filter stasiun" }: StationFilterProps) {
  return (
    <nav aria-label={label} className="flex flex-col gap-1.5" data-print="hide">
      <p className="section-label">Stasiun</p>
      <ul className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = option.code === current;
          return (
            <li key={option.code ?? "semua"}>
              <Link
                href={option.href}
                aria-current={active ? "page" : undefined}
                data-remember-stasiun={option.code ?? "semua"}
                scroll={false}
                className={cx(
                  "inline-flex min-h-11 items-center gap-2 rounded-control border px-3 text-sm whitespace-nowrap sm:min-h-9",
                  "transition-colors duration-150",
                  active
                    ? "border-brand bg-brand-tint font-semibold text-ink"
                    : "border-line-strong bg-surface text-ink hover:bg-neutral-tint",
                )}
              >
                {option.label}
                {option.meta ? (
                  <>
                    <span aria-hidden="true" className="text-xs text-ink-muted tabular-nums">
                      {option.meta}
                    </span>
                    {option.metaLabel ? <span className="sr-only">, {option.metaLabel}</span> : null}
                  </>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
