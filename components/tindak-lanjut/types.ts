/** Shapes shared by the Tindak Lanjut Server Actions and the client forms. */

export type ProgressField = "status" | "progress" | "updatedOn" | "evidence";

export type ProgressInput = {
  code: string;
  status: string;
  /** Integer 0..100 (DB units, same as action_items.progress). */
  progress: number;
  /** 'YYYY-MM-DD' or "" for none. */
  updatedOn: string;
  evidence: string;
};

export type DefinitionField =
  | "area"
  | "action"
  | "target"
  | "kind"
  | "schedule"
  | "dueDate"
  | "dueRule"
  | "pic"
  | "kpsNotes";

/** Every field is sent; "" clears it (NULL in the database). */
export type DefinitionInput = {
  code: string;
  area: string;
  action: string;
  target: string;
  kind: string;
  schedule: string;
  dueDate: string;
  dueRule: string;
  pic: string;
  kpsNotes: string;
};

export type ActionSaveResult<F extends string> =
  | { ok: true; savedAt: string }
  | { ok: false; message: string; fieldErrors?: Partial<Record<F, string>> };

/** Workbook column names, for messages that point at a field. */
export const FIELD_LABEL: Record<ProgressField | DefinitionField, string> = {
  status: "Status",
  progress: "% Progres",
  updatedOn: "Tgl update",
  evidence: "Realisasi / Bukti",
  area: "Area",
  action: "Tindakan",
  target: "Target / Indikator",
  kind: "Jenis",
  schedule: "Jadwal",
  dueDate: "Batas waktu tetap",
  dueRule: "Aturan batas waktu",
  pic: "PIC",
  kpsNotes: "Catatan KPS",
};
