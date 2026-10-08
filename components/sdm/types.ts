import type { Consistency, CriteriaStatus } from "@/lib/rules";
import type { GenderSaveResult, StaffInput, StaffProfileSnapshot, StaffSaveResult } from "@/components/sdm/actions";
import type { DeleteStaffResult } from "@/components/sdm/delete-staff";

/** One Master SDM row as the SDM screen shows it (raw fields + lib/rules results). */
export type SdmRow = {
  code: string;
  station: string;
  name: string;
  nipp: string | null;
  gender: string | null;
  preTest: number | null;
  postTest: number | null;
  /** Training baseline A to F. */
  scores: Array<number | null>;
  reportConclusion: string | null;
  assignmentStatus: string;
  notes: string | null;
  /** Master SDM P, R, S (lib/rules staffBaseline). */
  practiceAvg: number | null;
  criteriaStatus: CriteriaStatus | null;
  consistency: Consistency | null;
  /** Other staff in this link's view share the same NIPP. */
  duplicateNippWith: string[];
  /** "Diubah lewat tautan ini, 8 Okt 14.05". */
  changedLabel: string;
  /** Rows tied to this staff member (for the owner's delete confirmation). */
  weeklyScoreCount: number;
  bmiCheckCount: number;
  replacementCount: number;
};

export type SaveStaffAction = (accessKey: string, input: StaffInput) => Promise<StaffSaveResult>;
export type SaveGenderAction = (
  accessKey: string,
  current: StaffProfileSnapshot,
  gender: "L" | "P" | null,
) => Promise<GenderSaveResult>;

export type DeleteStaffAction = (accessKey: string, code: string) => Promise<DeleteStaffResult>;

export const ASSIGNMENT_STATUSES = ["Aktif", "Coaching 30 Hari", "Diganti", "Ditarik"] as const;
export const REPORT_CONCLUSIONS = ["Sesuai", "Sesuai dengan Catatan", "Perlu Perbaikan", "Tidak Sesuai"] as const;
