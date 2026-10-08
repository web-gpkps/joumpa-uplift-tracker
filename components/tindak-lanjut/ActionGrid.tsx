"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { DataGrid, type CellValue, type GridColumn, type SaveRowResult } from "@/components/grid/DataGrid";
import { formatTanggal } from "@/lib/dates";
import { actionDaysLeft, actionFlag, effectiveDueDate, type Settings } from "@/lib/rules";
import { saveActionDefinition, saveActionProgress } from "./actions";
import { ActionItemDialog } from "./ActionItemDialog";
import { DeleteActionItemDialog } from "./DeleteActionItemDialog";
import {
  ACTION_KINDS,
  ACTION_STATUSES,
  DUE_RULES,
  DUE_RULE_LABEL,
  asDueRule,
  byUrgency,
  byWorkbookOrder,
  describeDaysLeft,
  needsAttention,
  type ActionView,
} from "./action-view";
import type { DefinitionField, ProgressField } from "./types";

type ActionGridProps = {
  accessKey: string;
  isKps: boolean;
  isOwner: boolean;
  today: string;
  settings: Settings;
  items: ActionView[];
  /** Show the Laporan column (KPS / owner viewing every report group). */
  showGroup: boolean;
  caption: string;
  /** Cards + dialog for phones (< 900 px). */
  phone: ReactNode;
};

type Filters = { status: string; flag: string; order: "urgency" | "id" };

const FLAG_FILTERS = [
  { value: "", label: "Semua flag" },
  { value: "perlu", label: "Perlu ditangani (OVERDUE + ≤ 7 hari)" },
  { value: "OVERDUE", label: "OVERDUE" },
  { value: "Jatuh tempo ≤ 7 hari", label: "Jatuh tempo ≤ 7 hari" },
  { value: "Rutin – pantau", label: "Rutin – pantau" },
  { value: "On Track", label: "On Track" },
  { value: "Selesai", label: "Selesai" },
  { value: "tanpa", label: "Tanpa batas waktu" },
] as const;

const PROGRESS_KEYS: Record<string, ProgressField> = {
  status: "status",
  progress: "progress",
  updated_on: "updatedOn",
  evidence: "evidence",
};
const DEFINITION_KEYS: Record<string, DefinitionField> = {
  area: "area",
  action: "action",
  target: "target",
  kind: "kind",
  schedule: "schedule",
  due_date: "dueDate",
  due_rule: "dueRule",
  pic: "pic",
  kps_notes: "kpsNotes",
};
const GRID_KEY: Record<string, string> = Object.fromEntries(
  [...Object.entries(PROGRESS_KEYS), ...Object.entries(DEFINITION_KEYS)].map(([grid, field]) => [field, grid]),
);

const rowKey = (r: ActionView) => r.code;
const rowLabel = (r: ActionView) => `${r.code}, ${r.area ?? "tanpa area"}`;
const SEARCH = {
  placeholder: "ID, area, tindakan, PIC",
  text: (r: ActionView) => `${r.code} ${r.area ?? ""} ${r.action ?? ""} ${r.pic ?? ""}`,
};

function matches(view: ActionView, f: Filters): boolean {
  if (f.status && view.status !== f.status) return false;
  if (f.flag === "perlu") return needsAttention(view);
  if (f.flag === "tanpa") return view.flag === null;
  return f.flag === "" || view.flag === f.flag;
}

/** The order is taken when a filter changes, not on every save, so a row never jumps away while it is edited. */
function orderOf(items: ActionView[], f: Filters): string[] {
  return items
    .filter((v) => matches(v, f))
    .sort(f.order === "urgency" ? byUrgency : byWorkbookOrder)
    .map((v) => v.code);
}

function chip(value: CellValue, empty?: string) {
  return value ? <StatusChip label={String(value)} bordered /> : empty ? <span className="text-ink-muted">{empty}</span> : null;
}

const toolSelect =
  "select-control min-h-10 rounded-control border border-line-strong bg-surface pl-3 text-sm text-ink hover:border-ink";

/**
 * Tindak Lanjut as a spreadsheet (docs/UX.md §2). Yellow cells: Status, % Progres, Tgl update,
 * Realisasi / Bukti for every link; Area, Tindakan, Target, Jenis, Jadwal, batas waktu, PIC and
 * Catatan KPS for KPS and the owner. White cells (Batas waktu, Sisa hari, Flag) follow the row
 * as typed. Each row saves itself: progress through share_update_action_item, the KPS fields
 * through share_kps_update_action_item, each merged with the stored row. Client component.
 */
export function ActionGrid({ accessKey, isKps, isOwner, today, settings, items, showGroup, caption, phone }: ActionGridProps) {
  // Settings and today are fixed for this page view; memoising columns on them keeps the grid steady after saves.
  const [rules] = useState(() => ({ settings, today }));
  const [filters, setFilters] = useState<Filters>({ status: "", flag: "", order: "urgency" });
  const [order, setOrder] = useState<string[]>(() => orderOf(items, { status: "", flag: "", order: "urgency" }));
  const [opened, setOpened] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const changeFilters = (next: Partial<Filters>) => {
    const merged = { ...filters, ...next };
    setFilters(merged);
    setOrder(orderOf(items, merged));
  };

  const rows = useMemo(() => {
    const byCode = new Map(items.map((v) => [v.code, v] as const));
    const listed = order.map((code) => byCode.get(code)).filter((v): v is ActionView => v !== undefined);
    const known = new Set(order);
    // Items added since the order was taken (owner "Tambah butir") go to the end.
    const added = items.filter((v) => !known.has(v.code) && matches(v, filters));
    return [...listed, ...added];
  }, [items, order, filters]);

  const columns = useMemo<GridColumn<ActionView>[]>(() => {
    const kpsOnly = () => isKps;
    const { settings: s, today: t } = rules;
    const ruleRow = (row: ActionView, value: (key: string) => CellValue) => ({
      dueDate: (value("due_date") as string | null) ?? null,
      schedule: (value("schedule") as string | null) ?? null,
      dueRule: asDueRule(value("due_rule") as string | null),
      status: (value("status") as string | null) ?? row.status,
      kind: (value("kind") as string | null) ?? null,
    });
    const list: GridColumn<ActionView>[] = [
      { key: "code", header: "ID", width: 116, editor: "readonly", frozen: true },
      {
        key: "area",
        header: "Area",
        width: 196,
        editor: "text",
        maxLength: 4000,
        required: true,
        frozen: true,
        editable: kpsOnly,
      },
    ];
    if (showGroup) {
      list.push({ key: "report_group", header: "Laporan", width: 96, editor: "readonly", get: (r) => r.reportGroup });
    }
    list.push(
      {
        key: "flag",
        header: "Flag",
        group: "Dihitung otomatis",
        width: 168,
        editor: "readonly",
        derive: (row, value) => actionFlag(ruleRow(row, value), s, t),
        render: (v) => chip(v, "Tanpa batas waktu"),
      },
      {
        key: "days_left",
        header: "Sisa hari",
        group: "Dihitung otomatis",
        width: 112,
        editor: "readonly",
        align: "start",
        derive: (row, value) => actionDaysLeft(ruleRow(row, value), s, t),
        render: (v) => {
          const days = typeof v === "number" ? v : null;
          return (
            <span className={days !== null && days < 0 ? "font-semibold text-critical" : days === null ? "text-ink-muted" : undefined}>
              {describeDaysLeft(days)}
            </span>
          );
        },
      },
      {
        key: "due_label",
        header: "Batas waktu",
        group: "Dihitung otomatis",
        width: 216,
        editor: "readonly",
        derive: (row, value) => {
          const r = ruleRow(row, value);
          const due = effectiveDueDate(r, s, t);
          if (!due) return null;
          return r.dueRule ? `${DUE_RULE_LABEL[r.dueRule]} (${formatTanggal(due)})` : formatTanggal(due);
        },
        render: (v) => (v ? <span className="tabular-nums">{v}</span> : <span className="text-ink-muted">Belum ditentukan</span>),
      },
      {
        key: "status",
        header: "Status",
        group: "Progres (diisi setiap minggu)",
        width: 140,
        editor: "select",
        required: true,
        options: ACTION_STATUSES.map((value) => ({ value })),
        render: (v) => chip(v),
      },
      {
        key: "progress",
        header: "% Progres",
        label: "% Progres (0 sampai 100)",
        group: "Progres (diisi setiap minggu)",
        width: 96,
        editor: "number",
        min: 0,
        max: 100,
        decimals: 0,
        required: true,
        render: (v) => (v === null ? null : <span className="tabular-nums">{v}%</span>),
      },
      {
        key: "updated_on",
        header: "Tgl update",
        group: "Progres (diisi setiap minggu)",
        width: 124,
        editor: "date",
        get: (r) => r.updatedOn,
      },
      {
        key: "evidence",
        header: "Realisasi / Bukti",
        group: "Progres (diisi setiap minggu)",
        width: 260,
        editor: "longtext",
        maxLength: 4000,
      },
      {
        key: "kps_notes",
        header: "Catatan KPS",
        group: "KPS",
        width: 240,
        editor: "longtext",
        maxLength: 4000,
        get: (r) => r.kpsNotes,
        editable: kpsOnly,
      },
      { key: "action", header: "Tindakan", group: "Definisi butir", width: 320, editor: "longtext", maxLength: 4000, editable: kpsOnly },
      { key: "target", header: "Target / Indikator", group: "Definisi butir", width: 240, editor: "longtext", maxLength: 4000, editable: kpsOnly },
      { key: "pic", header: "PIC", group: "Definisi butir", width: 200, editor: "text", maxLength: 4000, editable: kpsOnly },
      {
        key: "kind",
        header: "Jenis",
        group: "Definisi butir",
        width: 104,
        editor: "select",
        options: ACTION_KINDS.map((value) => ({ value })),
        editable: kpsOnly,
        render: (v) => chip(v),
      },
      { key: "schedule", header: "Jadwal", group: "Definisi butir", width: 240, editor: "longtext", maxLength: 4000, editable: kpsOnly },
      {
        key: "due_date",
        header: "Batas waktu tetap",
        group: "Definisi butir",
        width: 140,
        editor: "date",
        get: (r) => r.dueDate,
        editable: kpsOnly,
      },
      {
        key: "due_rule",
        header: "Aturan batas waktu",
        group: "Definisi butir",
        width: 196,
        editor: "select",
        options: DUE_RULES.map((value) => ({ value, label: DUE_RULE_LABEL[value] })),
        get: (r) => r.dueRule,
        editable: kpsOnly,
      },
      {
        key: "changed",
        header: "Terakhir diubah",
        width: 220,
        editor: "readonly",
        get: (r) => r.changedLabel,
        render: (v) => <span className="text-xs text-ink-muted">{v}</span>,
      },
    );
    return list;
  }, [isKps, showGroup, rules]);

  const rowActions = useMemo(
    () => ({
      header: "Aksi",
      width: isOwner ? 160 : 84,
      render: (row: ActionView) => (
        <span className="flex gap-1.5">
          <Button size="sm" variant="secondary" tabIndex={-1} onClick={() => setOpened(row.code)}>
            Buka<span className="sr-only"> {row.code}</span>
          </Button>
          {isOwner ? (
            <Button size="sm" variant="secondary" tabIndex={-1} onClick={() => setDeleting(row.code)}>
              Hapus<span className="sr-only"> butir {row.code}</span>
            </Button>
          ) : null}
        </span>
      ),
    }),
    [isOwner],
  );

  const onSaveRow = useCallback(
    async (_key: string, changes: Record<string, CellValue>, row: ActionView): Promise<SaveRowResult> => {
      const pick = <T,>(key: string, fallback: T): T => (key in changes ? (changes[key] as T) : fallback);
      const progressChanged = Object.keys(changes).some((k) => k in PROGRESS_KEYS);
      const definitionChanged = Object.keys(changes).some((k) => k in DEFINITION_KEYS);
      const fieldErrors = (errors: Partial<Record<string, string>> | undefined) =>
        errors
          ? Object.fromEntries(Object.entries(errors).map(([field, msg]) => [GRID_KEY[field] ?? field, msg ?? ""]))
          : undefined;

      if (progressChanged) {
        // A progress change without a typed date is dated today, as the workbook asks ("Tgl update").
        const updatedOn = "updated_on" in changes ? (changes.updated_on as string | null) : rules.today;
        const result = await saveActionProgress(accessKey, {
          code: row.code,
          status: pick<string>("status", row.status),
          progress: pick<number>("progress", row.progress),
          updatedOn: updatedOn ?? "",
          evidence: pick<string | null>("evidence", row.evidence) ?? "",
        });
        if (!result.ok) return { ok: false, message: result.message, fieldErrors: fieldErrors(result.fieldErrors) };
      }
      if (definitionChanged) {
        const result = await saveActionDefinition(accessKey, {
          code: row.code,
          area: pick<string | null>("area", row.area) ?? "",
          action: pick<string | null>("action", row.action) ?? "",
          target: pick<string | null>("target", row.target) ?? "",
          kind: pick<string | null>("kind", row.kind) ?? "",
          schedule: pick<string | null>("schedule", row.schedule) ?? "",
          dueDate: pick<string | null>("due_date", row.dueDate) ?? "",
          dueRule: pick<string | null>("due_rule", row.dueRule) ?? "",
          pic: pick<string | null>("pic", row.pic) ?? "",
          kpsNotes: pick<string | null>("kps_notes", row.kpsNotes) ?? "",
        });
        if (!result.ok) {
          const message = progressChanged ? `Progres tersimpan; catatan/definisi gagal: ${result.message}` : result.message;
          return { ok: false, message, fieldErrors: fieldErrors(result.fieldErrors) };
        }
      }
      return { ok: true };
    },
    [accessKey, rules],
  );

  const overdue = rows.filter((v) => v.flag === "OVERDUE").length;
  const dueSoon = rows.filter((v) => v.flag === "Jatuh tempo ≤ 7 hari").length;
  const attention = items.some(needsAttention);

  const toolbar = (
    <>
      {attention ? (
        <Button
          variant={filters.flag === "perlu" ? "primary" : "secondary"}
          onClick={() => changeFilters({ flag: filters.flag === "perlu" ? "" : "perlu" })}
        >
          {filters.flag === "perlu" ? "Tampilkan semua butir" : "Hanya yang perlu ditangani"}
        </Button>
      ) : null}
      <label className="flex flex-col gap-1">
        <span className="section-label">Status</span>
        <select className={toolSelect} value={filters.status} onChange={(e) => changeFilters({ status: e.target.value })}>
          <option value="">Semua status</option>
          {ACTION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="section-label">Flag</span>
        <select className={toolSelect} value={filters.flag} onChange={(e) => changeFilters({ flag: e.target.value })}>
          {FLAG_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="section-label">Urutan</span>
        <select
          className={toolSelect}
          value={filters.order}
          onChange={(e) => changeFilters({ order: e.target.value === "id" ? "id" : "urgency" })}
        >
          <option value="urgency">Paling mendesak dulu</option>
          <option value="id">Urutan ID workbook</option>
        </select>
      </label>
    </>
  );

  // Dashboard links here as #tl-<code>: that row becomes the active, focused row.
  const [focusCode, setFocusCode] = useState<string | null>(null);
  useEffect(() => {
    const read = () =>
      setFocusCode(window.location.hash.startsWith("#tl-") ? decodeURIComponent(window.location.hash.slice(4)) : null);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const openedItem = opened ? (items.find((v) => v.code === opened) ?? null) : null;
  const deletingItem = deleting ? (items.find((v) => v.code === deleting) ?? null) : null;

  return (
    <div className="flex flex-col gap-3">
      <div role="status" aria-live="polite">
        {notice ? <p className="text-sm font-semibold text-good">{notice}</p> : null}
      </div>
      <DataGrid
        caption={caption}
        rows={rows}
        columns={columns}
        rowKey={rowKey}
        rowLabel={rowLabel}
        onSaveRow={onSaveRow}
        search={SEARCH}
        toolbar={toolbar}
        summary={`${rows.length} dari ${items.length} butir · ${overdue} OVERDUE · ${dueSoon} jatuh tempo ≤ 7 hari`}
        rowActions={rowActions}
        focusRowKey={focusCode}
        emptyState={
          <>
            <p className="text-sm font-semibold text-ink">Tidak ada butir dengan filter ini</p>
            <p className="mt-1 text-sm text-ink-muted">Ubah Status atau Flag di atas untuk melihat butir lain.</p>
          </>
        }
        phone={phone}
      />
      {/* One details dialog for the whole grid, opened from a row's button. */}
      <ActionItemDialog
        accessKey={accessKey}
        isKps={isKps}
        today={rules.today}
        settings={rules.settings}
        item={openedItem}
        onClose={() => setOpened(null)}
        onSaved={() => undefined}
      />
      {isOwner ? (
        <DeleteActionItemDialog
          accessKey={accessKey}
          item={deletingItem}
          onClose={() => setDeleting(null)}
          onDeleted={(code) => {
            setDeleting(null);
            setNotice(`Butir ${code} dihapus.`);
          }}
        />
      ) : null}
    </div>
  );
}
