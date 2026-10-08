"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { DataGrid, type CellValue, type GridColumn, type SaveRowResult } from "@/components/grid/DataGrid";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatDecimal } from "@/lib/format";
import type { ReplacementPass, ReplacementTimeliness } from "@/lib/rules";
import { saveReplacement } from "./actions";
import { isPlausibleDate } from "@/components/bmi/format";
import { ReplacementDeleteButton, type ReplacementContext, type ReplacementFormRow } from "./ReplacementDialogs";

export type ReplacementGridRow = ReplacementFormRow & {
  reportGroup: string | null;
  pass: ReplacementPass | null;
  timeliness: ReplacementTimeliness | null;
  /** "tautan ini, 8 Okt 07.55" or "pemilik / Google Sheet". */
  changed: string;
};

type ReplacementGridProps = {
  caption: string;
  rows: ReplacementGridRow[];
  ctx: ReplacementContext;
  summary: string;
  actions: ReactNode;
  phone: ReactNode;
};

const rowKey = (r: ReplacementGridRow) => String(r.id);
const rowLabel = (r: ReplacementGridRow) => `${r.replacedName}${r.station ? `, ${r.station}` : ""}`;
const SEARCH = {
  placeholder: "Nama atau ID SDM",
  text: (r: ReplacementGridRow) => `${r.replacedName} ${r.staffCode ?? ""} ${r.replacementName ?? ""}`,
};

/** Server field name (share_save_replacement DETAIL) → grid column key. */
/** Plain-language messages for share_save_replacement's invalid_input fields. */
const FIELD_MESSAGE: Record<string, string> = {
  station: "Pilih stasiun yang benar.",
  report_group: "Laporan tidak cocok dengan stasiun.",
  staff_code: "SDM ini bukan dari stasiun baris ini. Pilih SDM stasiun yang sama.",
  replaced_name: "Isi nama SDM yang diganti.",
  post_test: "Post-test harus 0 sampai 100.",
  practice_avg: "Rata-rata praktik harus 1 sampai 5.",
  reported: "Pilih Ya atau Belum.",
};

const COLUMN_OF_FIELD: Record<string, string> = {
  station: "station",
  report_group: "station",
  staff_code: "staff_code",
  replaced_name: "replaced_name",
  reason: "reason",
  replacement_name: "replacement_name",
  post_test: "post_test",
  practice_avg: "practice_avg",
  reported: "reported",
  notes: "notes",
};

function chip(value: CellValue) {
  return value ? <StatusChip label={String(value)} bordered /> : null;
}

const dateRule = (value: CellValue) =>
  typeof value === "string" && !isPlausibleDate(value) ? "Tanggal tidak valid." : null;

/** A score against its minimum in words as well as colour ("85, memenuhi"). */
function againstMinimum(value: CellValue, min: number, digits: number) {
  if (typeof value !== "number") return null;
  const ok = value >= min;
  return (
    <span className="flex items-baseline justify-end gap-1.5">
      <span className="tabular-nums">{formatDecimal(value, digits, 2)}</span>
      <span className={ok ? "text-xs font-semibold text-good" : "text-xs font-semibold text-critical"}>
        {ok ? "cukup" : "kurang"}
      </span>
    </span>
  );
}

/**
 * Penggantian SDM as the workbook sheet (docs/UX.md §2): one row per replacement, every input
 * inline, Status kelulusan and Ketepatan waktu computed read-only, "Hapus" per row. A row
 * saves itself through share_save_replacement, which writes every field, so the changed
 * cells are merged with the stored row. Client component.
 */
export function ReplacementGrid({ caption, rows, ctx, summary, actions, phone }: ReplacementGridProps) {
  const { accessKey, fixedStation, settings } = ctx;
  const staffKey = ctx.staff.map((s) => `${s.code}\u0001${s.name}\u0001${s.station ?? ""}`).join("\u0002");
  const stationsKey = ctx.stations.join(",");

  const columns = useMemo<GridColumn<ReplacementGridRow>[]>(() => {
    const entries = staffKey ? staffKey.split("\u0002").map((entry) => entry.split("\u0001")) : [];
    const staff = entries.map(([code, name]) => ({ value: code, label: `${code} ${name}` }));
    const stationOf = new Map(entries.map(([code, , station]) => [code, station]));
    const canPickStation = fixedStation === null;
    const minPost = formatDecimal(settings.posttestMin, 0, 2);
    const minAvg = formatDecimal(settings.passAvgMin, 2);
    return [
      {
        key: "replaced_name",
        header: "SDM diganti",
        width: 200,
        editor: "text",
        required: true,
        maxLength: 200,
        frozen: true,
        get: (r) => r.replacedName,
      },
      {
        key: "station",
        header: "Stasiun",
        group: "SDM diganti",
        width: 84,
        editor: "select",
        required: canPickStation,
        options: stationsKey.split(",").map((value) => ({ value })),
        editable: () => canPickStation,
      },
      {
        key: "staff_code",
        header: "ID SDM",
        label: "ID SDM yang diganti (dari Master SDM)",
        group: "SDM diganti",
        width: 104,
        editor: "select",
        options: staff,
        get: (r) => r.staffCode,
        validate: (value, row) => {
          if (typeof value !== "string" || !row.station) return null;
          const station = stationOf.get(value);
          return station && station !== row.station ? `Pilih SDM dari stasiun ${row.station}.` : null;
        },
        // The list shows "KNO-03 <nama>"; the cell only needs the ID (name is the first column).
        render: (value) => (value ? <span className="tabular-nums">{String(value)}</span> : null),
      },
      { key: "report_group", header: "Laporan", group: "SDM diganti", width: 96, editor: "readonly", get: (r) => r.reportGroup },
      { key: "reason", header: "Alasan", group: "SDM diganti", width: 220, editor: "longtext", maxLength: 4000 },
      {
        key: "withdrawn_on",
        header: "Tgl ditarik",
        group: "SDM diganti",
        width: 112,
        editor: "date",
        get: (r) => r.withdrawnOn,
        validate: dateRule,
      },
      {
        key: "replacement_name",
        header: "SDM pengganti",
        group: "Pengganti",
        width: 180,
        editor: "text",
        maxLength: 200,
        get: (r) => r.replacementName,
      },
      {
        key: "effective_on",
        header: "Tgl efektif",
        group: "Pengganti",
        width: 112,
        editor: "date",
        get: (r) => r.effectiveOn,
        validate: dateRule,
      },
      {
        key: "training_on",
        header: "Tgl training",
        group: "Pengganti",
        width: 112,
        editor: "date",
        get: (r) => r.trainingOn,
        validate: dateRule,
      },
      {
        key: "post_test",
        header: `Post-test (≥ ${minPost})`,
        label: `Post-test, syarat minimal ${minPost}`,
        group: "Pengganti",
        width: 128,
        editor: "number",
        min: 0,
        max: 100,
        decimals: 2,
        get: (r) => r.postTest,
        render: (value) => againstMinimum(value, settings.posttestMin, 0),
      },
      {
        key: "practice_avg",
        header: `Praktik (≥ ${minAvg})`,
        label: `Rata-rata praktik, syarat minimal ${minAvg}`,
        group: "Pengganti",
        width: 128,
        editor: "number",
        min: 1,
        max: 5,
        decimals: 2,
        get: (r) => r.practiceAvg,
        render: (value) => againstMinimum(value, settings.passAvgMin, 2),
      },
      { key: "pass", header: "Status kelulusan", group: "Pengganti", width: 184, editor: "readonly", get: (r) => r.pass, render: chip },
      {
        key: "timeliness",
        header: "Ketepatan waktu",
        group: "Pengganti",
        width: 132,
        editor: "readonly",
        get: (r) => r.timeliness,
        render: chip,
      },
      {
        key: "reported",
        header: "Dilaporkan",
        label: "Dilaporkan ke OAO/Direksi",
        group: "Pelaporan",
        width: 104,
        editor: "select",
        options: [{ value: "Ya" }, { value: "Belum" }],
        get: (r) => (r.reported === "Ya" || r.reported === "Belum" ? r.reported : null),
        render: chip,
      },
      { key: "notes", header: "Catatan", group: "Pelaporan", width: 220, editor: "longtext", maxLength: 4000 },
      {
        key: "changed",
        header: "Terakhir diubah lewat",
        width: 240,
        editor: "readonly",
        render: (_value, r) => <span className="text-xs text-ink-muted">{r.changed}</span>,
      },
    ];
  }, [staffKey, stationsKey, fixedStation, settings.posttestMin, settings.passAvgMin]);

  const rowActions = useMemo(
    () => ({
      header: "Aksi",
      width: 84,
      render: (row: ReplacementGridRow) => <ReplacementDeleteButton ctx={ctx} id={row.id} name={row.replacedName} />,
    }),
    [ctx],
  );

  const onSaveRow = useCallback(
    async (_key: string, changes: Record<string, CellValue>, row: ReplacementGridRow): Promise<SaveRowResult> => {
      const pick = <T,>(field: string, stored: T): T => (field in changes ? (changes[field] as T) : stored);
      const staffCode = pick<string | null>("staff_code", row.staffCode);
      let replacedName = pick<string | null>("replaced_name", row.replacedName);
      // Picking someone from the roster fills the name, as in the add form.
      if ("staff_code" in changes && !("replaced_name" in changes) && staffCode) {
        replacedName = ctx.staff.find((s) => s.code === staffCode)?.name ?? replacedName;
      }
      const reported = pick<string | null>("reported", row.reported);
      let result: Awaited<ReturnType<typeof saveReplacement>>;
      try {
        result = await saveReplacement(accessKey, {
          id: row.id,
          station: fixedStation ?? pick<string | null>("station", row.station),
          staffCode,
          replacedName,
          reason: pick<string | null>("reason", row.reason),
          withdrawnOn: pick<string | null>("withdrawn_on", row.withdrawnOn),
          replacementName: pick<string | null>("replacement_name", row.replacementName),
          effectiveOn: pick<string | null>("effective_on", row.effectiveOn),
          trainingOn: pick<string | null>("training_on", row.trainingOn),
          postTest: pick<number | null>("post_test", row.postTest),
          practiceAvg: pick<number | null>("practice_avg", row.practiceAvg),
          reported: reported === "Ya" || reported === "Belum" ? reported : null,
          notes: pick<string | null>("notes", row.notes),
        });
      } catch {
        return { ok: false, message: "Koneksi ke server terputus. Isian tetap ada; coba simpan lagi." };
      }
      if (result.ok) return { ok: true };
      const field = result.error.code === "invalid_input" ? result.error.field : undefined;
      const column = field ? COLUMN_OF_FIELD[field] : undefined;
      const text = (field && FIELD_MESSAGE[field]) || result.error.message;
      return { ok: false, message: text, fieldErrors: column ? { [column]: text } : undefined };
    },
    [accessKey, fixedStation, ctx.staff],
  );

  return (
    <DataGrid
      caption={caption}
      rows={rows}
      columns={columns}
      rowKey={rowKey}
      rowLabel={rowLabel}
      onSaveRow={onSaveRow}
      search={SEARCH}
      summary={summary}
      actions={actions}
      rowActions={rowActions}
      phone={phone}
    />
  );
}
