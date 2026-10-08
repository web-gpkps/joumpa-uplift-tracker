"use client";

import { useCallback, useMemo, useState } from "react";
import type { Settings } from "@/lib/rules";
import { formatScore } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { DataGrid, type CellValue, type GridColumn, type SaveRowResult } from "@/components/grid/DataGrid";
import { ASPECTS } from "@/components/performa/format";
import { StaffDialog } from "./StaffDialog";
import { StaffCards } from "./StaffCards";
import { DeleteStaffDialog } from "./DeleteStaffDialog";
import {
  ASSIGNMENT_STATUSES,
  REPORT_CONCLUSIONS,
  type DeleteStaffAction,
  type SaveGenderAction,
  type SaveStaffAction,
  type SdmRow,
} from "./types";

type StaffGridProps = {
  caption: string;
  rows: SdmRow[];
  emptyTitle: string;
  emptyHint: string;
  accessKey: string;
  isKps: boolean;
  ownStation: string | null;
  stations: string[];
  settings: Settings;
  saveAction: SaveStaffAction;
  saveGenderAction: SaveGenderAction;
  /** Owner only (access.kind === "owner"): the "Hapus" row action. The action re-checks it. */
  canDelete: boolean;
  deleteAction: DeleteStaffAction;
};

/** Training-baseline fields: KPS links and the owner only (share_kps_save_staff_baseline). */
const BASELINE = ["pre_test", "post_test", "score_a", "score_b", "score_c", "score_d", "score_e", "score_f", "report_conclusion"];
const SCORE_KEYS = ["score_a", "score_b", "score_c", "score_d", "score_e", "score_f"] as const;

const rowKey = (r: SdmRow) => r.code;
const rowLabel = (r: SdmRow) => `${r.code}, ${r.name}`;
const SEARCH = { placeholder: "Nama atau ID", text: (r: SdmRow) => `${r.code} ${r.name} ${r.nipp ?? ""}` };

function chip(value: CellValue) {
  return value ? <StatusChip label={String(value)} bordered /> : null;
}

/**
 * Master SDM as a spreadsheet (docs/UX.md §2): profile cells for every link, training
 * baseline cells for KPS and the owner, computed 6.2 status and consistency read-only.
 * Each row saves itself through saveStaff. "Ubah" opens the full form. Under 900 px the
 * existing table with its edit dialog is shown instead. Client component.
 */
export function StaffGrid(props: StaffGridProps) {
  const { rows, isKps, accessKey, saveAction } = props;
  const [editing, setEditing] = useState<SdmRow | null>(null);
  const [openCount, setOpenCount] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [deleting, setDeleting] = useState<SdmRow | null>(null);
  const { canDelete } = props;

  const openEdit = useCallback((row: SdmRow) => {
    setEditing(row);
    setOpenCount((n) => n + 1);
    setDialogOpen(true);
  }, []);

  const columns = useMemo<GridColumn<SdmRow>[]>(() => {
    const kpsOnly = () => isKps;
    return [
      { key: "code", header: "ID", width: 84, editor: "readonly", frozen: true },
      { key: "name", header: "Nama", width: 200, editor: "text", required: true, maxLength: 200, frozen: true },
      { key: "station", header: "Stasiun", width: 76, editor: "readonly" },
      {
        key: "nipp",
        header: "NIPP",
        width: 112,
        editor: "text",
        maxLength: 50,
        render: (value, row) =>
          row.duplicateNippWith.length > 0 ? (
            <span className="flex items-center gap-1.5">
              <span className="tabular-nums">{value}</span>
              <StatusChip tone="warning" label="ganda" bordered />
            </span>
          ) : (
            <span className="tabular-nums">{value}</span>
          ),
      },
      {
        key: "gender",
        header: "L/P",
        width: 64,
        editor: "select",
        options: [{ value: "L" }, { value: "P" }],
      },
      { key: "pre_test", header: "Pre-test", width: 80, editor: "number", min: 0, max: 100, decimals: 2, get: (r) => r.preTest, editable: kpsOnly },
      { key: "post_test", header: "Post-test", width: 84, editor: "number", min: 0, max: 100, decimals: 2, get: (r) => r.postTest, editable: kpsOnly },
      ...ASPECTS.map((a, i): GridColumn<SdmRow> => ({
        key: SCORE_KEYS[i],
        header: a.letter,
        label: `${a.letter} ${a.name}`,
        group: "Nilai pelatihan A sampai F",
        width: 44,
        editor: "score",
        get: (r) => r.scores[i],
        editable: kpsOnly,
      })),
      {
        key: "practice_avg",
        header: "Rata-rata",
        width: 84,
        editor: "readonly",
        align: "end",
        get: (r) => r.practiceAvg,
        render: (value) => <span className="font-semibold">{formatScore(value as number | null)}</span>,
      },
      {
        key: "report_conclusion",
        header: "Kesimpulan laporan",
        width: 168,
        editor: "select",
        options: REPORT_CONCLUSIONS.map((value) => ({ value })),
        get: (r) => r.reportConclusion,
        editable: kpsOnly,
        render: chip,
      },
      { key: "criteria", header: "Status 6.2", width: 128, editor: "readonly", get: (r) => r.criteriaStatus, render: chip },
      { key: "consistency", header: "Konsistensi", width: 140, editor: "readonly", get: (r) => r.consistency, render: chip },
      {
        key: "assignment_status",
        header: "Status penugasan",
        width: 156,
        editor: "select",
        required: true,
        options: ASSIGNMENT_STATUSES.map((value) => ({ value })),
        get: (r) => r.assignmentStatus,
        render: chip,
      },
      { key: "notes", header: "Catatan", width: 220, editor: "longtext", maxLength: 4000 },
    ];
  }, [isKps]);

  const rowActions = useMemo(
    () => ({
      header: "Aksi",
      width: canDelete ? 156 : 84,
      render: (row: SdmRow) => (
        <>
          <Button size="sm" variant="secondary" tabIndex={-1} onClick={() => openEdit(row)}>
            Ubah<span className="sr-only"> data {row.name}</span>
          </Button>
          {canDelete ? (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setDeleting(row)}
              className="inline-flex min-h-8 items-center rounded-control px-2 text-xs font-semibold text-critical transition-colors duration-150 hover:bg-critical-tint"
            >
              Hapus<span className="sr-only"> SDM {row.name}</span>
            </button>
          ) : null}
        </>
      ),
    }),
    [canDelete, openEdit],
  );

  const onSaveRow = useCallback(
    async (_key: string, changes: Record<string, CellValue>, row: SdmRow): Promise<SaveRowResult> => {
      const pick = <T,>(field: string, fallback: T): T => (field in changes ? (changes[field] as T) : fallback);
      const baselineChanged = BASELINE.some((field) => field in changes);
      const gender = pick<string | null>("gender", row.gender);
      const result = await saveAction(accessKey, {
        code: row.code,
        station: null,
        name: pick<string>("name", row.name),
        nipp: pick<string | null>("nipp", row.nipp) ?? "",
        gender: gender === "L" || gender === "P" ? gender : null,
        assignmentStatus: pick<string>("assignment_status", row.assignmentStatus),
        notes: pick<string | null>("notes", row.notes) ?? "",
        baseline: baselineChanged
          ? {
              preTest: pick<number | null>("pre_test", row.preTest),
              postTest: pick<number | null>("post_test", row.postTest),
              scores: SCORE_KEYS.map((field, i) => pick<number | null>(field, row.scores[i])),
              reportConclusion: pick<string | null>("report_conclusion", row.reportConclusion),
            }
          : null,
      });
      if (result.ok) return { ok: true };
      const text = result.saved
        ? `Profil tersimpan, data pelatihan gagal: ${result.error.message}`
        : result.error.message;
      return {
        ok: false,
        message: text,
        fieldErrors: result.error.field ? { [result.error.field]: result.error.message } : undefined,
      };
    },
    [accessKey, saveAction],
  );

  const assessed = rows.filter((r) => r.practiceAvg !== null).length;

  return (
    <div className="flex flex-col gap-3 px-4 pb-4 sm:px-6 sm:pb-6">
      <div role="status" aria-live="polite">
        {message ? <p className="text-sm font-semibold text-good">{message}</p> : null}
      </div>
      <DataGrid
        caption={props.caption}
        rows={rows}
        columns={columns}
        rowKey={rowKey}
        rowLabel={rowLabel}
        onSaveRow={onSaveRow}
        search={SEARCH}
        summary={`${rows.length} SDM · ${assessed} punya nilai pelatihan`}
        rowActions={rowActions}
        emptyState={
          <>
            <p className="text-sm font-semibold text-ink">{props.emptyTitle}</p>
            <p className="mt-1 text-sm text-ink-muted">{props.emptyHint}</p>
          </>
        }
        phone={
          <StaffCards
            rows={rows}
            emptyTitle={props.emptyTitle}
            emptyHint={props.emptyHint}
            accessKey={accessKey}
            saveGenderAction={props.saveGenderAction}
            onEdit={openEdit}
            onDelete={canDelete ? setDeleting : undefined}
          />
        }
      />
      <StaffDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        row={editing}
        formKey={`${editing?.code ?? "baru"}-${openCount}`}
        accessKey={accessKey}
        isKps={isKps}
        ownStation={props.ownStation}
        stations={props.stations}
        settings={props.settings}
        saveAction={saveAction}
        onSaved={setMessage}
        onDelete={canDelete ? setDeleting : undefined}
      />
      {canDelete ? (
        <DeleteStaffDialog
          row={deleting}
          onClose={() => setDeleting(null)}
          accessKey={accessKey}
          deleteAction={props.deleteAction}
          onDeleted={setMessage}
        />
      ) : null}
    </div>
  );
}
