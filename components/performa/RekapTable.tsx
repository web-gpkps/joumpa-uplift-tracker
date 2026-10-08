import type { StaffRekap } from "@/lib/rules";
import { DataTable, DataTableEmpty, Td, Th } from "@/components/ui/DataTable";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatScore, formatSignedScore } from "@/lib/format";

export type RekapRow = {
  code: string;
  name: string;
  rekap: StaffRekap;
};

type RekapTableProps = {
  caption: string;
  rows: RekapRow[];
  weeks: number;
  /** Current programme week (column gets the --brand-tint the rail uses), or null outside the programme. */
  currentWeek: number | null;
};

/**
 * Rekap Performa: staff × Mg 1..N weekly averages, latest score, gain vs the training
 * baseline, weeks assessed, current status (criteria 6.2 with post-test) and trend.
 * Weeks without a score stay blank (never 0). Server component.
 */
export function RekapTable({ caption, rows, weeks, currentWeek }: RekapTableProps) {
  const weekNumbers = Array.from({ length: weeks }, (_, i) => i + 1);
  const columns = 2 + weeks + 5;
  const currentCell = "bg-brand-tint";

  return (
    <DataTable caption={caption} hideCaption density="dense" minWidth={`${44 + weeks * 4}rem`}>
      <thead>
        <tr>
          <Th>SDM</Th>
          <Th numeric>Baseline pelatihan</Th>
          {weekNumbers.map((w) => (
            <Th key={w} numeric className={w === currentWeek ? currentCell : undefined}>
              <span aria-hidden="true">Mg {w}</span>
              <span className="sr-only">
                Minggu ke-{w}
                {w === currentWeek ? ", minggu berjalan" : ""}
              </span>
            </Th>
          ))}
          <Th numeric>Skor terkini</Th>
          <Th numeric>Kenaikan vs baseline</Th>
          <Th numeric>Jml minggu dinilai</Th>
          <Th>Status terkini</Th>
          <Th>Tren</Th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <DataTableEmpty colSpan={columns} title="Belum ada SDM di lingkup ini">
            Tambahkan SDM di halaman SDM; rekap terisi setelah nilai mingguan mereka disimpan.
          </DataTableEmpty>
        ) : (
          rows.map(({ code, name, rekap }) => (
            <tr key={code}>
              <Th scope="row" className="sm:min-w-52">
                <span className="block font-semibold text-ink">{name}</span>
                <span className="block text-xs font-normal text-ink-muted tabular-nums">{code}</span>
              </Th>
              <Td numeric>{formatScore(rekap.baselineAvg)}</Td>
              {rekap.weekly.map((value, i) => (
                <Td key={i} numeric className={i + 1 === currentWeek ? currentCell : undefined}>
                  {formatScore(value)}
                </Td>
              ))}
              <Td numeric className="font-semibold">
                {formatScore(rekap.latest)}
              </Td>
              <Td numeric>{formatSignedScore(rekap.gain)}</Td>
              <Td numeric>{rekap.weeksAssessed}</Td>
              <Td>
                <StatusChip label={rekap.currentStatus} emptyLabel="Belum dinilai" />
              </Td>
              <Td>{rekap.trend ? <StatusChip label={rekap.trend} /> : null}</Td>
            </tr>
          ))
        )}
      </tbody>
    </DataTable>
  );
}
