"use client";

import { useState } from "react";
import { formatDecimal, formatScore } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { SaveStatus, type SaveState } from "@/components/ui/SaveStatus";
import { StatusChip } from "@/components/ui/StatusChip";
import type { SaveGenderAction, SdmRow } from "./types";

type StaffCardsProps = {
  rows: SdmRow[];
  emptyTitle: string;
  emptyHint: string;
  accessKey: string;
  saveGenderAction: SaveGenderAction;
  onEdit: (row: SdmRow) => void;
  /** Owner only: opens the delete confirmation. */
  onDelete?: (row: SdmRow) => void;
};

/**
 * Master SDM on phones (< 900 px): one card per staff member with what decides "is this
 * record right": flags first, the key fields, L/P as a select that saves on change (the
 * bulk gap), and "Ubah data" for the full form. Client component.
 */
export function StaffCards({ rows, emptyTitle, emptyHint, accessKey, saveGenderAction, onEdit, onDelete }: StaffCardsProps) {
  if (rows.length === 0) {
    return (
      <div className="py-6">
        <p className="text-sm font-semibold text-ink">{emptyTitle}</p>
        <p className="mt-1 text-sm text-ink-muted">{emptyHint}</p>
      </div>
    );
  }
  return (
    <ul className="-mx-4 border-t border-line sm:-mx-6">
      {rows.map((row) => (
        <li key={row.code} className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-ink">{row.name}</h3>
              <p className="text-xs text-ink-muted tabular-nums">
                {row.code} · Stasiun {row.station}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {row.criteriaStatus ? <StatusChip label={row.criteriaStatus} bordered /> : null}
              {row.consistency === "Beda – verifikasi" ? <StatusChip label={row.consistency} bordered /> : null}
              {row.assignmentStatus !== "Aktif" ? <StatusChip label={row.assignmentStatus} bordered /> : null}
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className="section-label">NIPP</dt>
              <dd className="flex flex-wrap items-center gap-1.5">
                {row.nipp ? <span className="tabular-nums">{row.nipp}</span> : <span className="text-ink-muted">Belum diisi</span>}
                {row.duplicateNippWith.length > 0 ? <StatusChip tone="warning" label="NIPP ganda" bordered /> : null}
              </dd>
            </div>
            <div>
              <dt className="section-label">Rata-rata praktik</dt>
              <dd className="font-semibold tabular-nums">{formatScore(row.practiceAvg) || "Belum ada"}</dd>
            </div>
            <div>
              <dt className="section-label">Pre / post-test</dt>
              <dd className="tabular-nums">
                {row.preTest === null && row.postTest === null
                  ? "Belum ada"
                  : `${formatDecimal(row.preTest, 0, 2) || "kosong"} / ${formatDecimal(row.postTest, 0, 2) || "kosong"}`}
              </dd>
            </div>
            <div>
              <dt className="section-label">Kesimpulan laporan</dt>
              <dd>{row.reportConclusion ?? <span className="text-ink-muted">Belum diisi</span>}</dd>
            </div>
          </dl>

          {row.duplicateNippWith.length > 0 ? (
            <p className="text-xs text-warning">NIPP sama dengan {row.duplicateNippWith.join(", ")}.</p>
          ) : null}
          {row.notes ? <p className="text-xs text-ink-muted">Catatan: {row.notes}</p> : null}

          <GenderSelect row={row} accessKey={accessKey} saveGenderAction={saveGenderAction} />

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => onEdit(row)}>
              Ubah data<span className="sr-only"> {row.name}</span>
            </Button>
            {onDelete ? (
              <button
                type="button"
                onClick={() => onDelete(row)}
                className="inline-flex min-h-11 items-center rounded-control px-3 text-sm font-semibold text-critical transition-colors duration-150 hover:bg-critical-tint"
              >
                Hapus SDM<span className="sr-only"> {row.name}</span>
              </button>
            ) : null}
          </div>
          <p className="text-xs text-ink-muted">{row.changedLabel}</p>
        </li>
      ))}
    </ul>
  );
}

/** L/P select that saves on change (only L/P changes; the rest is sent as shown). */
function GenderSelect({ row, accessKey, saveGenderAction }: { row: SdmRow; accessKey: string; saveGenderAction: SaveGenderAction }) {
  const [value, setValue] = useState(row.gender ?? "");
  const [state, setState] = useState<SaveState>({ status: "idle" });
  const [prevGender, setPrevGender] = useState(row.gender);

  // Changed elsewhere (edit dialog, another link) and refreshed: show the stored value.
  if (prevGender !== row.gender) {
    setPrevGender(row.gender);
    if (state.status !== "saving") setValue(row.gender ?? "");
  }

  async function change(next: string) {
    const previous = value;
    setValue(next);
    setState({ status: "saving" });
    try {
      const result = await saveGenderAction(
        accessKey,
        { code: row.code, name: row.name, nipp: row.nipp, assignmentStatus: row.assignmentStatus, notes: row.notes },
        next === "L" || next === "P" ? next : null,
      );
      if (result.ok) {
        setState({ status: "saved", at: result.savedAt });
      } else {
        setValue(previous);
        setState({ status: "error", message: result.error.message });
      }
    } catch {
      setValue(previous);
      setState({ status: "error", message: "koneksi ke server terputus. Pilih lagi." });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <label className="flex items-center gap-2 text-sm font-semibold text-ink">
        L/P
        <span className="w-44">
          <Select aria-label={`L/P ${row.name}`} value={value} onChange={(event) => void change(event.target.value)}>
            <option value="">Belum diisi</option>
            <option value="L">L (laki-laki)</option>
            <option value="P">P (perempuan)</option>
          </Select>
        </span>
      </label>
      <SaveStatus state={state} />
    </div>
  );
}
