import { formatJam } from "@/lib/dates";
import { cx } from "./cx";

export type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; at?: Date | string }
  | { status: "deleted"; at?: Date | string }
  | { status: "error"; message: string };

type SaveStatusProps = {
  state: SaveState;
  className?: string;
};

function progressText(state: SaveState): string {
  if (state.status === "saving") return "Menyimpan…";
  if (state.status === "saved") return state.at ? `Tersimpan pukul ${formatJam(state.at)}` : "Tersimpan";
  if (state.status === "deleted") return state.at ? `Dihapus pukul ${formatJam(state.at)}` : "Dihapus";
  return "";
}

/**
 * Inline save feedback next to a field or row: "Menyimpan…", "Tersimpan pukul 14.05",
 * "Dihapus pukul 14.05", or "Gagal menyimpan: <reason>". Two live regions stay mounted
 * (polite for progress, assertive for errors) so every change is announced. Render it
 * once, before the first save, and pass a new `state`; do not mount it only after saving.
 */
export function SaveStatus({ state, className }: SaveStatusProps) {
  const error = state.status === "error" ? `Gagal menyimpan: ${state.message}` : "";

  return (
    <span className={cx("inline-flex min-h-5 items-center text-xs font-semibold", className)}>
      <span
        role="status"
        aria-live="polite"
        className={state.status === "saved" ? "text-good" : state.status === "deleted" ? "text-ink" : "text-ink-muted"}
      >
        {progressText(state)}
      </span>
      <span role="alert" aria-live="assertive" className="text-critical">
        {error}
      </span>
    </span>
  );
}
