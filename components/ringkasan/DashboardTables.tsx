/*
 * The workbook's Dashboard sections 1–4 as tables, with the workbook's own column
 * meanings. Section 1 is also Laporan Mingguan section B (same formula, same table).
 * Rows come straight from lib/aggregate; nothing is recomputed here.
 */
import type { ReactNode } from "react";
import { TOTAL, type ActionProgressRow, type BmiOverviewRow, type PerformanceRow, type ReplacementOverviewRow } from "@/lib/aggregate";
import { DataTable, Td, Th, Tr } from "@/components/ui/DataTable";
import { cx } from "@/components/ui/cx";
import { formatProgress, formatRatio, formatScore, formatSignedKg, formatSignedScore } from "@/lib/format";
import { Value } from "./format";

/** Column header that may wrap onto two lines, so wide sections fit an A4 landscape page. */
export function ColTh({ children, numeric = true }: { children: ReactNode; numeric?: boolean }) {
  return (
    <Th numeric={numeric} className="min-w-18 align-bottom whitespace-normal">
      {children}
    </Th>
  );
}

/** Row label cell; the TOTAL / SEMUA row reads heavier, like the workbook's bold total line. */
export function RowTh({ children }: { children: ReactNode }) {
  return (
    <Th scope="row" className="font-semibold whitespace-nowrap text-ink">
      {children}
    </Th>
  );
}

export function totalRowClass(key: string): string | undefined {
  return key === TOTAL || key === "SEMUA" ? "font-semibold [&>*]:bg-paper" : undefined;
}

/** A count that needs action reads in its status tone; the column header carries the meaning. */
function Flagged({ n, tone }: { n: number; tone: "critical" | "warning" }) {
  if (n === 0) return <>0</>;
  return <span className={cx("font-semibold", tone === "critical" ? "text-critical" : "text-warning")}>{n}</span>;
}

type TableProps<T> = { caption: string; rows: T[]; hideCaption?: boolean };

/** Dashboard 1 / Laporan B: action items per report group. */
export function ActionProgressTable({ caption, rows, hideCaption = true }: TableProps<ActionProgressRow>) {
  return (
    <DataTable caption={caption} hideCaption={hideCaption} stickyHeader={false} density="dense">
      <thead>
        <tr>
          <Th className="align-bottom">Laporan</Th>
          <ColTh>Total butir</ColTh>
          <ColTh>Selesai</ColTh>
          <ColTh>On Progress</ColTh>
          <ColTh>Belum Mulai</ColTh>
          <ColTh>Tertunda</ColTh>
          <ColTh>OVERDUE</ColTh>
          <ColTh>Jatuh tempo ≤ 7 hari</ColTh>
          <ColTh>% Selesai</ColTh>
          <ColTh>Rata-rata % progres</ColTh>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Tr key={r.key} className={totalRowClass(r.key)}>
            <RowTh>{r.key}</RowTh>
            <Td numeric>{r.total}</Td>
            <Td numeric>{r.selesai}</Td>
            <Td numeric>{r.onProgress}</Td>
            <Td numeric>{r.belumMulai}</Td>
            <Td numeric>{r.tertunda}</Td>
            <Td numeric>
              <Flagged n={r.overdue} tone="critical" />
            </Td>
            <Td numeric>
              <Flagged n={r.dueSoon} tone="warning" />
            </Td>
            <Td numeric>
              <Value value={r.pctDone} format={formatRatio} />
            </Td>
            <Td numeric>
              <Value value={r.avgProgress} format={formatProgress} />
            </Td>
          </Tr>
        ))}
      </tbody>
    </DataTable>
  );
}

/** Dashboard 2: report conclusion vs criteria 6.2, baseline vs latest weekly score. */
export function PerformanceTable({
  caption,
  rows,
  assessedByKey,
}: TableProps<PerformanceRow> & {
  /** Staff with at least one weekly score, per row key: the base of "Rata-rata skor terkini". */
  assessedByKey: Record<string, number>;
}) {
  return (
    <DataTable caption={caption} hideCaption stickyHeader={false} density="dense">
      <thead>
        <tr>
          <Th className="align-bottom">Stasiun</Th>
          <ColTh>Jumlah SDM</ColTh>
          <ColTh>Laporan: Sesuai*</ColTh>
          <ColTh>Laporan: Perlu Perbaikan</ColTh>
          <ColTh>Laporan: Tidak Sesuai</ColTh>
          <ColTh>Kriteria 6.2: Sesuai</ColTh>
          <ColTh>Kesimpulan beda (verifikasi)</ColTh>
          <ColTh>Rata-rata baseline</ColTh>
          <ColTh>Rata-rata skor terkini (SDM dinilai)</ColTh>
          <ColTh>Kenaikan**</ColTh>
          <ColTh>SDM naik</ColTh>
          <ColTh>Status terkini: Sesuai</ColTh>
          <ColTh>% Sesuai terkini</ColTh>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Tr key={r.key} className={totalRowClass(r.key)}>
            <RowTh>{r.key}</RowTh>
            <Td numeric>{r.staffCount}</Td>
            <Td numeric>{r.reportSesuai}</Td>
            <Td numeric>{r.reportPerlu}</Td>
            <Td numeric>{r.reportTidak}</Td>
            <Td numeric>{r.criteriaSesuai}</Td>
            <Td numeric>
              <Flagged n={r.beda} tone="warning" />
            </Td>
            <Td numeric>
              <Value value={r.baselineAvg} format={formatScore} />
            </Td>
            <Td numeric>
              <Value value={r.currentAvg} format={formatScore} />
              <span className="block text-ink-muted">
                {assessedByKey[r.key] ?? 0} dari {r.staffCount}
              </span>
            </Td>
            <Td numeric>
              <Value value={r.gain} format={formatSignedScore} />
            </Td>
            <Td numeric>{r.improved}</Td>
            <Td numeric>{r.currentSesuai}</Td>
            <Td numeric>
              <Value value={r.pctCurrentSesuai} format={formatRatio} />
            </Td>
          </Tr>
        ))}
      </tbody>
    </DataTable>
  );
}

/** Dashboard 3: latest BMI check of each staff member. */
export function BmiOverviewTable({ caption, rows }: TableProps<BmiOverviewRow>) {
  return (
    <DataTable caption={caption} hideCaption stickyHeader={false} density="dense">
      <thead>
        <tr>
          <Th className="align-bottom">Stasiun</Th>
          <ColTh>Jumlah SDM</ColTh>
          <ColTh>Sudah pernah dicek</ColTh>
          <ColTh>Normal</ColTh>
          <ColTh>Kurus</ColTh>
          <ColTh>Overweight</ColTh>
          <ColTh>Obesitas</ColTh>
          <ColTh>Tinggi tidak memenuhi</ColTh>
          <ColTh>Rata-rata Δ berat (kg)</ColTh>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Tr key={r.key} className={totalRowClass(r.key)}>
            <RowTh>{r.key}</RowTh>
            <Td numeric>{r.staffCount}</Td>
            <Td numeric>{r.everChecked}</Td>
            <Td numeric>{r.normal}</Td>
            <Td numeric>{r.kurus}</Td>
            <Td numeric>{r.overweight}</Td>
            <Td numeric>
              <Flagged n={r.obesitas} tone="critical" />
            </Td>
            <Td numeric>
              <Flagged n={r.heightNotMet} tone="critical" />
            </Td>
            <Td numeric>
              <Value value={r.avgWeightDelta} format={formatSignedKg} />
            </Td>
          </Tr>
        ))}
      </tbody>
    </DataTable>
  );
}

/** Dashboard 4: replacements per report group. */
export function ReplacementOverviewTable({ caption, rows, rowLabel }: TableProps<ReplacementOverviewRow> & { rowLabel?: (key: string) => string }) {
  return (
    <DataTable caption={caption} hideCaption stickyHeader={false} density="dense">
      <thead>
        <tr>
          <Th className="align-bottom">Laporan</Th>
          <ColTh>SDM akan diganti</ColTh>
          <ColTh>Pengganti sudah ditempatkan</ColTh>
          <ColTh>Pengganti lulus training</ColTh>
          <ColTh>Lewat batas / OVERDUE</ColTh>
          <ColTh>Sudah dilaporkan ke OAO/Direksi</ColTh>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Tr key={r.key} className={totalRowClass(r.key)}>
            <RowTh>{rowLabel ? rowLabel(r.key) : r.key}</RowTh>
            <Td numeric>{r.toReplace}</Td>
            <Td numeric>{r.placed}</Td>
            <Td numeric>{r.passed}</Td>
            <Td numeric>
              <Flagged n={r.lateOrOverdue} tone="critical" />
            </Td>
            <Td numeric>{r.reported}</Td>
          </Tr>
        ))}
      </tbody>
    </DataTable>
  );
}
