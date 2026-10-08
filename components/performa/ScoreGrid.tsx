"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { deltaVsBaseline, practiceAvg, weeklyStatus, type Settings } from "@/lib/rules";
import { formatScore, formatSignedScore } from "@/lib/format";
import { StatusChip } from "@/components/ui/StatusChip";
import { DataGrid, type CellValue, type GridColumn, type SaveRowResult } from "@/components/grid/DataGrid";
import { ASPECTS } from "./format";
import type { SaveScoreAction } from "./ScoreRow";

/** One staff member's Log Performa row for the selected week (column keys = RPC field names). */
export type ScoreGridRow = {
  code: string;
  name: string;
  assignmentStatus: string;
  /** Training baseline average (Master SDM P), for Δ vs baseline. */
  baselineAvg: number | null;
  score_a: number | null;
  score_b: number | null;
  score_c: number | null;
  score_d: number | null;
  score_e: number | null;
  score_f: number | null;
  observer: string | null;
  coaching_notes: string | null;
  /** "Diubah lewat tautan ini, 8 Okt 07.55"; null when there is no row this week. */
  changedLabel: string | null;
};

const SCORE_KEYS = ["score_a", "score_b", "score_c", "score_d", "score_e", "score_f"] as const;
const INPUT_KEYS = [...SCORE_KEYS, "observer", "coaching_notes"];

const rowKey = (r: ScoreGridRow) => r.code;
const rowLabel = (r: ScoreGridRow) => `${r.code}, ${r.name}`;
const SEARCH = { placeholder: "Nama atau ID", text: (r: ScoreGridRow) => `${r.code} ${r.name}` };

function numberOrNull(value: CellValue): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function textOrEmpty(value: CellValue): string {
  return typeof value === "string" ? value : "";
}

type ScoreGridProps = {
  caption: string;
  rows: ScoreGridRow[];
  week: number;
  settings: Settings;
  accessKey: string;
  saveAction: SaveScoreAction;
  /** Week picker and station filter (server-rendered links). */
  toolbar: ReactNode;
  /** "12 dari 27 SDM sudah dinilai". */
  summary: ReactNode;
  emptyState: ReactNode;
  /** The card flow for phones (< 900 px). */
  phone: ReactNode;
};

/**
 * Log Performa Mingguan as a spreadsheet (docs/UX.md §2): A to F are single-key score
 * cells (a digit commits and moves right), Rata-rata / Status / Δ follow the typed scores
 * live, Pengamat and Catatan coaching are text. Each row saves itself through
 * share_save_weekly_score; clearing every input of a saved row deletes it after a
 * confirmation. Remount it per week and station (key) so pending edits never cross weeks.
 */
export function ScoreGrid({ caption, rows, week, settings, accessKey, saveAction, toolbar, summary, emptyState, phone }: ScoreGridProps) {
  const columns = useMemo<GridColumn<ScoreGridRow>[]>(() => {
    const avgOf = (value: (key: string) => CellValue) => practiceAvg(SCORE_KEYS.map((k) => numberOrNull(value(k))));
    return [
      { key: "code", header: "ID", width: 84, editor: "readonly", frozen: true },
      {
        key: "name",
        header: "Nama",
        width: 196,
        editor: "readonly",
        frozen: true,
        render: (value, row) =>
          row.assignmentStatus && row.assignmentStatus !== "Aktif" ? (
            <span className="flex items-center gap-1.5">
              <span className="truncate">{value}</span>
              <StatusChip label={row.assignmentStatus} bordered />
            </span>
          ) : (
            value
          ),
      },
      ...ASPECTS.map(
        (a, i): GridColumn<ScoreGridRow> => ({
          key: SCORE_KEYS[i],
          header: `${a.letter} ${a.name}`,
          label: `${a.letter} ${a.name}`,
          group: "Nilai praktik (1 sampai 5)",
          width: a.letter === "F" ? 100 : 88,
          editor: "score",
          advance: true,
        }),
      ),
      {
        key: "avg",
        header: "Rata-rata",
        group: "Hasil minggu ini",
        width: 80,
        editor: "readonly",
        align: "end",
        derive: (_row, value) => avgOf(value),
        render: (value) => <span className="font-semibold">{formatScore(numberOrNull(value))}</span>,
      },
      {
        key: "status",
        header: "Status",
        group: "Hasil minggu ini",
        width: 136,
        editor: "readonly",
        derive: (_row, value) => weeklyStatus(avgOf(value), settings),
        render: (value) => <StatusChip label={value ? String(value) : null} emptyLabel="Belum dinilai" bordered />,
      },
      {
        key: "delta",
        header: "Δ baseline",
        label: "Selisih dengan baseline pelatihan",
        group: "Hasil minggu ini",
        width: 88,
        editor: "readonly",
        align: "end",
        derive: (row, value) => deltaVsBaseline(avgOf(value), row.baselineAvg),
        render: (value) => formatSignedScore(numberOrNull(value)),
      },
      { key: "observer", header: "Pengamat", width: 160, editor: "text", maxLength: 200 },
      { key: "coaching_notes", header: "Catatan coaching", width: 240, editor: "longtext", maxLength: 4000 },
      { key: "changed", header: "Terakhir diubah", width: 232, editor: "readonly", get: (r) => r.changedLabel },
    ];
  }, [settings]);

  const confirmClear = useMemo(
    () => ({
      fields: INPUT_KEYS,
      message: (r: ScoreGridRow) => `Hapus nilai Minggu ke-${week} untuk ${r.name}?`,
      confirmLabel: "Hapus nilai",
    }),
    [week],
  );

  const onSaveRow = useCallback(
    async (_key: string, changes: Record<string, CellValue>, row: ScoreGridRow): Promise<SaveRowResult> => {
      const pick = (field: string): CellValue => (field in changes ? changes[field] : row[field as keyof ScoreGridRow] as CellValue);
      const result = await saveAction(accessKey, {
        staffCode: row.code,
        week,
        scores: SCORE_KEYS.map((k) => numberOrNull(pick(k))),
        observer: textOrEmpty(pick("observer")),
        coachingNotes: textOrEmpty(pick("coaching_notes")),
      });
      if (result.ok) return { ok: true };
      return {
        ok: false,
        message: result.error.message,
        fieldErrors: result.error.field ? { [result.error.field]: result.error.message } : undefined,
      };
    },
    [accessKey, saveAction, week],
  );

  return (
    <DataGrid
      caption={caption}
      rows={rows}
      columns={columns}
      rowKey={rowKey}
      rowLabel={rowLabel}
      onSaveRow={onSaveRow}
      confirmClear={confirmClear}
      search={SEARCH}
      toolbar={toolbar}
      summary={summary}
      emptyState={emptyState}
      phone={phone}
    />
  );
}
