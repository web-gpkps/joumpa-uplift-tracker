import Link from "next/link";
import type { ReactNode } from "react";
import type { DashboardSummary, Ratio } from "@/lib/dashboard";
import { formatRatio, formatScore, formatSignedScore } from "@/lib/format";
import type { SheetLinks } from "@/lib/workspace/access";
import { DataTable, Td, Th } from "@/components/ui/DataTable";
import { linkTo } from "./KpiTile";

const cellLink = "-mx-3 -my-2 flex min-h-10 flex-col justify-center gap-1 px-3 py-2 hover:bg-paper";

function Bar({ value, total }: { value: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <span aria-hidden="true" className="block h-1.5 w-full max-w-28 overflow-hidden rounded-control bg-neutral-tint">
      <span className="block h-full bg-brand" style={{ width: `${pct}%` }} />
    </span>
  );
}

function RatioCell({ ratio, links, empty }: { ratio: Ratio; links: SheetLinks; empty: string }) {
  return (
    <Link href={linkTo(links, ratio.link)} className={cellLink}>
      {ratio.value === null ? (
        <span className="text-ink-muted">{empty}</span>
      ) : (
        <>
          <span className="tabular-nums">
            <span className="font-semibold">{ratio.value}</span> dari {ratio.total}
          </span>
          <Bar value={ratio.value} total={ratio.total} />
        </>
      )}
    </Link>
  );
}

function LinkCell({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={cellLink}>
      {children}
    </Link>
  );
}

/**
 * "How is each station doing?" (docs/UX.md §3): one row per station, inline bars, and every
 * cell a link to the sheet filtered to that station. Feed it dashboardSummary(...) and
 * hrefs(access). Server-component friendly.
 */
export function StationComparison({ summary, links }: { summary: DashboardSummary; links: SheetLinks }) {
  const weekLabel = summary.week ? `SDM dinilai Mg ${summary.week}` : "SDM dinilai minggu ini";
  const bmiLabel = summary.bmiPeriod ? `Cek BMI periode ${summary.bmiPeriod}` : "Cek BMI periode ini";
  const notYet = summary.phase === "before" ? "Belum mulai" : "Belum ada";
  return (
    <DataTable caption="Perbandingan stasiun" hideCaption stickyHeader={false} minWidth="56rem">
      <thead>
        <tr>
          <Th>Stasiun</Th>
          <Th>{weekLabel}</Th>
          <Th numeric>Rata-rata skor (baseline)</Th>
          <Th numeric>% Sesuai</Th>
          <Th>{bmiLabel}</Th>
          <Th>Tindak Lanjut selesai</Th>
          <Th numeric>OVERDUE</Th>
        </tr>
      </thead>
      <tbody>
        {summary.comparison.map((row) => (
          <tr key={row.station}>
            <Th scope="row" className="font-semibold">
              {row.station}
            </Th>
            <Td>
              <RatioCell ratio={row.assessed} links={links} empty={notYet} />
            </Td>
            <Td numeric>
              <LinkCell href={linkTo(links, row.score.link)}>
                {row.score.current === null ? (
                  <span className="text-ink-muted">Belum dinilai</span>
                ) : (
                  <span className="tabular-nums">
                    <span className="font-semibold">{formatScore(row.score.current)}</span>{" "}
                    <span className="text-ink-muted">
                      ({formatScore(row.score.baseline)}, {formatSignedScore(row.score.gain)})
                    </span>
                  </span>
                )}
              </LinkCell>
            </Td>
            <Td numeric>
              <LinkCell href={linkTo(links, row.pctSesuai.link)}>
                {row.pctSesuai.value === null ? (
                  <span className="text-ink-muted">Belum dinilai</span>
                ) : (
                  <span className="tabular-nums">{formatRatio(row.pctSesuai.value)}</span>
                )}
              </LinkCell>
            </Td>
            <Td>
              <RatioCell ratio={row.bmiChecked} links={links} empty={notYet} />
            </Td>
            <Td>
              <Link href={linkTo(links, row.actionsDone.link)} className={cellLink}>
                <span className="tabular-nums">
                  <span className="font-semibold">{row.actionsDone.value}</span> dari {row.actionsDone.total}
                </span>
                {row.sharedGroup ? <span className="text-xs text-ink-muted">gabungan {row.group}</span> : null}
              </Link>
            </Td>
            <Td numeric>
              <LinkCell href={linkTo(links, row.overdue.link)}>
                <span className={row.overdue.value > 0 ? "font-semibold text-critical tabular-nums" : "tabular-nums"}>
                  {row.overdue.value}
                </span>
              </LinkCell>
            </Td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}
