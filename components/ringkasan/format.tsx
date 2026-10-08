/*
 * Table cell display for Ringkasan and Laporan. Number formats live in lib/format
 * (Indonesian decimal comma, as the workbook prints them).
 */
import { formatTanggal } from "@/lib/dates";

/** A table cell value, or a muted dash that screen readers hear as "kosong". */
export function Value({
  value,
  format = String,
}: {
  value: number | null | undefined;
  format?: (v: number) => string;
}) {
  if (value === null || value === undefined) {
    return (
      <>
        <span aria-hidden="true" className="text-ink-muted">
          –
        </span>
        <span className="sr-only">kosong</span>
      </>
    );
  }
  return <>{format(value)}</>;
}

/** "8 Okt 2026" in a <time>. */
export function Tanggal({ date }: { date: string }) {
  return <time dateTime={date}>{formatTanggal(date)}</time>;
}
