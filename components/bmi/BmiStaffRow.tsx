"use client";

import { useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { saveBmiCheck, saveBmiProfile } from "@/components/bmi/actions";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, NumberInput, Select, Textarea, parseDecimal } from "@/components/ui/Field";
import { SaveStatus, type SaveState } from "@/components/ui/SaveStatus";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatTanggal, formatTanggalPendek } from "@/lib/dates";
import { bmi, bmiCategory, type BmiSummary, type Settings } from "@/lib/rules";
import type { LinkError } from "@/lib/workspace/errors";
import { formatDecimal, formatSignedKg, toInputText } from "@/lib/format";
import { hasMoreThanOneDecimal, isPlausibleDate } from "./format";

export type BmiRowStaff = {
  code: string;
  name: string;
  station: string | null;
  gender: string | null;
  bmiNote: string | null;
  assignmentStatus: string | null;
};

export type BmiRowSaved = {
  checkDate: string | null;
  heightCm: number;
  weightKg: number;
  /** "Diubah lewat tautan ini, 8 Okt 14.05". */
  changedLabel: string;
};

type BmiStaffRowProps = {
  accessKey: string;
  period: number;
  plannedDate: string;
  /** Planned dates of every period, index 0 = period 1. */
  plannedDates: string[];
  settings: Settings;
  staff: BmiRowStaff;
  saved: BmiRowSaved | null;
  summary: BmiSummary;
  showStation: boolean;
};

type CheckErrors = { date?: string; height?: string; weight?: string };

const CONNECTION_LOST = "koneksi ke server terputus. Isian Anda masih ada; simpan lagi.";
const HEIGHT_RANGE = "Tinggi harus 120 sampai 210 cm.";
const WEIGHT_RANGE = "Berat harus 30 sampai 200 kg.";

function heightError(raw: string, value: number | null): string | undefined {
  if (value === null) return undefined;
  if (Number.isNaN(value)) return "Tulis angka, misalnya 165,5.";
  if (hasMoreThanOneDecimal(raw)) return "Cukup satu angka di belakang koma.";
  if (value < 120 || value > 210) return HEIGHT_RANGE;
  return undefined;
}

function weightError(raw: string, value: number | null): string | undefined {
  if (value === null) return undefined;
  if (Number.isNaN(value)) return "Tulis angka, misalnya 62,5.";
  if (hasMoreThanOneDecimal(raw)) return "Cukup satu angka di belakang koma.";
  if (value < 30 || value > 200) return WEIGHT_RANGE;
  return undefined;
}

function serverErrors(error: LinkError): CheckErrors {
  if (error.code !== "invalid_input") return {};
  if (error.field === "height_cm") return { height: HEIGHT_RANGE };
  if (error.field === "weight_kg") return { weight: WEIGHT_RANGE };
  if (error.field === "check_date") return { date: "Tanggal cek tidak valid." };
  return {};
}

function hasErrors(errors: CheckErrors): boolean {
  return Boolean(errors.date || errors.height || errors.weight);
}

/**
 * One staff member in the BMI entry list: this period's check (Tgl cek, Tinggi, Berat, live
 * BMI and Kategori, saved per row) and, folded below, L/P, the BB programme note, the latest
 * values and the five-period history. Enter in any field saves the row.
 */
export function BmiStaffRow({
  accessKey,
  period,
  plannedDate,
  plannedDates,
  settings,
  staff,
  saved,
  summary,
  showStation,
}: BmiStaffRowProps) {
  const savedDate = saved?.checkDate ?? plannedDate;
  const [checkDate, setCheckDate] = useState(savedDate);
  const [height, setHeight] = useState(toInputText(saved?.heightCm));
  const [weight, setWeight] = useState(toInputText(saved?.weightKg));
  const [errors, setErrors] = useState<CheckErrors>({});
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [allDone, setAllDone] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const heightValue = parseDecimal(height);
  const weightValue = parseDecimal(weight);
  const liveBmi =
    heightError(height, heightValue) === undefined && weightError(weight, weightValue) === undefined
      ? bmi(heightValue, weightValue)
      : null;
  const liveCategory = bmiCategory(liveBmi, settings);

  const dirty = saved
    ? heightValue !== saved.heightCm || weightValue !== saved.weightKg || checkDate !== savedDate
    : height.trim() !== "" || weight.trim() !== "";

  /** Phone flow at the station: move to the next staff member without a check this period. */
  function jumpToNext() {
    let next = formRef.current?.closest("li[data-bmi-row]")?.nextElementSibling ?? null;
    while (next && next.getAttribute("data-checked") !== "false") next = next.nextElementSibling;
    if (!next) {
      setAllDone(true);
      return;
    }
    next.scrollIntoView({ block: "start" });
    next.querySelector<HTMLInputElement>('input[name="height_cm"]')?.focus({ preventScroll: true });
  }

  function run(
    values: { checkDate: string | null; heightCm: number | null; weightKg: number | null },
    goNext = false,
  ) {
    setSave({ status: "saving" });
    setAllDone(false);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof saveBmiCheck>>;
      try {
        result = await saveBmiCheck(accessKey, { staffCode: staff.code, period, ...values });
      } catch {
        setConfirmOpen(false);
        setSave({ status: "error", message: CONNECTION_LOST });
        return;
      }
      setConfirmOpen(false);
      if (result.ok) {
        setErrors({});
        setSave({ status: result.deleted ? "deleted" : "saved", at: result.savedAt });
        if (result.deleted) setCheckDate(plannedDate);
        else if (goNext) jumpToNext();
        return;
      }
      setErrors(serverErrors(result.error));
      setSave({ status: "error", message: result.error.message });
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    // Enter submits with the first button, "Simpan & berikutnya".
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const goNext = submitter ? submitter.dataset.next === "true" : true;
    const next: CheckErrors = {
      height: heightError(height, heightValue),
      weight: weightError(weight, weightValue),
    };
    const bothEmpty = heightValue === null && weightValue === null;
    if (bothEmpty && !saved) {
      next.height = "Isi tinggi badan.";
      next.weight = "Isi berat badan.";
    } else if (heightValue === null && weightValue !== null) {
      next.height = saved
        ? "Isi juga tinggi badan, atau kosongkan berat untuk menghapus cek ini."
        : "Isi juga tinggi badan.";
    } else if (weightValue === null && heightValue !== null) {
      next.weight = saved
        ? "Isi juga berat badan, atau kosongkan tinggi untuk menghapus cek ini."
        : "Isi juga berat badan.";
    }
    if (!bothEmpty && !checkDate) next.date = "Isi tanggal cek.";
    else if (!bothEmpty && !isPlausibleDate(checkDate)) next.date = "Tanggal cek belum lengkap atau tidak valid.";

    setErrors(next);
    if (hasErrors(next)) {
      setSave({ status: "idle" });
      const form = event.currentTarget;
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    if (bothEmpty) {
      setConfirmOpen(true);
      return;
    }
    run({ checkDate, heightCm: heightValue, weightKg: weightValue }, goNext);
  }

  function edit(field: keyof CheckErrors, apply: () => void) {
    apply();
    if (errors[field]) setErrors({ ...errors, [field]: undefined });
    if (save.status === "saved" || save.status === "error") setSave({ status: "idle" });
  }

  function cancelDelete() {
    if (pending) return;
    setConfirmOpen(false);
    setHeight(toInputText(saved?.heightCm));
    setWeight(toInputText(saved?.weightKg));
  }

  const meta = [staff.code, showStation && staff.station ? `Stasiun ${staff.station}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex scroll-mt-4 flex-col" data-bmi-row="" data-checked={saved ? "true" : "false"}>
      <form
        ref={formRef}
        onSubmit={onSubmit}
        noValidate
        aria-label={`Cek BMI periode ${period}, ${staff.name}`}
        className="grid grid-cols-2 gap-x-3 gap-y-3 px-4 py-4 sm:px-6 md:grid-cols-4 md:gap-x-4 xl:grid-cols-[minmax(12rem,1fr)_10rem_8rem_8rem_minmax(9rem,13rem)_11rem] xl:items-start"
      >
        <div className="col-span-2 flex min-w-0 flex-col gap-1 md:col-span-4 xl:col-span-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="min-w-0 font-semibold text-ink">{staff.name}</p>
            <StatusChip
              label={saved ? "Sudah dicek" : "Belum dicek"}
              tone={saved ? "good" : "neutral"}
            />
            {staff.assignmentStatus && staff.assignmentStatus !== "Aktif" ? (
              <StatusChip label={staff.assignmentStatus} />
            ) : null}
          </div>
          <p className="text-xs text-ink-muted">{meta}</p>
          {staff.bmiNote ? (
            <p className="line-clamp-2 text-xs text-ink">
              <span className="text-ink-muted">Catatan BB: </span>
              {staff.bmiNote}
            </p>
          ) : null}
          {saved ? <p className="text-xs text-ink-muted">{saved.changedLabel}</p> : null}
        </div>

        <Field label="Tgl cek" error={errors.date} className="col-span-2 md:col-span-1">
          <Input
            type="date"
            name="check_date"
            value={checkDate}
            onChange={(e) => edit("date", () => setCheckDate(e.target.value))}
            className="tabular-nums"
          />
        </Field>

        <Field label="Tinggi (cm)" error={errors.height}>
          <NumberInput
            decimal
            unit="cm"
            name="height_cm"
            value={height}
            onChange={(e) => edit("height", () => setHeight(e.target.value))}
          />
        </Field>

        <Field label="Berat (kg)" error={errors.weight}>
          <NumberInput
            decimal
            unit="kg"
            name="weight_kg"
            value={weight}
            onChange={(e) => edit("weight", () => setWeight(e.target.value))}
          />
        </Field>

        <div className="col-span-2 flex min-w-0 flex-col gap-1.5 md:col-span-1">
          <p className="hidden text-sm font-semibold text-ink md:block">BMI dan kategori</p>
          <div className="flex flex-wrap items-center gap-2 md:min-h-10">
            <span className="text-sm font-semibold text-ink md:hidden">BMI</span>
            {liveBmi !== null ? (
              <>
                <span className="text-base font-semibold text-ink tabular-nums">
                  {formatDecimal(liveBmi, 1)}
                </span>
                <StatusChip label={liveCategory} />
              </>
            ) : (
              <span className="text-sm text-ink-muted">muncul setelah tinggi dan berat diisi</span>
            )}
          </div>
        </div>

        <div className="col-span-2 flex flex-col gap-1.5 md:col-span-4 md:flex-row md:items-center md:gap-3 xl:col-span-1 xl:flex-col xl:items-stretch xl:gap-1.5 xl:pt-7">
          <Button type="submit" data-next="true" loading={pending && !confirmOpen} loadingText="Menyimpan…">
            Simpan &amp; berikutnya
          </Button>
          <Button type="submit" variant="secondary" data-next="false" disabled={pending}>
            Simpan
          </Button>
          <div className="flex min-h-5 flex-col">
            <SaveStatus state={save} />
            {allDone ? (
              <span className="text-xs font-semibold text-ink">Semua SDM sesudah ini sudah dicek pada periode ini.</span>
            ) : null}
            {dirty && save.status !== "saving" ? (
              <span className="text-xs text-ink-muted">Ada perubahan yang belum disimpan</span>
            ) : null}
          </div>
        </div>
      </form>

      <BmiProfile
        accessKey={accessKey}
        period={period}
        plannedDates={plannedDates}
        staff={staff}
        summary={summary}
      />

      <Dialog
        open={confirmOpen}
        onClose={cancelDelete}
        dismissible={!pending}
        title={`Hapus cek BMI periode ${period}?`}
        description={`Tinggi dan berat ${staff.name} pada periode ${period} akan dihapus. Periode lain tidak berubah.`}
        footer={
          <>
            <Button variant="secondary" onClick={cancelDelete} disabled={pending}>
              Batal, kembalikan nilai
            </Button>
            <Button
              variant="danger"
              loading={pending}
              loadingText="Menghapus…"
              onClick={() => run({ checkDate: null, heightCm: null, weightKg: null })}
            >
              Hapus cek periode {period}
            </Button>
          </>
        }
      />
    </li>
  );
}

type BmiProfileProps = {
  accessKey: string;
  period: number;
  plannedDates: string[];
  staff: BmiRowStaff;
  summary: BmiSummary;
};

function genderText(gender: string | null): string {
  if (gender === "L") return "L";
  if (gender === "P") return "P";
  return "belum diisi";
}

/** L/P + BB programme note (share_save_profile, both sent), latest values and history. */
function BmiProfile({ accessKey, period, plannedDates, staff, summary }: BmiProfileProps) {
  const savedGender = staff.gender === "L" || staff.gender === "P" ? staff.gender : "";
  const savedNote = staff.bmiNote ?? "";
  const [gender, setGender] = useState(savedGender);
  const [note, setNote] = useState(savedNote);
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const dirty = gender !== savedGender || note.trim() !== savedNote.trim();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setSave({ status: "saving" });
    startTransition(async () => {
      try {
        const result = await saveBmiProfile(accessKey, {
          staffCode: staff.code,
          gender: gender === "L" || gender === "P" ? gender : null,
          bmiNote: note.trim() === "" ? null : note,
        });
        setSave(result.ok ? { status: "saved", at: result.savedAt } : { status: "error", message: result.error.message });
      } catch {
        setSave({ status: "error", message: CONNECTION_LOST });
      }
    });
  }

  const checkCount = summary.periods.filter((p) => p !== null).length;

  return (
    <details className="group border-t border-line">
      <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm sm:px-6">
        <span className="font-semibold text-brand underline-offset-2 group-open:underline">
          Profil, catatan, dan riwayat
        </span>
        <span className="text-xs text-ink-muted">
          L/P: {genderText(staff.gender)} · {checkCount} dari {plannedDates.length} cek tercatat
        </span>
      </summary>

      <div className="grid gap-6 px-4 pt-2 pb-5 sm:px-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-10">
        <form onSubmit={onSubmit} aria-label={`Profil BMI ${staff.name}`} className="flex flex-col gap-3">
          <Field label="L/P" help="Dipakai untuk syarat tinggi badan.">
            <Select value={gender} onChange={(e) => { setGender(e.target.value); if (save.status !== "saving") setSave({ status: "idle" }); }}>
              <option value="">Belum diisi</option>
              <option value="L">L (laki-laki)</option>
              <option value="P">P (perempuan)</option>
            </Select>
          </Field>
          <Field label="Catatan / program penyesuaian BB">
            <Textarea value={note} maxLength={2000} onChange={(e) => { setNote(e.target.value); if (save.status !== "saving") setSave({ status: "idle" }); }} />
          </Field>
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <Button type="submit" variant="secondary" loading={pending} loadingText="Menyimpan…">
              Simpan profil
            </Button>
            <div className="flex flex-col">
              <SaveStatus state={save} />
              {dirty && save.status !== "saving" ? (
                <span className="text-xs text-ink-muted">Ada perubahan yang belum disimpan</span>
              ) : null}
            </div>
          </div>
        </form>

        <div className="flex min-w-0 flex-col gap-4">
          <LatestValues summary={summary} gender={staff.gender} />
          <div className="flex flex-col gap-1">
            <h3 className="section-label">Riwayat {plannedDates.length} periode</h3>
            <ol className="flex flex-col divide-y divide-line">
              {plannedDates.map((planned, i) => {
                const value = summary.periods[i] ?? null;
                const isSelected = i + 1 === period;
                return (
                  <li
                    key={planned}
                    className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-0.5 py-2 text-sm sm:grid-cols-[5.5rem_6.5rem_minmax(0,1fr)]"
                  >
                    <span className={isSelected ? "font-semibold text-ink" : "text-ink"}>
                      Cek {i + 1}
                      {isSelected ? <span className="sr-only"> (periode yang dipilih)</span> : null}
                    </span>
                    <span className="text-ink-muted tabular-nums">
                      {value?.checkDate ? formatTanggal(value.checkDate) : formatTanggalPendek(planned)}
                    </span>
                    {value && value.heightCm !== null && value.weightKg !== null ? (
                      <span className="col-span-2 flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums sm:col-span-1">
                        <span>
                          TB {formatDecimal(value.heightCm, 1)} cm, BB {formatDecimal(value.weightKg, 1)} kg
                          {value.bmi !== null ? `, BMI ${formatDecimal(value.bmi, 1)}` : ""}
                        </span>
                        {value.category ? <StatusChip label={value.category} /> : null}
                      </span>
                    ) : (
                      <span className="col-span-2 text-ink-muted sm:col-span-1">Belum dicek</span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </details>
  );
}

function LatestValues({ summary, gender }: { summary: BmiSummary; gender: string | null }) {
  const weights = summary.periods.filter((p) => p?.weightKg !== null && p?.weightKg !== undefined).length;
  let requirement: ReactNode;
  if (summary.heightRequirement === "Memenuhi" || summary.heightRequirement === "Tidak Memenuhi") {
    requirement = <StatusChip label={summary.heightRequirement} />;
  } else if (summary.latestHeight === null) {
    requirement = <span className="text-ink-muted">Belum ada data tinggi</span>;
  } else if (gender !== "L" && gender !== "P") {
    requirement = <span className="text-ink-muted">Isi L/P dulu</span>;
  } else {
    // The missing height standard is explained once, below the list.
    requirement = <span className="text-ink-muted">Belum bisa dinilai</span>;
  }

  const rows: Array<{ term: string; value: ReactNode }> = [
    {
      term: "Tinggi terakhir",
      value: summary.latestHeight !== null ? `${formatDecimal(summary.latestHeight, 1)} cm` : "Belum ada",
    },
    {
      term: "Berat terakhir",
      value: summary.latestWeight !== null ? `${formatDecimal(summary.latestWeight, 1)} kg` : "Belum ada",
    },
    {
      term: "BMI terakhir",
      value:
        summary.latestBmi !== null ? (
          <span className="inline-flex flex-wrap items-center gap-2">
            {formatDecimal(summary.latestBmi, 1)}
            <StatusChip label={summary.latestCategory} />
          </span>
        ) : (
          "Belum ada"
        ),
    },
    {
      term: "Δ berat sejak cek pertama",
      value:
        summary.weightDelta !== null && weights >= 2 ? (
          `${formatSignedKg(summary.weightDelta)} kg`
        ) : (
          <span className="text-ink-muted">Butuh minimal 2 cek</span>
        ),
    },
    { term: "Syarat tinggi badan", value: requirement },
  ];

  return (
    <dl className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
      {rows.map((row) => (
        <div key={row.term} className="contents">
          <dt className="text-ink-muted">{row.term}</dt>
          <dd className="min-w-0 text-ink tabular-nums">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
