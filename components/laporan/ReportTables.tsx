/*
 * Laporan Mingguan sections A, C and the table of D, with the workbook's columns.
 * Section B is Dashboard section 1 (ActionProgressTable). Rows come from lib/aggregate
 * weeklyReport(); nothing is recomputed here.
 */
import type { BmiPeriodRow, TrendRow, WeeklyPerformanceRow } from "@/lib/aggregate";
import { DataTable, Td, Th, Tr } from "@/components/ui/DataTable";
import { ColTh, RowTh, totalRowClass } from "@/components/ringkasan/DashboardTables";
import { formatRatio, formatScore, formatSignedScore } from "@/lib/format";
import { Value } from "@/components/ringkasan/format";

export function WeeklyPerformanceTable({ caption, rows }: { caption: string; rows: WeeklyPerformanceRow[] }) {
  return (
    <DataTable caption={caption} hideCaption stickyHeader={false} density="dense">
      <thead>
        <tr>
          <Th className="align-bottom">Stasiun</Th>
          <ColTh>Jumlah SDM</ColTh>
          <ColTh>Dinilai minggu ini</ColTh>
          <ColTh>Rata-rata minggu ini</ColTh>
          <ColTh>Rata-rata minggu lalu</ColTh>
          <ColTh>Perubahan vs minggu lalu</ColTh>
          <ColTh>Rata-rata baseline training</ColTh>
          <ColTh>Kenaikan vs baseline*</ColTh>
          <ColTh>Sesuai</ColTh>
          <ColTh>Perlu Perbaikan</ColTh>
          <ColTh>Tidak Sesuai</ColTh>
          <ColTh>% Sesuai</ColTh>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Tr key={r.key} className={totalRowClass(r.key)}>
            <RowTh>{r.key}</RowTh>
            <Td numeric>{r.staffCount}</Td>
            <Td numeric>{r.assessed}</Td>
            <Td numeric>
              <Value value={r.avgThisWeek} format={formatScore} />
            </Td>
            <Td numeric>
              <Value value={r.avgLastWeek} format={formatScore} />
            </Td>
            <Td numeric>
              <Value value={r.changeVsLastWeek} format={formatSignedScore} />
            </Td>
            <Td numeric>
              <Value value={r.baselineAvg} format={formatScore} />
            </Td>
            <Td numeric>
              <Value value={r.gainVsBaseline} format={formatSignedScore} />
            </Td>
            <Td numeric>{r.sesuai}</Td>
            <Td numeric>{r.perlu}</Td>
            <Td numeric>{r.tidak}</Td>
            <Td numeric>
              <Value value={r.pctSesuai} format={formatRatio} />
            </Td>
          </Tr>
        ))}
      </tbody>
    </DataTable>
  );
}

export function BmiPeriodTable({ caption, rows }: { caption: string; rows: BmiPeriodRow[] }) {
  return (
    <DataTable caption={caption} hideCaption stickyHeader={false} density="dense">
      <thead>
        <tr>
          <Th className="align-bottom">Stasiun</Th>
          <ColTh>Jumlah SDM</ColTh>
          <ColTh>Sudah dicek</ColTh>
          <ColTh>Belum dicek</ColTh>
          <ColTh>Normal</ColTh>
          <ColTh>Kurus</ColTh>
          <ColTh>Overweight</ColTh>
          <ColTh>Obesitas</ColTh>
          <ColTh>% Normal</ColTh>
          <ColTh>Tinggi tidak memenuhi (cek terakhir)</ColTh>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Tr key={r.key} className={totalRowClass(r.key)}>
            <RowTh>{r.key}</RowTh>
            <Td numeric>{r.staffCount}</Td>
            <Td numeric>{r.checked}</Td>
            <Td numeric>{r.notChecked}</Td>
            <Td numeric>{r.normal}</Td>
            <Td numeric>{r.kurus}</Td>
            <Td numeric>{r.overweight}</Td>
            <Td numeric>{r.obesitas}</Td>
            <Td numeric>
              <Value value={r.pctNormal} format={formatRatio} />
            </Td>
            <Td numeric>{r.heightNotMet}</Td>
          </Tr>
        ))}
      </tbody>
    </DataTable>
  );
}

export function TrendTable({ caption, rows, selectedWeek }: { caption: string; rows: TrendRow[]; selectedWeek: number }) {
  const weeks = rows[0]?.weeks.length ?? 0;
  return (
    <DataTable caption={caption} hideCaption stickyHeader={false} density="dense">
      <thead>
        <tr>
          <Th className="align-bottom">Stasiun</Th>
          {Array.from({ length: weeks }, (_, i) => (
            <Th key={i} numeric className={i + 1 === selectedWeek ? "text-ink" : undefined}>
              Mg {i + 1}
            </Th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Tr key={r.key} className={totalRowClass(r.key)}>
            <RowTh>{r.key}</RowTh>
            {r.weeks.map((v, i) => (
              <Td key={i} numeric>
                <Value value={v} format={formatScore} />
              </Td>
            ))}
          </Tr>
        ))}
      </tbody>
    </DataTable>
  );
}
