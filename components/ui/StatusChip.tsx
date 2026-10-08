import type {
  ActionFlag,
  ActionKind,
  ActionStatus,
  AssignmentStatus,
  BmiCategory,
  Consistency,
  CriteriaStatus,
  HeightRequirement,
  ReplacementPass,
  ReplacementTimeliness,
  ReportConclusion,
  Reported,
  Trend,
} from "@/lib/rules";
import { cx } from "./cx";

export type StatusTone = "good" | "warning" | "critical" | "progress" | "neutral";

/** Every status label lib/rules.ts can produce (the workbook's own wording). */
export type RuleStatusLabel =
  | ReportConclusion
  | CriteriaStatus
  | Consistency
  | BmiCategory
  | HeightRequirement
  | ActionStatus
  | ActionKind
  | ActionFlag
  | ReplacementPass
  | ReplacementTimeliness
  | Reported
  | AssignmentStatus
  | Trend;

/*
 * Tone per label, following the workbook's colour code (Petunjuk: hijau / oranye /
 * merah) as transcribed in DESIGN.md. `satisfies` makes this exhaustive: if
 * lib/rules.ts adds or renames a label, the build fails here until it gets a tone.
 * "Lewat <tanggal>" (late replacement) is matched by prefix below.
 */
const RULE_TONES = {
  // Kesimpulan laporan, status kriteria 6.2, status mingguan
  Sesuai: "good",
  "Sesuai dengan Catatan": "good",
  "Perlu Perbaikan": "warning",
  "Tidak Sesuai": "critical",
  // Konsistensi kesimpulan vs kriteria
  OK: "good",
  "Beda – verifikasi": "warning",
  // Kategori BMI
  Kurus: "warning",
  Normal: "good",
  Overweight: "warning",
  Obesitas: "critical",
  // Syarat tinggi badan
  Memenuhi: "good",
  "Tidak Memenuhi": "critical",
  "Isi standar di Parameter": "neutral",
  // Status dan jenis tindak lanjut
  "Belum Mulai": "neutral",
  "On Progress": "progress",
  Selesai: "good",
  Tertunda: "neutral",
  Sekali: "neutral",
  Rutin: "progress",
  // Flag tindak lanjut
  OVERDUE: "critical",
  "Jatuh tempo ≤ 7 hari": "warning",
  "Rutin – pantau": "progress",
  "On Track": "good",
  // Penggantian SDM
  "Lulus – boleh bertugas": "good",
  "Belum lulus": "critical",
  "Belum training/dinilai": "neutral",
  "Tepat waktu": "good",
  Menunggu: "warning",
  Ya: "good",
  Belum: "warning",
  // Status penugasan (the default "Aktif" stays quiet so exceptions stand out)
  Aktif: "neutral",
  "Coaching 30 Hari": "progress",
  Diganti: "neutral",
  Ditarik: "critical",
  // Tren nilai
  "▲ Naik": "good",
  "▼ Turun": "warning",
  "= Tetap": "neutral",
} satisfies Record<Exclude<RuleStatusLabel, `Lewat ${string}`>, StatusTone>;

const TONE_BY_LABEL = new Map<string, StatusTone>(
  Object.entries(RULE_TONES).map(([label, tone]) => [normalise(label), tone]),
);

function normalise(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Tone for a status label. Unknown labels are "neutral". */
export function toneForStatus(label: string | null | undefined): StatusTone {
  if (!label) return "neutral";
  const key = normalise(label);
  if (key.startsWith("lewat ")) return "critical";
  return TONE_BY_LABEL.get(key) ?? "neutral";
}

const toneClasses: Record<StatusTone, string> = {
  good: "bg-good-tint text-good", // 5.7:1
  warning: "bg-warning-tint text-warning", // 6.1:1
  critical: "bg-critical-tint text-critical", // 6.3:1
  progress: "bg-progress-tint text-progress", // 5.6:1
  neutral: "bg-neutral-tint text-neutral", // 5.8:1
};

type StatusChipProps = {
  /** The status text from lib/rules (or the DB), shown as-is. Status is never colour alone. */
  label: string | null | undefined;
  /** Override the looked-up tone (rarely needed). */
  tone?: StatusTone;
  /** Text shown when label is empty. */
  emptyLabel?: string;
  /**
   * 1 px border in the tone's colour. Use inside DataGrid: the yellow input tint is almost
   * as light as the warning tint, so a chip there needs an edge (DESIGN.md --input-tint).
   */
  bordered?: boolean;
  className?: string;
};

const borderClasses: Record<StatusTone, string> = {
  good: "border border-good",
  warning: "border border-warning",
  critical: "border border-critical",
  progress: "border border-progress",
  neutral: "border border-neutral",
};

/** Status label on its tone's tint, 6 px radius. Server-component friendly. */
export function StatusChip({ label, tone, emptyLabel = "Belum ada data", bordered = false, className }: StatusChipProps) {
  const hasLabel = Boolean(label && label.trim() !== "");
  const resolved = tone ?? (hasLabel ? toneForStatus(label) : "neutral");
  return (
    <span
      className={cx(
        "inline-flex max-w-full items-center rounded-control px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        toneClasses[resolved],
        bordered && borderClasses[resolved],
        className,
      )}
    >
      {hasLabel ? label : emptyLabel}
    </span>
  );
}
