/*
 * Tindak Lanjut view model. Every number and label comes from lib/rules.ts
 * (effectiveDueDate, actionDaysLeft, actionFlag); this file only shapes the rows
 * for the screen: which link last changed them, how urgent they are, how the
 * due date reads. Pure and server-safe (the page derives, the client filters).
 */
import { formatTanggal } from "@/lib/dates";
import { relativeDays } from "@/lib/format";
import {
  actionDaysLeft,
  actionFlag,
  effectiveDueDate,
  type ActionFlag,
  type DueRule,
  type IsoDate,
  type Settings,
} from "@/lib/rules";
import type { Workspace, WorkspaceActionItem } from "@/lib/workspace";
import { changedVia, lastChangedLabel } from "@/lib/workspace/view";

export const ACTION_STATUSES = ["Belum Mulai", "On Progress", "Selesai", "Tertunda"] as const;
export type ActionStatusValue = (typeof ACTION_STATUSES)[number];

export const ACTION_KINDS = ["Sekali", "Rutin"] as const;

export const DUE_RULES = ["bulanan-tgl-5", "cek-bmi-berikutnya", "jumat-berikutnya"] as const;

/** Short name of a rolling due date, as shown next to the computed date. */
export const DUE_RULE_LABEL: Record<DueRule, string> = {
  "bulanan-tgl-5": "Tanggal 5 berikutnya",
  "cek-bmi-berikutnya": "Cek BMI berikutnya",
  "jumat-berikutnya": "Jumat berikutnya",
};

/** Longer wording for the KPS select: which workbook item uses the rule. */
export const DUE_RULE_OPTION: Record<DueRule, string> = {
  "bulanan-tgl-5": "Tanggal 5 berikutnya (laporan progres bulanan)",
  "cek-bmi-berikutnya": "Cek BMI berikutnya (per 2 minggu)",
  "jumat-berikutnya": "Jumat berikutnya (laporan mingguan)",
};

export function asDueRule(value: string | null | undefined): DueRule | null {
  return (DUE_RULES as readonly string[]).includes(value ?? "") ? (value as DueRule) : null;
}

export type ActionView = {
  code: string;
  reportGroup: string;
  area: string | null;
  action: string | null;
  target: string | null;
  kind: string | null;
  schedule: string | null;
  pic: string | null;
  /** Column due_date ("Batas waktu tetap"). */
  dueDate: IsoDate | null;
  dueRule: DueRule | null;
  /** effectiveDueDate(): the rule's date today, else dueDate. */
  effectiveDue: IsoDate | null;
  /** "Jumat berikutnya (16 Okt 2026)", "31 Okt 2026" or null. */
  dueLabel: string | null;
  daysLeft: number | null;
  flag: ActionFlag | null;
  status: string;
  progress: number;
  updatedOn: IsoDate | null;
  evidence: string | null;
  kpsNotes: string | null;
  sortOrder: number;
  /** 0 OVERDUE, 1 due within 7 days, 2 on track / routine, 3 no due date, 4 done. */
  urgency: number;
  /** "tautan ini", another link's label, or "pemilik / Google Sheet". */
  lastChangedBy: string;
  /** "Diubah lewat tautan ini, 8 Okt 14.05". */
  changedLabel: string;
  updatedAt: string;
};

function urgencyOf(flag: ActionFlag | null): number {
  if (flag === "OVERDUE") return 0;
  if (flag === "Jatuh tempo ≤ 7 hari") return 1;
  if (flag === "Selesai") return 4;
  if (flag === null) return 3;
  return 2;
}

export function toActionView(
  item: WorkspaceActionItem,
  s: Settings,
  today: IsoDate,
  ws: Pick<Workspace, "linkId" | "linkLabels">,
): ActionView {
  const dueRule = asDueRule(item.dueRule);
  const ruleRow = { dueDate: item.dueDate, schedule: item.schedule, dueRule, status: item.status, kind: item.kind };
  const effectiveDue = effectiveDueDate(ruleRow, s, today);
  const flag = actionFlag(ruleRow, s, today);
  const dueLabel = effectiveDue
    ? dueRule
      ? `${DUE_RULE_LABEL[dueRule]} (${formatTanggal(effectiveDue)})`
      : formatTanggal(effectiveDue)
    : null;
  return {
    code: item.code,
    reportGroup: item.reportGroup,
    area: item.area,
    action: item.action,
    target: item.target,
    kind: item.kind,
    schedule: item.schedule,
    pic: item.pic,
    dueDate: item.dueDate,
    dueRule,
    effectiveDue,
    dueLabel,
    daysLeft: actionDaysLeft(ruleRow, s, today),
    flag,
    status: item.status,
    progress: item.progress,
    updatedOn: item.updatedOn,
    evidence: item.evidence,
    kpsNotes: item.kpsNotes,
    sortOrder: item.sortOrder ?? 0,
    urgency: urgencyOf(flag),
    lastChangedBy: changedVia(item, ws),
    changedLabel: lastChangedLabel(item, ws),
    updatedAt: item.updatedAt,
  };
}

/** Most urgent first: OVERDUE, then due within 7 days, by days left; done items last. */
export function byUrgency(a: ActionView, b: ActionView): number {
  return (
    a.urgency - b.urgency ||
    (a.daysLeft ?? Number.POSITIVE_INFINITY) - (b.daysLeft ?? Number.POSITIVE_INFINITY) ||
    a.sortOrder - b.sortOrder
  );
}

export function byWorkbookOrder(a: ActionView, b: ActionView): number {
  return a.sortOrder - b.sortOrder || a.code.localeCompare(b.code);
}

/** Sisa hari in words. Null (done, or no due date) is "Tidak dihitung". */
export function describeDaysLeft(days: number | null): string {
  if (days === null) return "Tidak dihitung";
  const text = relativeDays(days);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function needsAttention(view: ActionView): boolean {
  return view.urgency <= 1;
}
