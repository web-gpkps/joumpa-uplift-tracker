import Link from "next/link";
import type { DashboardLink, Kpi } from "@/lib/dashboard";
import type { SheetLinks } from "@/lib/workspace/access";
import { cx } from "@/components/ui/cx";

type KpiTileProps = {
  label: string;
  /** null shows `note` instead of a number (nothing to count yet). */
  value: number | null;
  /** Denominator: renders "12 dari 75". */
  total?: number | null;
  /** The comparison basis in words. Required: a number without its basis misleads. */
  basis: string;
  note?: string;
  tone?: Kpi["tone"];
  href: string;
};

/**
 * One dashboard number (docs/UX.md §3): a real value with its basis in words, linking to
 * the sheet that explains it. Never an invented delta. Before there is anything to count,
 * it says so (note) instead of showing 0. Server-component friendly.
 */
export function KpiTile({ label, value, total, basis, note, tone = "neutral", href }: KpiTileProps) {
  const spoken =
    value === null
      ? `${label}: ${note ?? "belum ada data"}`
      : `${label}: ${value}${total !== null && total !== undefined ? ` dari ${total}` : ""}, ${basis}`;
  return (
    <Link
      href={href}
      aria-label={spoken}
      className="group flex min-h-28 flex-col gap-1 rounded-panel border border-line bg-surface p-4 transition-colors duration-150 hover:border-line-strong"
    >
      <span className="section-label">{label}</span>
      {value === null ? (
        <span className="text-sm font-semibold text-ink">{note ?? "Belum ada data."}</span>
      ) : (
        <span className="flex items-baseline gap-1.5">
          <span
            className={cx(
              "text-2xl font-semibold tabular-nums",
              tone === "critical" ? "text-critical" : tone === "good" ? "text-good" : "text-ink",
            )}
          >
            {value}
          </span>
          {total !== null && total !== undefined ? (
            <span className="text-sm text-ink-muted tabular-nums">dari {total}</span>
          ) : null}
        </span>
      )}
      <span className="text-xs text-ink-muted">{basis}</span>
    </Link>
  );
}

/** The KPI strip: at most five tiles from lib/dashboard, linked through hrefs(access). */
export function KpiStrip({ kpis, links, label = "Angka utama" }: { kpis: Kpi[]; links: SheetLinks; label?: string }) {
  return (
    <ul aria-label={label} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {kpis.slice(0, 5).map((kpi) => (
        <li key={kpi.key} className="flex">
          <KpiTile
            label={kpi.label}
            value={kpi.value}
            total={kpi.total}
            basis={kpi.basis}
            note={kpi.note}
            tone={kpi.tone}
            href={linkTo(links, kpi.link)}
          />
        </li>
      ))}
    </ul>
  );
}

export function linkTo(links: SheetLinks, link: DashboardLink): string {
  return links.to(link.sheet, link.query);
}
