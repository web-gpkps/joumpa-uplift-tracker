/**
 * Parameter (public.settings, id = 1): labels and help from the workbook's sheet
 * "Parameter" (columns B and D), and validation that mirrors the table's CHECK
 * constraints (supabase/migrations/*_stations_settings.sql), so the form says what the
 * database would refuse before it is sent. Pure: used by the form and the Server Action.
 */
import { parseDecimal } from "@/components/ui/Field";

export type SettingKey =
  | "week1_start"
  | "weeks"
  | "bmi_first_check"
  | "bmi_interval_days"
  | "bmi_periods"
  | "bmi_underweight_below"
  | "bmi_normal_max"
  | "bmi_overweight_max"
  | "min_height_female"
  | "min_height_male"
  | "pass_avg_min"
  | "improve_avg_min"
  | "posttest_min"
  | "replacement_deadline";

export type SettingKind = "date" | "int" | "decimal" | "optional-decimal";

export type SettingField = {
  key: SettingKey;
  kind: SettingKind;
  /** Column B of sheet Parameter. */
  label: string;
  /** Column D ("Keterangan / sumber"), plus the allowed range. */
  help: string;
  unit?: string;
};

export type SettingSection = { id: string; title: string; description?: string; fields: SettingField[] };

export const SETTING_SECTIONS: SettingSection[] = [
  {
    id: "jadwal",
    title: "Jadwal pemantauan",
    fields: [
      {
        key: "week1_start",
        kind: "date",
        label: "Tanggal mulai Minggu ke-1 (Senin)",
        help: "Minggu pertama setelah laporan training dikirim (1–3 Okt 2026).",
      },
      {
        key: "weeks",
        kind: "int",
        label: "Jumlah minggu pemantauan",
        help: "Mg 1 (12 Okt) s.d. Mg 10 (14 Des), mencakup evaluasi ulang KPS minggu ke-2 Des 2026. Rentang 1 sampai 20.",
        unit: "minggu",
      },
    ],
  },
  {
    id: "cek-bmi",
    title: "Cek BMI",
    fields: [
      {
        key: "bmi_first_check",
        kind: "date",
        label: "Tanggal cek BMI periode 1",
        help: "Cek BMI, tinggi & berat badan.",
      },
      {
        key: "bmi_interval_days",
        kind: "int",
        label: "Interval cek BMI (hari)",
        help: "Per 2 minggu sesuai permintaan. Rentang 1 sampai 90 hari.",
        unit: "hari",
      },
      {
        key: "bmi_periods",
        kind: "int",
        label: "Jumlah periode cek BMI",
        help: "12 Okt, 26 Okt, 9 Nov, 23 Nov, 7 Des 2026. Rentang 1 sampai 10.",
        unit: "kali",
      },
    ],
  },
  {
    id: "klasifikasi-bmi",
    title: "Klasifikasi BMI",
    description: "Harus berurutan: batas Kurus ≤ batas Normal ≤ batas Overweight ≤ 100.",
    fields: [
      {
        key: "bmi_underweight_below",
        kind: "decimal",
        label: "BMI kategori Kurus jika <",
        help: "Klasifikasi IMT Kemenkes RI (P2PTM): Kurus <18,5.",
      },
      { key: "bmi_normal_max", kind: "decimal", label: "BMI Normal s.d.", help: "Normal 18,5–25,0." },
      {
        key: "bmi_overweight_max",
        kind: "decimal",
        label: "BMI Overweight s.d. (di atasnya Obesitas)",
        help: "Gemuk/Overweight >25,0–27,0; Obesitas >27,0.",
      },
    ],
  },
  {
    id: "tinggi-badan",
    title: "Syarat tinggi badan",
    fields: [
      {
        key: "min_height_female",
        kind: "optional-decimal",
        label: "Tinggi minimal petugas Perempuan (cm)",
        help: "Isi sesuai ketentuan rekrutmen/spesifikasi JOUMPA. Dibiarkan kosong karena standar belum tercantum di laporan. Rentang 120 sampai 210 cm.",
        unit: "cm",
      },
      {
        key: "min_height_male",
        kind: "optional-decimal",
        label: "Tinggi minimal petugas Laki-laki (cm)",
        help: "Isi sesuai ketentuan rekrutmen/spesifikasi JOUMPA. Rentang 120 sampai 210 cm.",
        unit: "cm",
      },
    ],
  },
  {
    id: "kelulusan",
    title: "Kriteria kelulusan",
    fields: [
      {
        key: "pass_avg_min",
        kind: "decimal",
        label: "Rata-rata praktik minimal Sesuai",
        help: "Kriteria kelulusan butir 6.2 laporan. Rentang 1 sampai 5.",
      },
      {
        key: "improve_avg_min",
        kind: "decimal",
        label: "Rata-rata praktik minimal Perlu Perbaikan",
        help: "Di bawah ini = Tidak Sesuai Spesifikasi. Rentang 1 sampai 5, tidak boleh di atas batas Sesuai.",
      },
      {
        key: "posttest_min",
        kind: "decimal",
        label: "Post-test minimal",
        help: "Kriteria kelulusan butir 6.2 laporan (SUB tidak ada post-test). Rentang 0 sampai 100.",
      },
    ],
  },
  {
    id: "penggantian",
    title: "Penggantian SDM",
    fields: [
      {
        key: "replacement_deadline",
        kind: "date",
        label: "Batas waktu penggantian SDM",
        help: "Lembar komitmen di sheet Penggantian SDM: batas 31 Oktober 2026. Dipakai untuk status Ketepatan Waktu.",
      },
    ],
  },
];

export const SETTING_FIELDS: SettingField[] = SETTING_SECTIONS.flatMap((s) => s.fields);

export type SettingsValues = Record<SettingKey, string>;
export type SettingsErrors = Partial<Record<SettingKey, string>>;

export type SettingsUpdate = {
  week1_start: string;
  weeks: number;
  bmi_first_check: string;
  bmi_interval_days: number;
  bmi_periods: number;
  bmi_underweight_below: number;
  bmi_normal_max: number;
  bmi_overweight_max: number;
  min_height_female: number | null;
  min_height_male: number | null;
  pass_avg_min: number;
  improve_avg_min: number;
  posttest_min: number;
  replacement_deadline: string;
};

/** A DB row value as the form shows it: dates as-is, decimals with a comma ("18,5"). */
export function toFormValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return typeof value === "number" ? String(value).replace(".", ",") : value;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** True for a valid date that is not a Monday (the workbook schedules both on Mondays). */
export function notMonday(value: string): boolean {
  return isIsoDate(value) && new Date(`${value}T00:00:00Z`).getUTCDay() !== 1;
}

function between(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

/** Parses and checks every field; `update` is set only when there are no errors. */
export function validateSettings(values: SettingsValues): { errors: SettingsErrors; update: SettingsUpdate | null } {
  const errors: SettingsErrors = {};
  const out: Partial<Record<SettingKey, string | number | null>> = {};

  for (const field of SETTING_FIELDS) {
    const raw = (values[field.key] ?? "").trim();
    if (field.kind === "date") {
      if (raw === "") errors[field.key] = "Wajib diisi.";
      else if (!isIsoDate(raw)) errors[field.key] = "Tanggal tidak valid.";
      else out[field.key] = raw;
      continue;
    }
    const n = parseDecimal(raw);
    if (n === null) {
      if (field.kind === "optional-decimal") out[field.key] = null;
      else errors[field.key] = "Wajib diisi.";
      continue;
    }
    if (Number.isNaN(n)) {
      errors[field.key] = "Isi angka, misalnya 18,5.";
      continue;
    }
    if (field.kind === "int" && !Number.isInteger(n)) {
      errors[field.key] = "Isi bilangan bulat.";
      continue;
    }
    out[field.key] = n;
  }

  const num = (k: SettingKey) => (typeof out[k] === "number" ? (out[k] as number) : null);
  const check = (k: SettingKey, ok: boolean, message: string) => {
    if (!errors[k] && num(k) !== null && !ok) errors[k] = message;
  };

  check("weeks", between(num("weeks") ?? 0, 1, 20), "Isi 1 sampai 20 minggu.");
  check("bmi_interval_days", between(num("bmi_interval_days") ?? 0, 1, 90), "Isi 1 sampai 90 hari.");
  check("bmi_periods", between(num("bmi_periods") ?? 0, 1, 10), "Isi 1 sampai 10 periode.");

  const under = num("bmi_underweight_below");
  const normal = num("bmi_normal_max");
  const over = num("bmi_overweight_max");
  check("bmi_underweight_below", (under ?? 0) > 0, "Harus lebih dari 0.");
  if (under !== null && normal !== null) {
    check("bmi_underweight_below", under <= normal, "Tidak boleh di atas batas Normal.");
  }
  if (normal !== null && over !== null) {
    check("bmi_normal_max", normal <= over, "Tidak boleh di atas batas Overweight.");
  }
  check("bmi_overweight_max", (over ?? 0) <= 100, "Tidak boleh di atas 100.");

  for (const k of ["min_height_female", "min_height_male"] as const) {
    check(k, between(num(k) ?? 0, 120, 210), "Isi 120 sampai 210 cm, atau kosongkan.");
  }

  const pass = num("pass_avg_min");
  const improve = num("improve_avg_min");
  check("pass_avg_min", between(pass ?? 0, 1, 5), "Isi 1 sampai 5.");
  check("improve_avg_min", between(improve ?? 0, 1, 5), "Isi 1 sampai 5.");
  if (pass !== null && improve !== null) {
    check("improve_avg_min", improve <= pass, "Tidak boleh di atas rata-rata minimal Sesuai.");
  }
  check("posttest_min", between(num("posttest_min") ?? -1, 0, 100), "Isi 0 sampai 100.");

  if (Object.keys(errors).length > 0) return { errors, update: null };
  return { errors, update: out as SettingsUpdate };
}
