"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { REPORT_GROUPS } from "@/lib/rules";
import { createActionItem } from "./actions";
import { ACTION_KINDS, DUE_RULES, DUE_RULE_OPTION } from "./action-view";
import { nextActionCode, type ExistingItem, type NewItemField, type NewItemInput } from "./owner-items";

type AddActionItemButtonProps = {
  accessKey: string;
  /** Every item (code + group), to propose the next free ID; the action re-checks in the database. */
  existing: Pick<ExistingItem, "code" | "reportGroup">[];
  /** Pre-selected report group (the current filter), if any. */
  defaultGroup: string | null;
};

const EMPTY: Omit<NewItemInput, "reportGroup" | "code"> = {
  area: "",
  action: "",
  target: "",
  kind: "Sekali",
  schedule: "",
  dueDate: "",
  dueRule: "",
  pic: "",
};

/** Owner only: "Tambah butir" opens a form; the ID is proposed as the next free <GROUP>-TLnn. */
export function AddActionItemButton({ accessKey, existing, defaultGroup }: AddActionItemButtonProps) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const [notice, setNotice] = useState("");

  return (
    <>
      <Button
        onClick={() => {
          setRound((n) => n + 1);
          setOpen(true);
        }}
      >
        Tambah butir
      </Button>
      <span role="status" aria-live="polite" className="text-sm font-semibold text-good">
        {notice}
      </span>
      <Dialog open={open} onClose={() => setOpen(false)} size="md" title="Tambah butir tindak lanjut">
        {open ? (
          <AddForm
            key={round}
            accessKey={accessKey}
            existing={existing}
            defaultGroup={defaultGroup}
            onCancel={() => setOpen(false)}
            onAdded={(code) => {
              setOpen(false);
              setNotice(`Butir ${code} ditambahkan.`);
            }}
          />
        ) : null}
      </Dialog>
    </>
  );
}

function AddForm({
  accessKey,
  existing,
  defaultGroup,
  onCancel,
  onAdded,
}: Omit<AddActionItemButtonProps, never> & { onCancel: () => void; onAdded: (code: string) => void }) {
  const initialGroup = defaultGroup ?? "";
  const [group, setGroup] = useState(initialGroup);
  const [code, setCode] = useState(initialGroup ? nextActionCode(initialGroup, existing) : "");
  const [codeTouched, setCodeTouched] = useState(false);
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<NewItemField, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (field: keyof typeof EMPTY) => (value: string) => setValues((v) => ({ ...v, [field]: value }));

  function chooseGroup(next: string) {
    setGroup(next);
    if (!codeTouched) setCode(next ? nextActionCode(next, existing) : "");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const local: Partial<Record<NewItemField, string>> = {};
    if (!group) local.reportGroup = "Pilih laporan.";
    if (!code.trim()) local.code = "Isi ID butir.";
    if (!values.area.trim()) local.area = "Wajib diisi.";
    if (!values.action.trim()) local.action = "Wajib diisi.";
    setErrors(local);
    setMessage(null);
    if (Object.keys(local).length > 0) return;
    startTransition(async () => {
      try {
        const result = await createActionItem(accessKey, { reportGroup: group, code, ...values });
        if (result.ok) onAdded(result.code);
        else {
          setErrors(result.fieldErrors ?? {});
          setMessage(result.message);
        }
      } catch {
        setMessage("Server tidak menjawab. Periksa koneksi, lalu coba lagi.");
      }
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">
        Butir baru mulai dengan status Belum Mulai dan progres 0%. Stasiun di laporan ini langsung melihatnya.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Laporan" error={errors.reportGroup} required>
          <Select value={group} onChange={(e) => chooseGroup(e.target.value)}>
            <option value="">Pilih laporan</option>
            {REPORT_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="ID" help="Diusulkan otomatis: nomor berikutnya di laporan itu." error={errors.code} required>
          <Input
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setCodeTouched(true);
            }}
            autoComplete="off"
          />
        </Field>
      </div>
      <Field label="Area" error={errors.area} required>
        <Input value={values.area} onChange={(e) => set("area")(e.target.value)} />
      </Field>
      <Field label="Tindakan" error={errors.action} required>
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
        <Field label="Batas waktu tetap" error={errors.dueDate}>
          <Input type="date" value={values.dueDate} onChange={(e) => set("dueDate")(e.target.value)} />
        </Field>
        <Field label="Aturan batas waktu" help="Kosong: pakai batas waktu tetap." error={errors.dueRule}>
          <Select value={values.dueRule} onChange={(e) => set("dueRule")(e.target.value)}>
            <option value="">Tetap</option>
            {DUE_RULES.map((r) => (
              <option key={r} value={r}>
                {DUE_RULE_OPTION[r]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Jadwal" error={errors.schedule}>
        <Input value={values.schedule} onChange={(e) => set("schedule")(e.target.value)} />
      </Field>
      {message ? (
        <p role="alert" className="text-sm font-medium text-critical">
          {message}
        </p>
      ) : null}
      <DialogActions>
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          Batal
        </Button>
        <Button type="submit" loading={pending} loadingText="Menambahkan…">
          Tambah butir
        </Button>
      </DialogActions>
    </form>
  );
}
