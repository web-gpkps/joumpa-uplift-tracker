"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import type { DeleteStaffAction, SdmRow } from "./types";

type DeleteStaffDialogProps = {
  /** The staff member to delete; null keeps the dialog closed. */
  row: SdmRow | null;
  onClose: () => void;
  accessKey: string;
  deleteAction: DeleteStaffAction;
  onDeleted: (message: string) => void;
};

function plural(n: number, noun: string): string {
  return `${n} ${noun}`;
}

/**
 * Owner-only "Hapus SDM" confirmation. States what goes with the staff row, counted from
 * the data on screen: weekly scores and BMI checks are deleted (cascade), replacements stay
 * but lose their link. Client component.
 */
export function DeleteStaffDialog({ row, onClose, accessKey, deleteAction, onDeleted }: DeleteStaffDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<SdmRow | null>(row);
  // Keep the last row while the dialog closes, so the text does not blank out mid-close.
  if (row && row !== shown) {
    setShown(row);
    setError(null);
  }
  const target = row ?? shown;

  async function confirm() {
    if (!target || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await deleteAction(accessKey, target.code);
      if (result.ok) {
        onDeleted(
          `${result.code} ${result.name} dihapus, bersama ${plural(result.weeklyScores, "nilai mingguan")} dan ${plural(
            result.bmiChecks,
            "cek BMI",
          )}.`,
        );
        onClose();
      } else {
        setError(result.error.message);
      }
    } catch {
      setError("Koneksi ke server terputus. SDM belum dihapus; coba lagi.");
    }
    setBusy(false);
  }

  const lost = target ? [plural(target.weeklyScoreCount, "nilai mingguan"), plural(target.bmiCheckCount, "cek BMI")] : [];

  return (
    <Dialog
      open={row !== null}
      onClose={() => {
        if (!busy) onClose();
      }}
      dismissible={!busy}
      title={target ? `Hapus SDM ${target.code} ${target.name}?` : "Hapus SDM?"}
      description="Penghapusan ini permanen dan tidak bisa dibatalkan. Google Sheet ikut diperbarui pada sinkronisasi berikutnya."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button variant="danger" onClick={() => void confirm()} loading={busy} loadingText="Menghapus…">
            Hapus SDM
          </Button>
        </>
      }
    >
      {target ? (
        <div className="flex flex-col gap-2">
          <p>
            Ikut terhapus: <strong className="tabular-nums">{lost.join(" dan ")}</strong> milik SDM ini.
          </p>
          <p>
            {target.replacementCount > 0
              ? `${plural(target.replacementCount, "baris Penggantian SDM")} tetap ada, tetapi tidak lagi tertaut ke SDM ini.`
              : "Tidak ada baris Penggantian SDM yang tertaut ke SDM ini."}
          </p>
          {error ? (
            <p role="alert" className="rounded-control bg-critical-tint px-3 py-2 font-medium text-critical">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}
