"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import {
  DataGrid,
  type CellValue,
  type ConfirmClear,
  type GridColumn,
  type SaveRowResult,
} from "@/components/grid/DataGrid";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatTanggalPendek } from "@/lib/dates";
import { formatDecimal, formatSignedKg } from "@/lib/format";
import type { BmiCategory, HeightRequirement } from "@/lib/rules";
import { saveBmiCheck, saveBmiProfile, type BmiActionResult } from "./actions";
import { isPlausibleDate } from "./format";

export type BmiGridCheck = {
  date: string | null;
  tb: number;
  bb: number;
  bmi: number | null;
  category: BmiCategory | null;
};

export type BmiGridRow = {
  code: string;
  name: string;
  station: string | null;
  gender: string | null;
  bmiNote: string | null;
  /** index 0 = period 1; null when that period has no check. */
  checks: Array<BmiGridCheck | null>;
  weightDelta: number | null;
  /** Periods with a weight, so Δ berat is shown only from the second weighing. */
  weighings: number;
  heightRequirement: HeightRequirement | null;
  /** "Diubah lewat tautan ini, 8 Okt 07.55" for the latest change to this staff member's checks. */
  changed: string | null;
};

type BmiGridProps = {
  caption: string;
  rows: BmiGridRow[];
  accessKey: string;
  plannedDates: string[];
  /** Period whose column group is highlighted and scrolled into view. */
  period: number;
  /** Spoken after that group's header: "periode berjalan" or "periode yang dipilih". */
  periodNote: string;
  showStation: boolean;
  summary: string;
  emptyState: ReactNode;
  phone: ReactNode;
};

export function periodGroup(period: number, plannedDate: string): string {
  return `Cek ke-${period} (${formatTanggalPendek(plannedDate)})`;
}

const rowKey = (r: BmiGridRow) => r.code;
const rowLabel = (r: BmiGridRow) => `${r.code}, ${r.name}`;
const SEARCH = { placeholder: "Nama atau ID", text: (r: BmiGridRow) => `${r.code} ${r.name}` };

const FIELD_OF_ERROR: Record<string, string> = { height_cm: "tb", weight_kg: "bb", check_date: "tgl" };

function chip(value: CellValue) {
  return value ? <StatusChip label={String(value)} bordered /> : null;
}

function requirementCell(row: BmiGridRow) {
  if (row.heightRequirement === "Memenuhi" || row.heightRequirement === "Tidak Memenuhi") {
    return <StatusChip label={row.heightRequirement} bordered />;
  }
  // A missing height standard is explained once, under the grid.
  if (row.heightRequirement === null && row.checks.some(Boolean) && row.gender !== "L" && row.gender !== "P") {
    return <span className="text-ink-muted">isi L/P</span>;
  }
  return null;
}

/**
 * Cek BMI 2 Mingguan as the workbook sheet (docs/UX.md §2): one row per staff member, five
 * column groups "Cek ke-P (tanggal)" with Tgl / TB / BB (input) and BMI / Kategori (computed),
 * then L/P, Δ berat, Syarat tinggi and the programme note. Each row saves itself: one
 * share_save_check per changed period, one share_save_profile when L/P or the note changed.
 * Clearing TB and BB of a stored period asks first (the grid's confirmClear, one group per
 * period); "Batal" puts the values back. Client component.
 */
export function BmiGrid({
  caption,
  rows,
  accessKey,
  plannedDates,
  period,
  periodNote,
  showStation,
  summary,
  emptyState,
  phone,
}: BmiGridProps) {
  // A refresh sends a new array with the same dates: key the memo on the text so the
  // columns (and the grid's scroll position) stay put after every save.
  const datesKey = plannedDates.join(",");

  const columns = useMemo<GridColumn<BmiGridRow>[]>(() => {
    const dates = datesKey.split(",");
    const out: GridColumn<BmiGridRow>[] = [
      { key: "code", header: "ID", width: 84, editor: "readonly", frozen: true },
      { key: "name", header: "Nama", width: 188, editor: "readonly", frozen: true },
    ];
    if (showStation) out.push({ key: "station", header: "Stasiun", width: 72, editor: "readonly" });
    dates.forEach((planned, i) => {
      const p = i + 1;
      const group = periodGroup(p, planned);
      const check = (r: BmiGridRow) => r.checks[i];
      out.push(
        {
          key: `tgl_${p}`,
          header: "Tgl",
          label: `Tanggal cek ke-${p}`,
          group,
          width: 108,
          editor: "date",
          get: (r) => check(r)?.date ?? null,
          validate: (value) => (typeof value === "string" && !isPlausibleDate(value) ? "Tanggal tidak valid." : null),
        },
        {
          key: `tb_${p}`,
          header: "TB",
          label: `Tinggi badan cek ke-${p} (cm)`,
          group,
          width: 72,
          editor: "number",
          min: 120,
          max: 210,
          decimals: 1,
          get: (r) => check(r)?.tb ?? null,
        },
        {
          key: `bb_${p}`,
          header: "BB",
          label: `Berat badan cek ke-${p} (kg)`,
          group,
          width: 72,
          editor: "number",
          min: 30,
          max: 200,
          decimals: 1,
          get: (r) => check(r)?.bb ?? null,
        },
        {
          key: `bmi_${p}`,
          header: "BMI",
          label: `BMI cek ke-${p}`,
          group,
          width: 64,
          editor: "readonly",
          align: "end",
          get: (r) => check(r)?.bmi ?? null,
          render: (value) => (typeof value === "number" ? formatDecimal(value, 1) : null),
        },
        {
          key: `kat_${p}`,
          header: "Kategori",
          label: `Kategori BMI cek ke-${p}`,
          group,
          width: 118,
          editor: "readonly",
          get: (r) => check(r)?.category ?? null,
          render: chip,
        },
      );
    });
    out.push(
      {
        key: "gender",
        header: "L/P",
        group: "Profil",
        width: 64,
        editor: "select",
        options: [{ value: "L" }, { value: "P" }],
        get: (r) => (r.gender === "L" || r.gender === "P" ? r.gender : null),
      },
      {
        key: "delta",
        header: "Δ berat",
        label: "Perubahan berat sejak cek pertama",
        group: "Profil",
        width: 88,
        editor: "readonly",
        align: "end",
        get: (r) => (r.weighings >= 2 ? r.weightDelta : null),
        render: (value) => (typeof value === "number" ? formatSignedKg(value) : null),
      },
      {
        key: "syarat",
        header: "Syarat tinggi",
        label: "Syarat tinggi badan",
        group: "Profil",
        width: 136,
        editor: "readonly",
        get: (r) => r.heightRequirement,
        render: (_value, r) => requirementCell(r),
      },
      {
        key: "bmi_note",
        header: "Catatan program BB",
        label: "Catatan / program penyesuaian BB",
        group: "Profil",
        width: 240,
        editor: "longtext",
        maxLength: 2000,
        get: (r) => r.bmiNote,
      },
      {
        key: "changed",
        header: "Terakhir diubah lewat",
        width: 240,
        editor: "readonly",
        render: (_value, r) => (r.changed ? <span className="text-xs text-ink-muted">{r.changed}</span> : null),
      },
    );
    return out;
  }, [datesKey, showStation]);

  const confirmClear = useMemo<ConfirmClear<BmiGridRow>>(
    () => ({
      groups: datesKey.split(",").map((_, i) => ({ fields: [`tb_${i + 1}`, `bb_${i + 1}`], label: `ke-${i + 1}` })),
      message: (row, labels) => `Hapus cek BMI ${labels.join(" dan ")} untuk ${row.name}?`,
      description: "TB dan BB periode itu dikosongkan, jadi cek tersebut dihapus. Periode lain tidak berubah.",
      confirmLabel: (labels) => `Hapus cek ${labels.join(" dan ")}`,
    }),
    [datesKey],
  );

  const onSaveRow = useCallback(
    async (_key: string, changes: Record<string, CellValue>, row: BmiGridRow): Promise<SaveRowResult> => {
      const has = (field: string) => field in changes;
      const fieldErrors: Record<string, string> = {};
      const writes: Array<{ period: number; checkDate: string | null; heightCm: number | null; weightKg: number | null }> = [];

      datesKey.split(",").forEach((planned, i) => {
        const p = i + 1;
        if (!has(`tgl_${p}`) && !has(`tb_${p}`) && !has(`bb_${p}`)) return;
        const stored = row.checks[i];
        const tb = has(`tb_${p}`) ? (changes[`tb_${p}`] as number | null) : (stored?.tb ?? null);
        const bb = has(`bb_${p}`) ? (changes[`bb_${p}`] as number | null) : (stored?.bb ?? null);
        const date = has(`tgl_${p}`) ? (changes[`tgl_${p}`] as string | null) : (stored?.date ?? null);
        if (tb === null && bb === null) {
          // Only reached for a stored check after the grid's delete confirmation.
          if (stored) writes.push({ period: p, checkDate: null, heightCm: null, weightKg: null });
          else fieldErrors[`tb_${p}`] = "Isi TB dan BB untuk menyimpan cek ini.";
          return;
        }
        if (tb === null) {
          fieldErrors[`tb_${p}`] = stored ? "Isi TB juga, atau kosongkan TB dan BB untuk menghapus cek." : "Isi TB juga.";
          return;
        }
        if (bb === null) {
          fieldErrors[`bb_${p}`] = stored ? "Isi BB juga, atau kosongkan TB dan BB untuk menghapus cek." : "Isi BB juga.";
          return;
        }
        // A new check without a typed date takes the planned date of its period.
        writes.push({ period: p, checkDate: date ?? planned, heightCm: tb, weightKg: bb });
      });

      const outcome: { failure: string | null } = { failure: null };
      const run = async (call: () => Promise<BmiActionResult>, fieldFor: (serverField?: string) => string | null) => {
        let result: BmiActionResult;
        try {
          result = await call();
        } catch {
          outcome.failure = "Koneksi ke server terputus. Isian tetap ada; coba simpan lagi.";
          return;
        }
        if (result.ok) return;
        outcome.failure = result.error.message;
        const field = fieldFor(result.error.field);
        if (field) fieldErrors[field] = result.error.message;
      };

      for (const w of writes) {
        await run(
          () => saveBmiCheck(accessKey, { staffCode: row.code, ...w }),
          (serverField) => (serverField && FIELD_OF_ERROR[serverField] ? `${FIELD_OF_ERROR[serverField]}_${w.period}` : null),
        );
      }
      if (has("gender") || has("bmi_note")) {
        const gender = has("gender") ? changes.gender : row.gender;
        const note = has("bmi_note") ? changes.bmi_note : row.bmiNote;
        await run(
          () =>
            saveBmiProfile(accessKey, {
              staffCode: row.code,
              gender: gender === "L" || gender === "P" ? gender : null,
              bmiNote: typeof note === "string" && note.trim() !== "" ? note : null,
            }),
          (serverField) => (serverField === "gender" || serverField === "bmi_note" ? serverField : null),
        );
      }

      if (!outcome.failure && Object.keys(fieldErrors).length === 0) return { ok: true };
      return {
        ok: false,
        message: outcome.failure ?? "Periksa sel yang ditandai.",
        fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
      };
    },
    [accessKey, datesKey],
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
      confirmClear={confirmClear}
      highlightGroup={periodGroup(period, plannedDates[period - 1])}
      highlightNote={periodNote}
      emptyState={emptyState}
      phone={phone}
    />
  );
}
