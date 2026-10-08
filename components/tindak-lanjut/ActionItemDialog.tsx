"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Field, Input, NumberInput, Select, Textarea, parseDecimal } from "@/components/ui/Field";
import { SaveStatus, type SaveState } from "@/components/ui/SaveStatus";
import { StatusChip } from "@/components/ui/StatusChip";
import { Tabs } from "@/components/ui/Tabs";
import { formatTanggal, isValidIsoDate } from "@/lib/dates";
import { effectiveDueDate, type Settings } from "@/lib/rules";
import { saveActionDefinition, saveActionProgress } from "@/components/tindak-lanjut/actions";
import {
  ACTION_KINDS,
  ACTION_STATUSES,
  DUE_RULES,
  DUE_RULE_LABEL,
  DUE_RULE_OPTION,
  asDueRule,
  describeDaysLeft,
  type ActionView,
} from "./action-view";
import type { DefinitionField, DefinitionInput, ProgressField } from "./types";

type ActionItemDialogProps = {
  accessKey: string;
  isKps: boolean;
  /** Today in Asia/Jakarta (default "Tgl update"). */
  today: string;
  settings: Settings;
  /** The item being edited; null closes the dialog. */
  item: ActionView | null;
  onClose: () => void;
  /** Called after a successful save, for the per-row status. */
  onSaved: (code: string, savedAt: string) => void;
};

/**
 * Update dialog for one Tindak Lanjut item. Every link edits progress (Status, % progres,
 * Tgl update, Realisasi / Bukti); the KPS link also edits Catatan KPS and the item's
 * definition, on a second tab. Station links see those fields read-only.
 */
export function ActionItemDialog({ accessKey, isKps, today, settings, item, onClose, onSaved }: ActionItemDialogProps) {
  const [busy, setBusy] = useState(false);
  const open = item !== null;

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      dismissible={!busy}
      size="md"
      title={item ? `Perbarui ${item.code}` : "Perbarui tindak lanjut"}
      description={item?.area ?? undefined}
    >
      {item ? (
        // Keyed by code: opening another item starts from that item's saved values.
        <DialogBody
          key={item.code}
          accessKey={accessKey}
          isKps={isKps}
          today={today}
          settings={settings}
          item={item}
          onBusyChange={setBusy}
          onSaved={onSaved}
        />
      ) : null}
    </Dialog>
  );
}

type BodyProps = Omit<ActionItemDialogProps, "item" | "onClose"> & {
  item: ActionView;
  onBusyChange: (busy: boolean) => void;
};

function DialogBody({ accessKey, isKps, today, settings, item, onBusyChange, onSaved }: BodyProps) {
  const progressForm = (
    <ProgressForm accessKey={accessKey} today={today} item={item} onBusyChange={onBusyChange} onSaved={onSaved} />
  );

  return (
    <div className="flex flex-col gap-4">
      <ItemSummary item={item} showKpsNotes={!isKps} />
      {isKps ? (
        <Tabs
          label={`Bagian yang diubah untuk ${item.code}`}
          items={[
            { id: "progres", label: "Progres", panel: progressForm },
            {
              id: "definisi",
              label: "Catatan KPS & definisi",
              panel: (
                <DefinitionForm
                  accessKey={accessKey}
                  today={today}
                  settings={settings}
                  item={item}
                  onBusyChange={onBusyChange}
                  onSaved={onSaved}
                />
              ),
            },
          ]}
        />
      ) : (
        progressForm
      )}
    </div>
  );
}

function ItemSummary({ item, showKpsNotes }: { item: ActionView; showKpsNotes: boolean }) {
  return (
    <dl className="grid gap-3 rounded-control border border-line bg-paper p-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <dt className="section-label">Tindakan</dt>
        <dd className="mt-0.5 text-ink">{item.action ?? "Belum diisi"}</dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="section-label">Target / Indikator</dt>
        <dd className="mt-0.5 text-ink">{item.target ?? "Belum diisi"}</dd>
      </div>
      <div>
        <dt className="section-label">Batas waktu</dt>
        <dd className="mt-0.5 flex flex-wrap items-center gap-2">
          <span className="tabular-nums">{item.dueLabel ?? "Belum ditentukan"}</span>
          <StatusChip label={item.flag} emptyLabel="Tanpa batas waktu" />
        </dd>
        <dd className="text-xs text-ink-muted">Sisa hari: {describeDaysLeft(item.daysLeft)}</dd>
      </div>
      <div>
        <dt className="section-label">PIC</dt>
        <dd className="mt-0.5 text-ink">{item.pic ?? "Belum diisi"}</dd>
      </div>
      {showKpsNotes ? (
        <div className="sm:col-span-2">
          <dt className="section-label">Catatan KPS (hanya diubah lewat tautan KPS)</dt>
          <dd className="mt-0.5 whitespace-pre-line text-ink">{item.kpsNotes ?? "Belum ada catatan"}</dd>
        </div>
      ) : null}
      <div className="sm:col-span-2">
        <dt className="sr-only">Perubahan terakhir</dt>
        <dd className="text-xs text-ink-muted">{item.changedLabel}</dd>
      </div>
    </dl>
  );
}

// Progress (every link)

type FormProps = {
  accessKey: string;
  today: string;
  item: ActionView;
  onBusyChange: (busy: boolean) => void;
  onSaved: (code: string, savedAt: string) => void;
};

function ProgressForm({ accessKey, today, item, onBusyChange, onSaved }: FormProps) {
  const [status, setStatus] = useState(item.status);
  const [progress, setProgress] = useState(String(item.progress));
  // A new update is dated today unless the person changes it.
  const [updatedOn, setUpdatedOn] = useState(today);
  const [evidence, setEvidence] = useState(item.evidence ?? "");
  const [errors, setErrors] = useState<Partial<Record<ProgressField, string>>>({});
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const [pending, startTransition] = useTransition();

  const parsed = parseDecimal(progress);
  const sliderValue = parsed !== null && Number.isFinite(parsed) ? Math.min(100, Math.max(0, Math.round(parsed))) : 0;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = parseDecimal(progress);
    if (value === null || !Number.isInteger(value) || value < 0 || value > 100) {
      setErrors({ progress: "Isi bilangan bulat 0 sampai 100." });
      setSave({ status: "error", message: "Periksa isian yang ditandai." });
      return;
    }
    setErrors({});
    setSave({ status: "saving" });
    onBusyChange(true);
    startTransition(async () => {
      try {
        const result = await saveActionProgress(accessKey, {
          code: item.code,
          status,
          progress: value,
          updatedOn,
          evidence,
        });
        if (result.ok) {
          setSave({ status: "saved", at: result.savedAt });
          onSaved(item.code, result.savedAt);
        } else {
          setErrors(result.fieldErrors ?? {});
          setSave({ status: "error", message: result.message });
        }
      } catch {
        setSave({ status: "error", message: "Server tidak menjawab. Periksa koneksi, lalu simpan lagi." });
      } finally {
        onBusyChange(false);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Status" error={errors.status} required>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {ACTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Tgl update"
          help="Tanggal pembaruan ini. Bawaan: hari ini."
          error={errors.updatedOn}
        >
          <Input type="date" value={updatedOn} onChange={(e) => setUpdatedOn(e.target.value)} />
        </Field>
      </div>

      <Field
        label="% Progres"
        help="Geser, atau ketik bilangan bulat 0 sampai 100."
        error={errors.progress}
        required
      >
        <NumberInput
          value={progress}
          onChange={(e) => setProgress(e.target.value)}
          className="max-w-32"
        />
      </Field>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={sliderValue}
        onChange={(e) => setProgress(e.target.value)}
        aria-label={`Geser % progres ${item.code}`}
        aria-valuetext={`${sliderValue}%`}
        className="-mt-2 h-11 w-full cursor-pointer accent-brand sm:h-8"
      />

      <Field
        label="Realisasi / Bukti"
        help="Tulis bukti yang bisa dicek: daftar hadir, checklist, nomor dokumen, atau tautan berkas."
        error={errors.evidence}
      >
        <Textarea rows={4} value={evidence} onChange={(e) => setEvidence(e.target.value)} />
      </Field>

      <DialogActions>
        <SaveStatus state={save} className="sm:mr-auto" />
        <Button type="submit" loading={pending} loadingText="Menyimpan progres…">
          Simpan progres
        </Button>
      </DialogActions>
    </form>
  );
}

// Catatan KPS + definition (KPS link only)

function DefinitionForm({ accessKey, today, item, settings, onBusyChange, onSaved }: FormProps & { settings: Settings }) {
  const [values, setValues] = useState<Omit<DefinitionInput, "code">>({
    kpsNotes: item.kpsNotes ?? "",
    area: item.area ?? "",
    action: item.action ?? "",
    target: item.target ?? "",
    kind: item.kind ?? "",
    schedule: item.schedule ?? "",
    dueDate: item.dueDate ?? "",
    dueRule: item.dueRule ?? "",
    pic: item.pic ?? "",
  });
  const [errors, setErrors] = useState<Partial<Record<DefinitionField, string>>>({});
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const [pending, startTransition] = useTransition();

  const set = (field: keyof typeof values) => (value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  // What "Batas waktu" will show with these values (same rule as the table).
  const rule = asDueRule(values.dueRule);
  const preview = effectiveDueDate(
    { dueDate: isValidIsoDate(values.dueDate) ? values.dueDate : null, schedule: values.schedule || null, dueRule: rule },
    settings,
    today,
  );
  const previewText = preview
    ? rule
      ? `${DUE_RULE_LABEL[rule]} (${formatTanggal(preview)})`
      : formatTanggal(preview)
    : "Belum ditentukan";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setSave({ status: "saving" });
    onBusyChange(true);
    startTransition(async () => {
      try {
        const result = await saveActionDefinition(accessKey, { code: item.code, ...values });
        if (result.ok) {
          setSave({ status: "saved", at: result.savedAt });
          onSaved(item.code, result.savedAt);
        } else {
          setErrors(result.fieldErrors ?? {});
          setSave({ status: "error", message: result.message });
        }
      } catch {
        setSave({ status: "error", message: "Server tidak menjawab. Periksa koneksi, lalu simpan lagi." });
      } finally {
        onBusyChange(false);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Catatan KPS" error={errors.kpsNotes}>
        <Textarea rows={3} value={values.kpsNotes} onChange={(e) => set("kpsNotes")(e.target.value)} />
      </Field>
      <Field label="Area" error={errors.area}>
        <Input value={values.area} onChange={(e) => set("area")(e.target.value)} />
      </Field>
      <Field label="Tindakan" error={errors.action}>
        <Textarea rows={3} value={values.action} onChange={(e) => set("action")(e.target.value)} />
      </Field>
      <Field label="Target / Indikator" error={errors.target}>
        <Textarea rows={2} value={values.target} onChange={(e) => set("target")(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Jenis" error={errors.kind}>
          <Select value={values.kind} onChange={(e) => set("kind")(e.target.value)}>
            <option value="">Belum diisi</option>
            {ACTION_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="PIC" error={errors.pic}>
          <Input value={values.pic} onChange={(e) => set("pic")(e.target.value)} />
        </Field>
      </div>
      <Field label="Jadwal" error={errors.schedule}>
        <Input value={values.schedule} onChange={(e) => set("schedule")(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Aturan batas waktu"
          help="Batas waktu bergulir dihitung ulang setiap hari."
          error={errors.dueRule}
        >
          <Select value={values.dueRule} onChange={(e) => set("dueRule")(e.target.value)}>
            <option value="">Tetap (pakai batas waktu tetap)</option>
            {DUE_RULES.map((r) => (
              <option key={r} value={r}>
                {DUE_RULE_OPTION[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Batas waktu tetap"
          help={rule ? "Tidak dipakai selama aturan bergulir dipilih." : "Kosongkan jika belum ada batas waktu."}
          error={errors.dueDate}
        >
          <Input type="date" value={values.dueDate} onChange={(e) => set("dueDate")(e.target.value)} />
        </Field>
      </div>
      <p className="text-sm text-ink-muted" aria-live="polite">
        Batas waktu yang akan tampil: <span className="font-semibold text-ink tabular-nums">{previewText}</span>
      </p>

      <DialogActions>
        <SaveStatus state={save} className="sm:mr-auto" />
        <Button type="submit" loading={pending} loadingText="Menyimpan catatan…">
          Simpan catatan dan definisi
        </Button>
      </DialogActions>
    </form>
  );
}
