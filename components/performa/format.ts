/** Aspects A to F and the score parser shared by Performa and SDM (client-safe). */

export const ASPECTS = [
  { key: "scoreA", field: "score_a", letter: "A", name: "Penampilan" },
  { key: "scoreB", field: "score_b", letter: "B", name: "Grooming" },
  { key: "scoreC", field: "score_c", letter: "C", name: "Postur" },
  { key: "scoreD", field: "score_d", letter: "D", name: "Komunikasi" },
  { key: "scoreE", field: "score_e", letter: "E", name: "Touch Point" },
  { key: "scoreF", field: "score_f", letter: "F", name: "B. Inggris & Reservasi" },
] as const;

export type AspectKey = (typeof ASPECTS)[number]["key"];

/** Strict 1 to 5 score parse: null for blank, "invalid" for anything else. */
export function parseScore(raw: string): number | null | "invalid" {
  const text = raw.trim();
  if (text === "") return null;
  return /^[1-5]$/.test(text) ? Number(text) : "invalid";
}
