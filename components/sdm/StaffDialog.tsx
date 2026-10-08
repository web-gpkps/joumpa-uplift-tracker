"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { staffBaseline, type Settings } from "@/lib/rules";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Field, Input, NumberInput, Select, Textarea, parseDecimal } from "@/components/ui/Field";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatDecimal, formatScore } from "@/lib/format";
import { ASPECTS, parseScore } from "@/components/performa/format";
import type { StaffBaselineInput } from "@/components/sdm/actions";
import { ASSIGNMENT_STATUSES, REPORT_CONCLUSIONS, type SaveStaffAction, type SdmRow } from "./types";

type StaffDialogProps = {
  open: boolean;
  onClose: () => void;
  /** null = "Tambah SDM". */
  row: SdmRow | null;
  /** Changes on every open so the form starts from the row's current values. */
  formKey: string;
  accessKey: string;
  isKps: boolean;
  /** Station of a station link; null for KPS (the person picks one when adding). */
  ownStation: string | null;
  stations: string[];
  settings: Settings;
  saveAction: SaveStaffAction;
  onSaved: (message: string) => void;
  /** Owner only: "Hapus SDM" in the edit form (the keyboard path to the delete confirmation). */
  onDelete?: (row: SdmRow) => void;
};

/**
 * Add or edit one staff member. Station links edit name, NIPP, L/P, assignment status
 * and notes; a KPS link also edits the training baseline. Client component.
 */
export function StaffDialog(props: StaffDialogProps) {
  const { open, onClose, row } = props;
  const [saving, setSaving] = useState(false);
  const adding = row === null;

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      dismissible={!saving}
      size="md"
      title={adding ? "Tambah SDM" : `Ubah data ${row.name}`}
      description={
        adding
          ? "Untuk SDM yang belum ikut pelatihan atau SDM pengganti. Kode TMB dibuat otomatis saat disimpan."
          : `${row.code}, Stasiun ${row.station}. ${row.changedLabel}.`
      }
    >
      {open ? <StaffForm key={props.formKey} {...props} onSavingChange={setSaving} /> : null}
    </Dialog>
  );
}

type Errors = Partial<Record<string, string>>;

function baselineDraft(row: SdmRow | null) {
  return {
    preTest: row?.preTest == null ? "" : formatDecimal(row.preTest, 0, 2),
    postTest: row?.postTest == null ? "" : formatDecimal(row.postTest, 0, 2),
    scores: ASPECTS.map((_, i) => (row?.scores[i] == null ? "" : String(row.scores[i]))),
    reportConclusion: row?.reportConclusion ?? "",
  };
}

function StaffForm({
  row,
  accessKey,
  isKps,
  ownStation,
  stations,
  settings,
  saveAction,
  onSaved,
  onClose,
  onDelete,
  onSavingChange,
}: StaffDialogProps & { onSavingChange: (saving: boolean) => void }) {
  const id = useId();
  const formId = `${id}-form`;
  const adding = row === null;
  const [station, setStation] = useState(ownStation ?? "");
  const [name, setName] = useState(row?.name ?? "");
  const [nipp, setNipp] = useState(row?.nipp ?? "");
  const [gender, setGender] = useState(row?.gender ?? "");
  const [status, setStatus] = useState(row?.assignmentStatus ?? "Aktif");
  const [notes, setNotes] = useState(row?.notes ?? "");
  const original = baselineDraft(row);
  const [baseline, setBaseline] = useState(original);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [focusRequest, setFocusRequest] = useState(0);

  // After a failed check, move focus to the first marked field (once it is rendered as invalid).
  useEffect(() => {
    if (focusRequest === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusRequest]);

  const editBaseline = isKps && !adding;
  const pre = parseDecimal(baseline.preTest);
  const post = parseDecimal(baseline.postTest);
  const parsedScores = baseline.scores.map(parseScore);
  const preview = staffBaseline(
    {
      scoreA: num(parsedScores[0]),
      scoreB: num(parsedScores[1]),
      scoreC: num(parsedScores[2]),
      scoreD: num(parsedScores[3]),
      scoreE: num(parsedScores[4]),
      scoreF: num(parsedScores[5]),
      postTest: post !== null && Number.isFinite(post) ? post : null,
      reportConclusion: baseline.reportConclusion || null,
    },
    settings,
  );

  function setBusy(value: boolean) {
    setSaving(value);
    onSavingChange(value);
  }

  function validate(): { errors: Errors; baselineInput: StaffBaselineInput | null } {
    const next: Errors = {};
    if (adding && isKps && !station) next.station = "Pilih stasiun SDM ini.";
    if (name.trim() === "") next.name = "Nama wajib diisi.";
    if (nipp.trim().length > 50) next.nipp = "NIPP paling panjang 50 karakter.";
    let baselineInput: StaffBaselineInput | null = null;
    if (editBaseline) {
      const testOk = (v: number | null) => v === null || (Number.isFinite(v) && v >= 0 && v <= 100);
      if (!testOk(pre)) next.pre_test = "Isi angka 0 sampai 100, atau kosongkan.";
      if (!testOk(post)) next.post_test = "Isi angka 0 sampai 100, atau kosongkan.";
      parsedScores.forEach((p, i) => {
        if (p === "invalid") next[`score_${"abcdef"[i]}`] = "Angka bulat 1 sampai 5.";
      });
      const changed =
        baseline.preTest.trim() !== original.preTest ||
        baseline.postTest.trim() !== original.postTest ||
        baseline.reportConclusion !== original.reportConclusion ||
        baseline.scores.some((s, i) => s.trim() !== original.scores[i]);
      if (changed) {
        baselineInput = {
          preTest: pre,
          postTest: post,
          scores: parsedScores.map(num),
          reportConclusion: baseline.reportConclusion || null,
        };
      }
    }
    return { errors: next, baselineInput };
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const { errors: found, baselineInput } = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      setFormError("Periksa kolom yang ditandai.");
      setFocusRequest((n) => n + 1);
      return;
    }
    setBusy(true);
    try {
      const result = await saveAction(accessKey, {
        code: row?.code ?? null,
        station: adding ? station || null : null,
        name,
        nipp,
        gender: gender === "L" || gender === "P" ? gender : null,
        assignmentStatus: status,
        notes,
        baseline: baselineInput,
      });
      if (result.ok) {
        setBusy(false);
        onSaved(
          adding
            ? `${result.code} ${result.name} ditambahkan.`
            : `Data ${result.code} ${result.name} tersimpan.`,
        );
        onClose();
        return;
      }
      const message = result.saved
        ? `Data profil tersimpan, tetapi data pelatihan gagal disimpan: ${result.error.message}`
        : result.error.message;
      if (result.error.field) {
        setErrors({ [result.error.field]: result.error.message });
        setFocusRequest((n) => n + 1);
      }
      setFormError(message);
    } catch {
      setFormError("Koneksi ke server terputus. Isian Anda masih ada; coba simpan lagi.");
    }
    setBusy(false);
  }

  const selectedStation = adding ? (ownStation ?? station) : row.station;

  return (
    <form ref={formRef} id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {formError ? (
        <p role="alert" className="rounded-control bg-critical-tint px-3 py-2 text-sm font-medium text-critical">
          {formError}
        </p>
      ) : null}

      {adding ? (
        isKps ? (
          <Field label="Stasiun" required error={errors.station}>
            <Select value={station} onChange={(e) => setStation(e.target.value)}>
              <option value="">Pilih stasiun</option>
              {stations.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <p className="text-sm text-ink">
            <span className="font-semibold">Stasiun:</span> {selectedStation}
          </p>
        )
      ) : null}

      <Field label="Nama" required error={errors.name}>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoComplete="off" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="NIPP" error={errors.nipp} help={row?.duplicateNippWith.length ? `Sama dengan ${row.duplicateNippWith.join(", ")}` : undefined}>
          <Input value={nipp} onChange={(e) => setNipp(e.target.value)} maxLength={50} autoComplete="off" inputMode="numeric" />
        </Field>
        <Field label="L/P" help="Dipakai untuk syarat tinggi badan di halaman BMI." error={errors.gender}>
          <Select value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">Belum diisi</option>
            <option value="L">L (laki-laki)</option>
            <option value="P">P (perempuan)</option>
          </Select>
        </Field>
      </div>

      <Field label="Status penugasan" error={errors.assignment_status}>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          {ASSIGNMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Catatan" error={errors.notes}>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} rows={3} />
      </Field>

      {editBaseline ? (
        <fieldset className="flex flex-col gap-4 rounded-panel border border-line p-4">
          <legend className="px-1 text-sm font-semibold text-ink">Data pelatihan (hanya tautan KPS)</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Pre-test" error={errors.pre_test} help="Angka 0 sampai 100.">
              <NumberInput
                decimal
                value={baseline.preTest}
                onChange={(e) => setBaseline({ ...baseline, preTest: e.target.value })}
              />
            </Field>
            <Field label="Post-test" error={errors.post_test} help={`Lulus bila ${formatDecimal(settings.posttestMin, 0, 2)} atau lebih.`}>
              <NumberInput
                decimal
                value={baseline.postTest}
                onChange={(e) => setBaseline({ ...baseline, postTest: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {ASPECTS.map((aspect, i) => (
              <Field key={aspect.key} label={`${aspect.letter} ${aspect.name}`} error={errors[aspect.field]} className="justify-end">
                <NumberInput
                  alignEnd={false}
                  className="text-center"
                  value={baseline.scores[i]}
                  onChange={(e) =>
                    setBaseline({
                      ...baseline,
                      scores: baseline.scores.map((s, j) => (j === i ? e.target.value : s)),
                    })
                  }
                  aria-invalid={parsedScores[i] === "invalid" || undefined}
                />
              </Field>
            ))}
          </div>
          <Field label="Kesimpulan di laporan" error={errors.report_conclusion}>
            <Select
              value={baseline.reportConclusion}
              onChange={(e) => setBaseline({ ...baseline, reportConclusion: e.target.value })}
            >
              <option value="">Belum diisi</option>
              {REPORT_CONCLUSIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-3" aria-live="polite">
            <div>
              <dt className="section-label">Rata-rata praktik</dt>
              <dd className="font-semibold tabular-nums">{formatScore(preview.practiceAvg) || "Belum ada nilai"}</dd>
            </div>
            <div>
              <dt className="section-label">Status kriteria 6.2</dt>
              <dd>
                <StatusChip label={preview.criteriaStatus} />
              </dd>
            </div>
            <div>
              <dt className="section-label">Cek konsistensi</dt>
              <dd>
                <StatusChip label={preview.consistency} emptyLabel="Belum bisa dicek" />
              </dd>
            </div>
          </dl>
        </fieldset>
      ) : !adding ? (
        <p className="text-sm text-ink-muted">
          Data pelatihan (pre/post-test, nilai A sampai F, kesimpulan laporan) hanya bisa diubah lewat tautan KPS.
        </p>
      ) : null}

      <DialogActions>
        {onDelete && row ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              onClose();
              onDelete(row);
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-control px-3 text-sm font-semibold text-critical transition-colors duration-150 hover:bg-critical-tint sm:mr-auto sm:min-h-10"
          >
            Hapus SDM
          </button>
        ) : null}
        <Button variant="secondary" onClick={onClose} disabled={saving}>
          Batal
        </Button>
        <Button type="submit" loading={saving} loadingText={adding ? "Menambahkan…" : "Menyimpan…"}>
          {adding ? "Tambah SDM" : "Simpan data SDM"}
        </Button>
      </DialogActions>
    </form>
  );
}

function num(value: number | null | "invalid"): number | null {
  return value === "invalid" ? null : value;
}
