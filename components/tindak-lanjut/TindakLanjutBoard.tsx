"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/States";
import type { Settings } from "@/lib/rules";
import { ActionItemDialog } from "./ActionItemDialog";
import { ActionCards } from "./ActionRows";
import { DeleteActionItemDialog } from "./DeleteActionItemDialog";
import { ACTION_STATUSES, byUrgency, byWorkbookOrder, needsAttention, type ActionView } from "./action-view";

export type GroupSummary = {
  key: string;
  total: number;
  selesai: number;
  overdue: number;
  dueSoon: number;
  avgProgress: number | null;
};

type TindakLanjutBoardProps = {
  accessKey: string;
  isKps: boolean;
  /** Owner only: "Hapus butir" on each card. */
  isOwner?: boolean;
  today: string;
  settings: Settings;
  items: ActionView[];
  /** One per report group in this link's scope, in station order. */
  groups: GroupSummary[];
};

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

function matchesFlag(view: ActionView, filter: string): boolean {
  if (filter === "") return true;
  if (filter === "perlu") return needsAttention(view);
  if (filter === "tanpa") return view.flag === null;
  return view.flag === filter;
}

function groupLine(g: GroupSummary): string {
  const parts = [`${g.total} butir`, `${g.selesai} selesai`];
  parts.push(`${g.overdue} OVERDUE`, `${g.dueSoon} jatuh tempo ≤ 7 hari`);
  if (g.avgProgress !== null) parts.push(`rata-rata progres ${Math.round(g.avgProgress)}%`);
  return parts.join(" · ");
}

/**
 * The Tindak Lanjut screen body: what is late or due leads (one sentence, one filter),
 * then each report group's items, most urgent first. Filters are local to this view.
 */
export function TindakLanjutBoard({ accessKey, isKps, isOwner = false, today, settings, items, groups }: TindakLanjutBoardProps) {
  const [statusFilter, setStatusFilter] = useState("");
  const [flagFilter, setFlagFilter] = useState("");
  const [order, setOrder] = useState<"urgency" | "id">("urgency");
  const [editing, setEditing] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const overdue = items.filter((v) => v.flag === "OVERDUE").length;
  const dueSoon = items.filter((v) => v.flag === "Jatuh tempo ≤ 7 hari").length;
  const filtersActive = statusFilter !== "" || flagFilter !== "";

  const visible = useMemo(() => {
    const rows = items.filter(
      (v) =>
        (statusFilter === "" || v.status === statusFilter) &&
        matchesFlag(v, flagFilter),
    );
    return rows.sort(order === "urgency" ? byUrgency : byWorkbookOrder);
  }, [items, statusFilter, flagFilter, order]);

  // Ringkasan links here as #tl-<code>. The table (desktop) and the cards (phones) both carry
  // the item, so scroll to whichever is displayed and put focus on its update button.
  useEffect(() => {
    if (!window.location.hash.startsWith("#tl-")) return;
    const code = decodeURIComponent(window.location.hash.slice(4));
    const target = [...document.querySelectorAll<HTMLElement>("[data-tl-code]")].find(
      (el) => el.dataset.tlCode === code && el.getClientRects().length > 0,
    );
    if (!target) return;
    target.scrollIntoView({ block: "center" });
    target.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  }, []);

  const shownGroups = groups;
  const deletingItem = deleting ? (items.find((v) => v.code === deleting) ?? null) : null;
  const editingItem = editing ? (items.find((v) => v.code === editing) ?? null) : null;

  function clearFilters() {
    setStatusFilter("");
    setFlagFilter("");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 px-4 sm:px-6">
        <div role="status" aria-live="polite">
          {notice ? <p className="text-sm font-semibold text-good">{notice}</p> : null}
        </div>
        {overdue + dueSoon > 0 ? (
          <Button variant="secondary" onClick={() => setFlagFilter(flagFilter === "perlu" ? "" : "perlu")}>
            {flagFilter === "perlu" ? "Tampilkan semua butir" : "Hanya yang perlu ditangani"}
          </Button>
        ) : null}
      </div>

      <form
        aria-label="Saring tindak lanjut"
        onSubmit={(e) => e.preventDefault()}
        className="flex flex-col gap-3 px-4 sm:px-6"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Status">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Semua status</option>
              {ACTION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Flag">
            <Select value={flagFilter} onChange={(e) => setFlagFilter(e.target.value)}>
              {FLAG_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Urutan">
            <Select value={order} onChange={(e) => setOrder(e.target.value === "id" ? "id" : "urgency")}>
              <option value="urgency">Paling mendesak dulu</option>
              <option value="id">Urutan ID workbook</option>
            </Select>
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" aria-live="polite" className="text-sm text-ink-muted">
            Menampilkan {visible.length} dari {items.length} butir.
          </p>
          {filtersActive ? (
            <Button variant="quiet" size="sm" onClick={clearFilters}>
              Hapus filter
            </Button>
          ) : null}
        </div>
      </form>

      {shownGroups.map((g) => {
        const rows = visible.filter((v) => v.reportGroup === g.key);
        const caption = `Tindak lanjut laporan ${g.key}`;
        return (
          <section
            key={g.key}
            id={`laporan-${g.key.replace(/[^A-Za-z]+/g, "-").toLowerCase()}`}
            aria-labelledby={`laporan-${g.key.replace(/[^A-Za-z]+/g, "-").toLowerCase()}-judul`}
            className="border-t border-line"
          >
            <div className="px-4 pt-4 pb-3 sm:px-6">
              <h3 id={`laporan-${g.key.replace(/[^A-Za-z]+/g, "-").toLowerCase()}-judul`} className="text-base font-semibold text-ink">
                Laporan {g.key}
              </h3>
              <p className="mt-0.5 text-sm text-ink-muted">{groupLine(g)}</p>
            </div>
            {rows.length === 0 ? (
              <div className="px-4 sm:px-6">
                <EmptyState
                  title={`Tidak ada butir ${g.key} dengan filter ini`}
                  action={
                    filtersActive ? (
                      <Button variant="secondary" onClick={clearFilters}>
                        Hapus filter
                      </Button>
                    ) : undefined
                  }
                >
                  {g.total === 0
                    ? "Laporan ini belum punya butir tindak lanjut di database."
                    : "Semua butir laporan ini tersaring. Ubah atau hapus filter untuk melihatnya lagi."}
                </EmptyState>
              </div>
            ) : (
              <div className="border-t border-line">
                <ActionCards
                  caption={caption}
                  items={rows}
                  savedAt={savedAt}
                  onEdit={setEditing}
                  onDelete={isOwner ? setDeleting : undefined}
                />
              </div>
            )}
          </section>
        );
      })}

      <ActionItemDialog
        accessKey={accessKey}
        isKps={isKps}
        today={today}
        settings={settings}
        item={editingItem}
        onClose={() => setEditing(null)}
        onSaved={(code, at) => setSavedAt((current) => ({ ...current, [code]: at }))}
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
