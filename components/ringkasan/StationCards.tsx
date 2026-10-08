import Link from "next/link";
import type { ReactNode } from "react";
import type { DashboardSummary, Ratio } from "@/lib/dashboard";
import { formatRatio, formatScore, formatSignedScore } from "@/lib/format";
import type { SheetLinks } from "@/lib/workspace/access";
import { KpiTile, linkTo } from "@/components/dashboard/KpiTile";
import type { Kpi } from "@/lib/dashboard";

/**
 * The KPI strip, two tiles per row on phones (five stacked tiles would push the
 * "Perlu ditangani" list off the first screens), five in a row from 1024 px.
 */
export function KpiGrid({ kpis, links }: { kpis: Kpi[]; links: SheetLinks }) {
  const shown = kpis.slice(0, 5);
  return (
    <ul aria-label="Angka utama" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {shown.map((kpi, i) => (
        <li key={kpi.key} className={`flex ${shown.length % 2 === 1 && i === shown.length - 1 ? "col-span-2 lg:col-span-1" : ""}`}>
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

function Bar({ value, total }: { value: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <span aria-hidden="true" className="mt-1 block h-1.5 w-full overflow-hidden rounded-control bg-neutral-tint">
      <span className="block h-full bg-brand" style={{ width: `${pct}%` }} />
    </span>
  );
}

function Metric({ label, href, children }: { label: string; href: string; children: ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-11 flex-col justify-center gap-0.5 px-4 py-2 transition-colors duration-150 hover:bg-paper"
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-ink-muted">{label}</span>
          <span className="text-right text-sm text-ink tabular-nums">{children}</span>
        </span>
      </Link>
    </li>
  );
}

function RatioValue({ ratio, empty }: { ratio: Ratio; empty: string }) {
  if (ratio.value === null) return <span className="text-ink-muted">{empty}</span>;
  return (
    <>
      <span className="font-semibold">{ratio.value}</span> dari {ratio.total}
    </>
  );
}

/**
 * Phone version of the station comparison (under 768 px): one card per station with
 * the same six figures and the same links as the table.
 */
export function StationCards({ summary, links }: { summary: DashboardSummary; links: SheetLinks }) {
  const notYet = summary.phase === "before" ? "Belum mulai" : "Belum ada";
  const weekLabel = summary.week ? `Dinilai Minggu ke-${summary.week}` : "Dinilai minggu ini";
  const bmiLabel = summary.bmiPeriod ? `Cek BMI periode ${summary.bmiPeriod}` : "Cek BMI periode ini";
  return (
    <ul className="flex flex-col gap-3">
      {summary.comparison.map((row) => (
        <li key={row.station} className="overflow-hidden rounded-control border border-line bg-surface">
          <h3 className="flex items-baseline justify-between gap-3 border-b border-line bg-paper px-4 py-2">
            <span className="text-base font-semibold text-ink">{row.station}</span>
            {row.sharedGroup ? <span className="text-xs text-ink-muted">Tindak lanjut gabungan {row.group}</span> : null}
          </h3>
          <ul className="flex flex-col divide-y divide-line">
            <Metric label={weekLabel} href={linkTo(links, row.assessed.link)}>
              <RatioValue ratio={row.assessed} empty={notYet} />
              {row.assessed.value !== null ? <Bar value={row.assessed.value} total={row.assessed.total} /> : null}
            </Metric>
            <Metric label="Rata-rata skor (baseline)" href={linkTo(links, row.score.link)}>
              {row.score.current === null ? (
                <span className="text-ink-muted">Belum dinilai ({formatScore(row.score.baseline)})</span>
              ) : (
                <>
                  <span className="font-semibold">{formatScore(row.score.current)}</span>{" "}
                  <span className="text-ink-muted">
                    ({formatScore(row.score.baseline)}, {formatSignedScore(row.score.gain)})
                  </span>
                </>
              )}
            </Metric>
            <Metric label="% Sesuai" href={linkTo(links, row.pctSesuai.link)}>
              {row.pctSesuai.value === null ? (
                <span className="text-ink-muted">Belum dinilai</span>
              ) : (
                formatRatio(row.pctSesuai.value)
              )}
            </Metric>
            <Metric label={bmiLabel} href={linkTo(links, row.bmiChecked.link)}>
              <RatioValue ratio={row.bmiChecked} empty={notYet} />
              {row.bmiChecked.value !== null ? <Bar value={row.bmiChecked.value} total={row.bmiChecked.total} /> : null}
            </Metric>
            <Metric label="Tindak Lanjut selesai" href={linkTo(links, row.actionsDone.link)}>
              <RatioValue ratio={row.actionsDone} empty="0" />
            </Metric>
            <Metric label="OVERDUE" href={linkTo(links, row.overdue.link)}>
              <span className={row.overdue.value > 0 ? "font-semibold text-critical" : undefined}>{row.overdue.value}</span>
            </Metric>
          </ul>
        </li>
      ))}
    </ul>
  );
}
