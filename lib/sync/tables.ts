/**
 * Which tables are replicated where. The replica is the imported workbook itself
 * ("Tracker Tindak Lanjut Uplifting JOUMPA"): most tables live in its native tabs and layouts
 * (lib/sync/layouts.ts reads/writes them); only `Temuan Mingguan` is a tab the engine owns.
 *
 * Headers are the workbook's own texts (whitespace-insensitive), so a renamed header is detected.
 * Columns not listed here are never read or written: workbook formulas (Laporan, Rata-rata, Status,
 * BMI, Kategori, Sisa Hari, Flag, ...), and DB-only columns (sort_order, due_rule,
 * replacement_deadline, updated_at, updated_by, updated_by_user, updated_by_link, created_at, ids).
 *
 * Never synced: share_links, admins, stations, sync_* tables.
 */
import { REPORT_GROUPS, STATIONS } from "../rules";
import type { Canon, Column, ColumnType, DataColumn, KvEntry, SyncTable, TableSpec } from "./types";

export { REPORT_GROUPS, STATIONS };

export const GENDERS = ["L", "P"] as const;
export const REPORT_CONCLUSIONS = ["Sesuai", "Sesuai dengan Catatan", "Perlu Perbaikan", "Tidak Sesuai"] as const;
export const ASSIGNMENT_STATUSES = ["Aktif", "Coaching 30 Hari", "Diganti", "Ditarik"] as const;
export const ACTION_KINDS = ["Sekali", "Rutin"] as const;
export const ACTION_STATUSES = ["Belum Mulai", "On Progress", "Selesai", "Tertunda"] as const;
export const YA_BELUM = ["Ya", "Belum"] as const;
export const REPORT_SCOPES = ["SUB", "DPS", "CGK", "HLP", "KNO", "KPS"] as const;

const text = (): ColumnType => ({ kind: "text" });
const int = (min?: number, max?: number): ColumnType => ({ kind: "int", min, max });
const num = (scale: number, min?: number, max?: number): ColumnType => ({ kind: "numeric", scale, min, max });
const date: ColumnType = { kind: "date" };
const oneOf = (values: readonly string[]): ColumnType => ({ kind: "enum", values });

function d(db: string, header: string, type: ColumnType, extra: Partial<DataColumn> = {}): DataColumn {
  return { kind: "data", db, header, type, ...extra };
}

const SCORE_HEADERS: [string, string][] = [
  ["score_a", "A Penampilan"],
  ["score_b", "B Grooming"],
  ["score_c", "C Postur"],
  ["score_d", "D Komunikasi"],
  ["score_e", "E Touch Point"],
  ["score_f", "F B. Inggris & Reservasi"],
];
export const SCORE_COLUMNS = SCORE_HEADERS.map(([db]) => db);
const scores = (): DataColumn[] => SCORE_HEADERS.map(([db, header]) => d(db, header, int(1, 5)));

/** Parameter rows, matched by the label in column B. replacement_deadline is not in the sheet (DB only). */
export const SETTINGS_ENTRIES: KvEntry[] = [
  { key: "week1_start", label: "Tanggal mulai Minggu ke-1 (Senin)", type: date, required: true },
  { key: "weeks", label: "Jumlah minggu pemantauan", type: int(1, 20), required: true },
  { key: "bmi_first_check", label: "Tanggal cek BMI periode 1", type: date, required: true },
  { key: "bmi_interval_days", label: "Interval cek BMI (hari)", type: int(1, 90), required: true },
  { key: "bmi_periods", label: "Jumlah periode cek BMI", type: int(1, 10), required: true },
  { key: "bmi_underweight_below", label: "BMI kategori Kurus jika <", type: num(2, 1, 100), required: true },
  { key: "bmi_normal_max", label: "BMI Normal s.d.", type: num(2, 1, 100), required: true },
  { key: "bmi_overweight_max", label: "BMI Overweight s.d. (di atasnya Obesitas)", type: num(2, 1, 100), required: true },
  { key: "min_height_female", label: "Tinggi minimal petugas Perempuan (cm)", type: num(1, 120, 210) },
  { key: "min_height_male", label: "Tinggi minimal petugas Laki-laki (cm)", type: num(1, 120, 210) },
  { key: "pass_avg_min", label: "Rata-rata praktik minimal SESUAI", type: num(2, 1, 5), required: true },
  { key: "improve_avg_min", label: "Rata-rata praktik minimal PERLU PERBAIKAN", type: num(2, 1, 5), required: true },
  { key: "posttest_min", label: "Post-test minimal", type: num(2, 0, 100), required: true },
];

/** Cross-field CHECKs on public.settings; a violating sheet edit would fail the whole DB write. */
function validateSettings(v: Record<string, Canon>): string | null {
  const n = (k: string) => (typeof v[k] === "number" ? (v[k] as number) : null);
  const [under, normal, over] = [n("bmi_underweight_below"), n("bmi_normal_max"), n("bmi_overweight_max")];
  if (under !== null && normal !== null && over !== null && !(under <= normal && normal <= over)) {
    return "Batas BMI harus berurutan: Kurus < ≤ Normal s.d. ≤ Overweight s.d.";
  }
  const [pass, improve] = [n("pass_avg_min"), n("improve_avg_min")];
  if (pass !== null && improve !== null && improve > pass) {
    return "Rata-rata minimal PERLU PERBAIKAN tidak boleh lebih besar dari minimal SESUAI.";
  }
  return null;
}

const settings: TableSpec = {
  table: "settings",
  tab: "Parameter",
  layout: "parameter",
  key: ["key"],
  kv: { entries: SETTINGS_ENTRIES, validate: validateSettings },
  appendMode: "none",
  noRowMessage: "Baris parameter ini tidak ditemukan di tab Parameter (kolom B). Nilai database dipertahankan.",
  columns: [d("key", "Parameter", text()), d("value", "Nilai", text())],
};

/** Master SDM (rows 5..99, TMB rows have an ID but no name) + BMI note from Cek BMI 2 Mingguan AK. */
const staff: TableSpec = {
  table: "staff",
  tab: "Master SDM",
  layout: "master-sdm",
  key: ["code"],
  emptyRowIsAbsent: true,
  absentUnless: ["name"],
  appendMode: "none",
  noRowMessage: "Kapasitas baris TMB penuh: tidak ada baris dengan ID SDM ini di tab Master SDM. Tambahkan barisnya di workbook.",
  deleteMode: "clear",
  columns: [
    d("code", "ID SDM", text()),
    d("station", "Stasiun", oneOf(STATIONS), { required: true }),
    d("name", "Nama Petugas", text(), { required: true }),
    d("nipp", "NIPP", text()),
    d("gender", "L/P", oneOf(GENDERS)),
    d("pre_test", "Pre-test", num(2, 0, 100)),
    d("post_test", "Post-test", num(2, 0, 100)),
    ...scores(),
    d("report_conclusion", "Kesimpulan di Laporan", oneOf(REPORT_CONCLUSIONS)),
    d("assignment_status", "Status Penugasan", oneOf(ASSIGNMENT_STATUSES), { required: true, defaultValue: "Aktif" }),
    d("notes", "Catatan", text()),
    // Lives in tab "Cek BMI 2 Mingguan", column AK, on the row whose ID SDM matches.
    d("bmi_note", "Catatan / Program Penyesuaian BB", text()),
  ],
};

const weeklyScores: TableSpec = {
  table: "weekly_scores",
  tab: "Log Performa Mingguan",
  layout: "log-performa",
  key: ["staff_code", "week"],
  emptyRowIsAbsent: true,
  appendMode: "blank-row",
  deleteMode: "clear",
  parent: { column: "staff_code", table: "staff" },
  columns: [
    d("week", "Minggu Ke", int(1, 20)),
    d("staff_code", "ID SDM", text()),
    ...scores(),
    d("observer", "Observer / Penilai", text()),
    d("coaching_notes", "Catatan Coaching", text()),
  ],
};

/** Wide in the workbook (one row per staff, periods 1..5 side by side); long in the DB. */
const bmiChecks: TableSpec = {
  table: "bmi_checks",
  tab: "Cek BMI 2 Mingguan",
  layout: "cek-bmi",
  key: ["staff_code", "period"],
  emptyRowIsAbsent: true,
  absentUnless: ["height_cm", "weight_kg"],
  appendMode: "none",
  noRowMessage: 'Tidak ada tempat untuk cek ini di tab "Cek BMI 2 Mingguan" (periode di luar kolom yang ada, atau ID SDM tidak ada).',
  deleteMode: "clear",
  parent: { column: "staff_code", table: "staff" },
  columns: [
    d("staff_code", "ID SDM", text()),
    d("period", "Cek Ke", int(1, 10)),
    d("check_date", "Tgl Cek", date),
    d("height_cm", "Tinggi (cm)", num(1, 120, 210), { required: true }),
    d("weight_kg", "Berat (kg)", num(1, 30, 200), { required: true }),
  ],
};

/** `Batas Waktu` is a TODAY() formula for rolling items: that cell is skipped (due_rule is DB-only). */
const actionItems: TableSpec = {
  table: "action_items",
  tab: "Tindak Lanjut",
  layout: "tindak-lanjut",
  key: ["code"],
  emptyRowIsAbsent: true,
  appendMode: "blank-row",
  deleteMode: "clear",
  columns: [
    d("code", "ID", text()),
    d("report_group", "Laporan", oneOf(REPORT_GROUPS), { required: true }),
    d("area", "Area", text()),
    d("action", "Tindakan", text()),
    d("target", "Target / Indikator", text()),
    d("kind", "Jenis", oneOf(ACTION_KINDS)),
    d("schedule", "Jadwal", text()),
    d("due_date", "Batas Waktu", date),
    d("pic", "PIC", text()),
    d("status", "Status", oneOf(ACTION_STATUSES), { required: true, defaultValue: "Belum Mulai" }),
    // Sheet holds a fraction (0..1, formatted 0%); the DB holds 0..100. Scaled by the layout.
    d("progress", "% Progres", int(0, 100), { required: true, defaultValue: 0 }),
    d("updated_on", "Tgl Update", date),
    d("evidence", "Realisasi / Bukti", text()),
    d("kps_notes", "Catatan KPS", text()),
  ],
};

/** Rows 5..44 are pre-numbered slots. `ID Sistem` and `ID SDM` are added by the engine (P, Q). */
const replacements: TableSpec = {
  table: "replacements",
  tab: "Penggantian SDM",
  layout: "penggantian",
  key: ["id"],
  generatedKey: true,
  emptyRowIsAbsent: true,
  adoptBy: ["station", "replaced_name"],
  refs: [{ column: "staff_code", table: "staff" }],
  appendMode: "blank-row",
  deleteMode: "clear",
  columns: [
    d("id", "ID Sistem", int(1), { hidden: true }),
    d("report_group", "Laporan", oneOf(REPORT_GROUPS)),
    d("station", "Stasiun", oneOf(STATIONS)),
    d("replaced_name", "Nama SDM Diganti", text(), { required: true }),
    d("reason", "Alasan / Dasar", text()),
    d("withdrawn_on", "Tgl Ditarik", date),
    d("replacement_name", "Nama SDM Pengganti", text()),
    d("effective_on", "Tgl Efektif", date),
    d("training_on", "Tgl Training", date),
    d("post_test", "Post-test", num(2, 0, 100)),
    d("practice_avg", "Rata-rata Praktik", num(2, 1, 5)),
    d("reported", "Dilaporkan ke OAO/Direksi", oneOf(YA_BELUM)),
    d("notes", "Catatan", text()),
    d("staff_code", "ID SDM", text()),
  ],
};

/** The only tab the engine creates (row-1 header). One findings text per week and link scope. */
const weeklyReports: TableSpec = {
  table: "weekly_reports",
  tab: "Temuan Mingguan",
  key: ["week", "scope"],
  columns: [d("week", "Minggu Ke", int(1, 20)), d("scope", "Lingkup", oneOf(REPORT_SCOPES)), d("findings", "Temuan", text())],
};

/** Processing order: parents before children. Deletes run in reverse. */
export const SYNC_TABLES: TableSpec[] = [
  settings,
  staff,
  weeklyScores,
  bmiChecks,
  actionItems,
  replacements,
  weeklyReports,
];

/** Tabs the engine must never touch. */
export const UNTOUCHED_TABS = ["Petunjuk", "Dashboard", "Rekap Performa", "Laporan Mingguan"];

export function specFor(table: SyncTable, specs: TableSpec[] = SYNC_TABLES): TableSpec {
  const s = specs.find((t) => t.table === table);
  if (!s) throw new Error(`unknown sync table ${table}`);
  return s;
}

/**
 * The same tables as plain row-1 tabs (no workbook layout, rows appended and deleted normally).
 * Used by the merge-engine tests; data semantics (keys, types, absence rules) are unchanged.
 */
export function rowOneSpecs(specs: TableSpec[] = SYNC_TABLES): TableSpec[] {
  return specs.map((s) => ({ ...s, layout: undefined, appendMode: undefined, deleteMode: undefined }));
}

export const dataColumns = (spec: TableSpec): DataColumn[] => spec.columns;
export const nonKeyDataColumns = (spec: TableSpec): DataColumn[] =>
  dataColumns(spec).filter((c) => !spec.key.includes(c.db));
export const columnId = (c: Column): string => c.db;
