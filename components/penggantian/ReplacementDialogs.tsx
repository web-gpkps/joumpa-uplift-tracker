"use client";

import { createContext, use, useId, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { deleteReplacement, saveReplacement, type ReplacementInput } from "@/components/penggantian/actions";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, NumberInput, Select, Textarea, parseDecimal } from "@/components/ui/Field";
import { SaveStatus, type SaveState } from "@/components/ui/SaveStatus";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatTanggal } from "@/lib/dates";
import { replacementPass, replacementTimeliness, type Settings } from "@/lib/rules";
import type { LinkError } from "@/lib/workspace/errors";
import { formatDecimal, toInputText } from "@/lib/format";
import { isPlausibleDate } from "@/components/bmi/format";

export type ReplacementFormRow = {
  id: number;
  station: string | null;
  staffCode: string | null;
  replacedName: string;
  reason: string | null;
  withdrawnOn: string | null;
  replacementName: string | null;
  effectiveOn: string | null;
  trainingOn: string | null;
  postTest: number | null;
  practiceAvg: number | null;
  reported: string | null;
  notes: string | null;
};

export type ReplacementContext = {
  accessKey: string;
  /** A station link's own station (fixed); null for KPS, who chooses. */
  fixedStation: string | null;
  stations: string[];
  staff: Array<{ code: string; name: string; station: string | null }>;
  settings: Settings;
  today: string;
  /** KPS: the station filter on screen, preselected when adding. */
  defaultStation: string | null;
};

type FieldKey =
  | "station"
  | "staff"
  | "replacedName"
  | "reason"
  | "replacementName"
  | "postTest"
  | "practiceAvg"
  | "reported"
  | "notes"
  | "withdrawnOn"
  | "effectiveOn"
  | "trainingOn";
type Errors = Partial<Record<FieldKey, string>>;

const DATE_INVALID = "Tanggal belum lengkap atau tidak valid.";
const CONNECTION_LOST = "koneksi ke server terputus. Isian Anda masih ada; simpan lagi.";

const SERVER_FIELD: Record<string, FieldKey> = {
  station: "station",
  report_group: "station",
  staff_code: "staff",
  replaced_name: "replacedName",
  reason: "reason",
  replacement_name: "replacementName",
  post_test: "postTest",
  practice_avg: "practiceAvg",
  reported: "reported",
  notes: "notes",
};

function serverErrors(error: LinkError): Errors {
  if (error.code !== "invalid_input" || !error.field) return {};
  const key = SERVER_FIELD[error.field];
  if (!key) return {};
  const messages: Partial<Record<FieldKey, string>> = {
    station: "Pilih stasiun yang benar.",
    staff: "SDM ini tidak ada di stasiun yang dipilih.",
    replacedName: "Pilih SDM dari daftar atau tulis nama SDM yang diganti.",
    postTest: "Post-test harus 0 sampai 100.",
    practiceAvg: "Rata-rata praktik harus 1,00 sampai 5,00.",
    reported: "Pilih Ya, Belum, atau kosongkan.",
  };
  return { [key]: messages[key] ?? "Isian terlalu panjang atau tidak valid." };
}

function blankToNull(value: string): string | null {
  return value.trim() === "" ? null : value.trim();
}

function decimalsOver(raw: string, max: number): boolean {
  const match = /[.,](\d+)\s*$/.exec(raw.trim());
  return Boolean(match && match[1].length > max);
}

type FormProps = {
  ctx: ReplacementContext;
  row: ReplacementFormRow | null;
  formId: string;
  pending: boolean;
  onSubmit: (input: ReplacementInput) => void;
  errors: Errors;
  setErrors: (errors: Errors) => void;
};

/** The add/edit form. Mounted only while its dialog is open, so it always starts from the row. */
function ReplacementForm({ ctx, row, formId, pending, onSubmit, errors, setErrors }: FormProps) {
  const initialStation = row?.station ?? ctx.fixedStation ?? ctx.defaultStation ?? "";
  const [station, setStation] = useState(initialStation);
  const [staffChoice, setStaffChoice] = useState(row?.staffCode ?? "");
  const [replacedName, setReplacedName] = useState(row?.replacedName ?? "");
  const [reason, setReason] = useState(row?.reason ?? "");
  const [withdrawnOn, setWithdrawnOn] = useState(row?.withdrawnOn ?? "");
  const [replacementName, setReplacementName] = useState(row?.replacementName ?? "");
  const [effectiveOn, setEffectiveOn] = useState(row?.effectiveOn ?? "");
  const [trainingOn, setTrainingOn] = useState(row?.trainingOn ?? "");
  const [postTest, setPostTest] = useState(toInputText(row?.postTest));
  const [practiceAvg, setPracticeAvg] = useState(toInputText(row?.practiceAvg));
  const [reported, setReported] = useState(row?.reported === "Ya" || row?.reported === "Belum" ? row.reported : "");
  const [notes, setNotes] = useState(row?.notes ?? "");

  const s = ctx.settings;
  const stationStaff = ctx.staff.filter((st) => station !== "" && st.station === station);
  const postTestValue = parseDecimal(postTest);
  const practiceValue = parseDecimal(practiceAvg);
  const pass = replacementPass(
    {
      replacementName: blankToNull(replacementName),
      postTest: Number.isFinite(postTestValue) ? postTestValue : null,
      practiceAvg: Number.isFinite(practiceValue) ? practiceValue : null,
    },
    s,
  );
  // Preview only once the date is complete; a half-typed year must not reach lib/dates.
  const timeliness =
    effectiveOn === "" || isPlausibleDate(effectiveOn)
      ? replacementTimeliness(
          { replacedName: blankToNull(replacedName), effectiveOn: blankToNull(effectiveOn) },
          s,
          ctx.today,
        )
      : null;

  function chooseStation(next: string) {
    setStation(next);
    if (!ctx.staff.some((st) => st.code === staffChoice && st.station === next)) setStaffChoice("");
  }

  function chooseStaff(code: string) {
    setStaffChoice(code);
    const person = ctx.staff.find((st) => st.code === code);
    if (person) setReplacedName(person.name);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const next: Errors = {};
    if (!ctx.fixedStation && station === "") next.station = "Pilih stasiun.";
    if (replacedName.trim() === "") next.replacedName = "Pilih SDM dari daftar atau tulis nama SDM yang diganti.";
    if (withdrawnOn !== "" && !isPlausibleDate(withdrawnOn)) next.withdrawnOn = DATE_INVALID;
    if (effectiveOn !== "" && !isPlausibleDate(effectiveOn)) next.effectiveOn = DATE_INVALID;
    if (trainingOn !== "" && !isPlausibleDate(trainingOn)) next.trainingOn = DATE_INVALID;
    if (postTestValue !== null) {
      if (Number.isNaN(postTestValue)) next.postTest = "Tulis angka, misalnya 85.";
      else if (decimalsOver(postTest, 2)) next.postTest = "Paling banyak dua angka di belakang koma.";
      else if (postTestValue < 0 || postTestValue > 100) next.postTest = "Post-test harus 0 sampai 100.";
    }
    if (practiceValue !== null) {
      if (Number.isNaN(practiceValue)) next.practiceAvg = "Tulis angka, misalnya 4,25.";
      else if (decimalsOver(practiceAvg, 2)) next.practiceAvg = "Paling banyak dua angka di belakang koma.";
      else if (practiceValue < 1 || practiceValue > 5) next.practiceAvg = "Rata-rata praktik harus 1,00 sampai 5,00.";
    }
    setErrors(next);
    if (Object.values(next).some(Boolean)) {
      const form = event.currentTarget;
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }

    onSubmit({
      id: row?.id ?? null,
      station: ctx.fixedStation ?? blankToNull(station),
      staffCode: staffChoice === "" ? null : staffChoice,
      replacedName: blankToNull(replacedName),
      reason: blankToNull(reason),
      withdrawnOn: blankToNull(withdrawnOn),
      replacementName: blankToNull(replacementName),
      effectiveOn: blankToNull(effectiveOn),
      trainingOn: blankToNull(trainingOn),
      postTest: postTestValue,
      practiceAvg: practiceValue,
      reported: reported === "Ya" || reported === "Belum" ? reported : null,
      notes: blankToNull(notes),
    });
  }

  return (
    <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 text-base font-semibold text-ink">SDM yang diganti</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {ctx.fixedStation ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-semibold text-ink">Stasiun</p>
              <p className="flex min-h-11 items-center text-sm text-ink sm:min-h-10">
                Stasiun {ctx.fixedStation}
              </p>
            </div>
          ) : (
            <Field label="Stasiun" required error={errors.station}>
              <Select value={station} onChange={(e) => chooseStation(e.target.value)}>
                <option value="">Pilih stasiun</option>
                {ctx.stations.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field
            label="Pilih dari daftar SDM"
            error={errors.staff}
            help={station === "" ? "Pilih stasiun dulu." : undefined}
          >
            <Select
              value={staffChoice}
              disabled={station === ""}
              onChange={(e) => chooseStaff(e.target.value)}
            >
              <option value="">Tidak ada di daftar (tulis nama)</option>
              {stationStaff.map((st) => (
                <option key={st.code} value={st.code}>
                  {st.name} ({st.code})
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Nama SDM diganti"
            required
            error={errors.replacedName}
            help="Terisi saat memilih dari daftar. Bisa diubah."
            className="sm:col-span-2"
          >
            <Input value={replacedName} maxLength={200} onChange={(e) => setReplacedName(e.target.value)} />
          </Field>
          <Field label="Alasan" error={errors.reason} className="sm:col-span-2">
            <Textarea value={reason} rows={2} maxLength={4000} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Field label="Tgl ditarik" error={errors.withdrawnOn}>
            <Input type="date" value={withdrawnOn} onChange={(e) => setWithdrawnOn(e.target.value)} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-base font-semibold text-ink">Pengganti</legend>
        <p className="text-sm text-ink-muted">
          Tgl efektif paling lambat {formatTanggal(s.replacementDeadline)}. Pengganti boleh bertugas setelah lulus
          training: post-test minimal {formatDecimal(s.posttestMin, 0, 2)} dan rata-rata praktik minimal{" "}
          {formatDecimal(s.passAvgMin, 2)}.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="SDM pengganti" error={errors.replacementName} className="sm:col-span-2">
            <Input value={replacementName} maxLength={200} onChange={(e) => setReplacementName(e.target.value)} />
          </Field>
          <Field label="Tgl efektif" error={errors.effectiveOn}>
            <Input type="date" value={effectiveOn} onChange={(e) => setEffectiveOn(e.target.value)} />
          </Field>
          <Field label="Tgl training" error={errors.trainingOn}>
            <Input type="date" value={trainingOn} onChange={(e) => setTrainingOn(e.target.value)} />
          </Field>
          <Field label="Post-test" error={errors.postTest} help={`Syarat minimal ${formatDecimal(s.posttestMin, 0, 2)}.`}>
            <NumberInput decimal value={postTest} onChange={(e) => setPostTest(e.target.value)} />
          </Field>
          <Field
            label="Rata-rata praktik"
            error={errors.practiceAvg}
            help={`Syarat minimal ${formatDecimal(s.passAvgMin, 2)}.`}
          >
            <NumberInput decimal value={practiceAvg} onChange={(e) => setPracticeAvg(e.target.value)} />
          </Field>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-2 rounded-control bg-paper px-3 py-2">
          <div className="flex flex-col gap-1">
            <dt className="section-label">Status kelulusan</dt>
            <dd>
              <StatusChip label={pass} emptyLabel="Belum ada pengganti" />
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="section-label">Ketepatan waktu</dt>
            <dd>
              <StatusChip
                label={timeliness}
                emptyLabel={replacedName.trim() === "" ? "Isi nama SDM diganti" : "Lengkapi tanggal efektif"}
              />
            </dd>
          </div>
        </dl>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 text-base font-semibold text-ink">Pelaporan</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dilaporkan ke OAO/Direksi" error={errors.reported}>
            <Select value={reported} onChange={(e) => setReported(e.target.value)}>
              <option value="">Belum diisi</option>
              <option value="Ya">Ya</option>
              <option value="Belum">Belum</option>
            </Select>
          </Field>
          <Field label="Catatan" error={errors.notes} className="sm:col-span-2">
            <Textarea value={notes} rows={2} maxLength={4000} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
      </fieldset>
    </form>
  );
}

type FormDialogProps = {
  ctx: ReplacementContext;
  row: ReplacementFormRow | null;
  open: boolean;
  onClose: () => void;
  onSaved: (at: string) => void;
};

function ReplacementFormDialog({ ctx, row, open, onClose, onSaved }: FormDialogProps) {
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<SaveState>({ status: "idle" });

  function close() {
    if (pending) return;
    setErrors({});
    setStatus({ status: "idle" });
    onClose();
  }

  function save(input: ReplacementInput) {
    setStatus({ status: "saving" });
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof saveReplacement>>;
      try {
        result = await saveReplacement(ctx.accessKey, input);
      } catch {
        setStatus({ status: "error", message: CONNECTION_LOST });
        return;
      }
      if (result.ok) {
        setErrors({});
        setStatus({ status: "idle" });
        onSaved(result.savedAt);
        return;
      }
      setErrors(serverErrors(result.error));
      setStatus({ status: "error", message: result.error.message });
    });
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      dismissible={false}
      size="md"
      title={row ? `Ubah penggantian ${row.replacedName}` : "Tambah penggantian SDM"}
      description={
        ctx.fixedStation
          ? `Untuk Stasiun ${ctx.fixedStation}. Kolom selain nama SDM diganti boleh diisi belakangan.`
          : "Kolom selain stasiun dan nama SDM diganti boleh diisi belakangan."
      }
      footer={
        <>
          <SaveStatus state={status} className="sm:mr-auto" />
          <Button variant="secondary" onClick={close} disabled={pending}>
            Batal
          </Button>
          <Button type="submit" form={formId} loading={pending} loadingText="Menyimpan…">
            Simpan penggantian
          </Button>
        </>
      }
    >
      {open ? (
        <ReplacementForm
          ctx={ctx}
          row={row}
          formId={formId}
          pending={pending}
          onSubmit={save}
          errors={errors}
          setErrors={setErrors}
        />
      ) : null}
    </Dialog>
  );
}

type PageStatus = { state: SaveState; set: (state: SaveState) => void };

const PageStatusContext = createContext<PageStatus | null>(null);

/**
 * Page-level save feedback, shown under "Tambah penggantian". A deleted row takes its
 * card (and that card's own status) with it, so its "Dihapus pukul …" lands here.
 */
export function ReplacementPageStatus({ children }: { children: ReactNode }) {
  const [state, set] = useState<SaveState>({ status: "idle" });
  return <PageStatusContext value={{ state, set }}>{children}</PageStatusContext>;
}

/** Page action: "Tambah penggantian" plus its dialog. */
export function AddReplacementButton({ ctx, label = "Tambah penggantian" }: { ctx: ReplacementContext; label?: string }) {
  const [open, setOpen] = useState(false);
  const [localState, setLocalState] = useState<SaveState>({ status: "idle" });
  const page = use(PageStatusContext);
  const saved = page?.state ?? localState;
  const setSaved = page?.set ?? setLocalState;
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button onClick={() => setOpen(true)}>{label}</Button>
      <SaveStatus state={saved} />
      <ReplacementFormDialog
        ctx={ctx}
        row={null}
        open={open}
        onClose={() => setOpen(false)}
        onSaved={(at) => {
          setOpen(false);
          setSaved({ status: "saved", at });
        }}
      />
    </div>
  );
}

/**
 * "Hapus" for one replacement in the grid (row action) with its confirmation. The row
 * leaves the grid on success, so "Dihapus pukul …" lands in the page status.
 */
export function ReplacementDeleteButton({ ctx, id, name }: { ctx: ReplacementContext; id: number; name: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const page = use(PageStatusContext);

  function remove() {
    startTransition(async () => {
      try {
        const result = await deleteReplacement(ctx.accessKey, id);
        if (result.ok) {
          setOpen(false);
          page?.set({ status: "deleted", at: result.savedAt });
        } else {
          setError(result.error.message);
        }
      } catch {
        setError(CONNECTION_LOST);
      }
    });
  }

  return (
    <>
      <Button
        size="sm"
        variant="quiet"
        tabIndex={-1}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Hapus<span className="sr-only"> penggantian {name}</span>
      </Button>
      <Dialog
        open={open}
        onClose={() => !pending && setOpen(false)}
        dismissible={!pending}
        title={`Hapus penggantian ${name}?`}
        description="Baris ini dihapus dari daftar penggantian. Data SDM-nya sendiri tidak berubah."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Batal
            </Button>
            <Button variant="danger" onClick={remove} loading={pending} loadingText="Menghapus…">
              Hapus penggantian
            </Button>
          </>
        }
      >
        {error ? (
          <p role="alert" className="text-sm font-semibold text-critical">
            Gagal menghapus: {error}
          </p>
        ) : null}
      </Dialog>
    </>
  );
}

/** Card footer: "Ubah" (edit dialog) and "Hapus" (confirmation), with save feedback. */
export function ReplacementRowActions({ ctx, row }: { ctx: ReplacementContext; row: ReplacementFormRow }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [status, setStatus] = useState<SaveState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const page = use(PageStatusContext);

  function remove() {
    setStatus({ status: "saving" });
    startTransition(async () => {
      try {
        const result = await deleteReplacement(ctx.accessKey, row.id);
        if (result.ok) {
          setStatus({ status: "idle" });
          page?.set({ status: "deleted", at: result.savedAt });
        } else {
          setStatus({ status: "error", message: result.error.message });
        }
      } catch {
        setStatus({ status: "error", message: CONNECTION_LOST });
      }
      setDeleteOpen(false);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:justify-end">
      <SaveStatus state={status} />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
          Ubah
        </Button>
        <Button variant="quiet" size="sm" onClick={() => setDeleteOpen(true)}>
          Hapus
        </Button>
      </div>
      <ReplacementFormDialog
        ctx={ctx}
        row={row}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={(at) => {
          setEditOpen(false);
          setStatus({ status: "saved", at });
        }}
      />
      <Dialog
        open={deleteOpen}
        onClose={() => !pending && setDeleteOpen(false)}
        dismissible={!pending}
        title={`Hapus penggantian ${row.replacedName}?`}
        description="Baris ini dihapus dari daftar penggantian. Data SDM-nya sendiri tidak berubah."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={pending}>
              Batal
            </Button>
            <Button variant="danger" onClick={remove} loading={pending} loadingText="Menghapus…">
              Hapus penggantian
            </Button>
          </>
        }
      />
    </div>
  );
}
