"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { SaveStatus } from "@/components/ui/SaveStatus";
import { StatusChip } from "@/components/ui/StatusChip";
import { cx } from "@/components/ui/cx";
import { formatTanggal } from "@/lib/dates";
import { describeDaysLeft, type ActionView } from "./action-view";

type RowsProps = {
  caption: string;
  items: ActionView[];
  /** code → ISO time of the last save made on this screen. */
  savedAt: Record<string, string>;
  onEdit: (code: string) => void;
  /** Owner only: shows "Hapus butir" on each card. */
  onDelete?: (code: string) => void;
};

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-ink-muted">{children}</span>;
}

function DaysLeft({ view }: { view: ActionView }) {
  const text = describeDaysLeft(view.daysLeft);
  if (view.daysLeft === null) return <Muted>{text}</Muted>;
  return (
    <span className={cx("tabular-nums", view.daysLeft < 0 && "font-semibold text-critical")}>{text}</span>
  );
}

function Progress({ value }: { value: number }) {
  return (
    <span className="flex items-center justify-end gap-2">
      <span aria-hidden="true" className="h-1.5 w-14 overflow-hidden rounded-control bg-neutral-tint">
        <span className="block h-full bg-brand" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </span>
      <span className="w-10 text-right tabular-nums">{value}%</span>
    </span>
  );
}

function LongText({ value, empty }: { value: string | null; empty: string }) {
  return value ? <span className="whitespace-pre-line">{value}</span> : <Muted>{empty}</Muted>;
}

/** The seeded rows were never updated: "lewat pemilik / Google Sheet" would only add noise there. */
function showChangedBy(view: ActionView): boolean {
  return view.updatedOn !== null || view.lastChangedBy !== "pemilik / Google Sheet";
}

function saveState(savedAt: Record<string, string>, code: string) {
  const at = savedAt[code];
  return at ? ({ status: "saved", at } as const) : ({ status: "idle" } as const);
}

function Item({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="section-label">{label}</dt>
      <dd className="mt-0.5 text-sm wrap-break-word text-ink">{children}</dd>
    </div>
  );
}

/** Under 900 px: one card per item, long texts wrap at full width. */
export function ActionCards({ caption, items, savedAt, onEdit, onDelete }: RowsProps) {
  return (
    <ul aria-label={caption} className="divide-y divide-line">
      {items.map((view) => (
        <li key={view.code} data-tl-code={view.code} className={cx("px-4 py-4", savedAt[view.code] && "bg-brand-tint")}>
          <article aria-labelledby={`tl-kartu-${view.code}`} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h4 id={`tl-kartu-${view.code}`} className="min-w-0 text-sm text-ink">
                <span className="block font-semibold">{view.code}</span>
                <span className="block">{view.area ?? "Area belum diisi"}</span>
              </h4>
              <StatusChip label={view.flag} emptyLabel="Tanpa batas waktu" />
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Item label="Batas waktu">
                <span className="tabular-nums">{view.dueLabel ?? "Belum ditentukan"}</span>
              </Item>
              <Item label="Sisa hari">
                <DaysLeft view={view} />
              </Item>
              <Item label="Status">
                <StatusChip label={view.status} />
              </Item>
              <Item label="% Progres">
                <span className="flex">
                  <Progress value={view.progress} />
                </span>
              </Item>
              <Item label="Realisasi / Bukti" wide>
                <LongText value={view.evidence} empty="Belum ada bukti" />
              </Item>
              <Item label="Tgl update" wide>
                {view.updatedOn ? formatTanggal(view.updatedOn) : <Muted>Belum diperbarui</Muted>}
                {showChangedBy(view) ? <span className="text-ink-muted">, lewat {view.lastChangedBy}</span> : null}
              </Item>
              <Item label="Tindakan" wide>
                <LongText value={view.action} empty="Belum diisi" />
              </Item>
              <Item label="Target / Indikator" wide>
                <LongText value={view.target} empty="Belum diisi" />
              </Item>
              <Item label="PIC" wide>
                <LongText value={view.pic} empty="Belum diisi" />
              </Item>
              {view.kpsNotes ? (
                <Item label="Catatan KPS" wide>
                  <LongText value={view.kpsNotes} empty="" />
                </Item>
              ) : null}
              <Item label="Jenis">{view.kind ?? <Muted>Belum diisi</Muted>}</Item>
              <Item label="Jadwal">
                <LongText value={view.schedule} empty="Tidak ada jadwal khusus" />
              </Item>
            </dl>

            <div className="flex flex-col gap-1">
              <Button variant="secondary" fullWidth onClick={() => onEdit(view.code)}>
                Perbarui {view.code}
              </Button>
              {onDelete ? (
                <Button variant="secondary" fullWidth onClick={() => onDelete(view.code)}>
                  Hapus butir {view.code}
                </Button>
              ) : null}
              <SaveStatus state={saveState(savedAt, view.code)} />
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}
