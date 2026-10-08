/** Small synthetic data set (no real names) for sync tests. */
import type { DbSnapshot } from "../types";

export function settingsRow(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    week1_start: "2026-10-12",
    weeks: 10,
    bmi_first_check: "2026-10-12",
    bmi_interval_days: 14,
    bmi_periods: 5,
    bmi_underweight_below: 18.5,
    bmi_normal_max: 25,
    bmi_overweight_max: 27,
    min_height_female: null,
    min_height_male: null,
    pass_avg_min: 4,
    improve_avg_min: 3,
    posttest_min: 80,
    replacement_deadline: "2026-10-31",
    updated_at: "2026-10-07T00:00:00Z",
    ...over,
  };
}

export function staffRow(code: string, n: number, over: Record<string, unknown> = {}) {
  return {
    code,
    station: code.slice(0, 3),
    name: `Petugas ${code}`,
    nipp: String(1000 + n),
    gender: null,
    pre_test: 60,
    post_test: 80,
    score_a: 4,
    score_b: 4,
    score_c: 3,
    score_d: 3,
    score_e: 4,
    score_f: 4,
    report_conclusion: "Perlu Perbaikan",
    assignment_status: "Aktif",
    notes: null,
    bmi_note: null,
    sort_order: n,
    created_at: "2026-10-07T00:00:00Z",
    updated_at: "2026-10-07T00:00:00Z",
    ...over,
  };
}

export function weeklyRow(id: number, staff_code: string, week: number, over: Record<string, unknown> = {}) {
  return {
    id,
    staff_code,
    week,
    score_a: 4,
    score_b: 4,
    score_c: 4,
    score_d: 4,
    score_e: 4,
    score_f: 4,
    observer: "Supervisor",
    coaching_notes: null,
    updated_at: "2026-10-07T00:00:00Z",
    updated_by: null,
    ...over,
  };
}

export function bmiRow(id: number, staff_code: string, period: number, over: Record<string, unknown> = {}) {
  return {
    id,
    staff_code,
    period,
    check_date: "2026-10-12",
    height_cm: 170,
    weight_kg: 65.5,
    updated_at: "2026-10-07T00:00:00Z",
    updated_by_user: null,
    updated_by_link: null,
    ...over,
  };
}

export function actionRow(code: string, n: number, over: Record<string, unknown> = {}) {
  return {
    code,
    report_group: code.slice(0, 3),
    area: "Pemetaan SDM",
    action: `Tindakan ${n}`,
    target: "100%",
    kind: "Sekali",
    schedule: null,
    due_date: "2026-10-10",
    due_rule: null,
    pic: "PIC",
    status: "Belum Mulai",
    progress: 0,
    updated_on: null,
    evidence: null,
    kps_notes: null,
    sort_order: n,
    updated_at: "2026-10-07T00:00:00Z",
    ...over,
  };
}

export function replacementRow(id: number, over: Record<string, unknown> = {}) {
  return {
    id,
    report_group: "SUB",
    station: "SUB",
    staff_code: null,
    replaced_name: `Diganti ${id}`,
    reason: "Tidak Sesuai",
    withdrawn_on: null,
    replacement_name: null,
    effective_on: null,
    training_on: null,
    post_test: null,
    practice_avg: null,
    reported: "Belum",
    notes: null,
    sort_order: id,
    updated_at: "2026-10-07T00:00:00Z",
    ...over,
  };
}

export function smallDb(): DbSnapshot {
  return {
    settings: [settingsRow()],
    staff: [staffRow("SUB-01", 1), staffRow("SUB-02", 2), staffRow("DPS-01", 3)],
    weekly_scores: [weeklyRow(1, "SUB-01", 1), weeklyRow(2, "SUB-02", 1, { score_f: 5 })],
    bmi_checks: [bmiRow(1, "SUB-01", 1)],
    action_items: [actionRow("SUB-TL01", 1), actionRow("SUB-TL02", 2, { kind: "Rutin" })],
    replacements: [replacementRow(1)],
    weekly_reports: [
      { week: 1, scope: "SUB", findings: "Temuan minggu 1", updated_at: "2026-10-07T00:00:00Z", updated_by_link: null },
      { week: 1, scope: "KPS", findings: "Ringkasan KPS minggu 1", updated_at: "2026-10-07T00:00:00Z", updated_by_link: "00000000-0000-0000-0000-000000000001" },
    ],
  };
}

/** n staff rows for guard tests. */
export function manyStaff(n: number) {
  return Array.from({ length: n }, (_, i) => staffRow(`SUB-${String(i + 1).padStart(2, "0")}`, i + 1));
}
