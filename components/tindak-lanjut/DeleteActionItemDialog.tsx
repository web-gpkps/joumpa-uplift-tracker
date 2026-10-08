"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { deleteActionItem } from "./actions";
import type { ActionView } from "./action-view";

type DeleteActionItemDialogProps = {
  accessKey: string;
  /** The item to delete; null closes the dialog. */
  item: ActionView | null;
  onClose: () => void;
  onDeleted: (code: string) => void;
};

/** Owner only: "Hapus butir" with a confirmation that says what is lost. */
export function DeleteActionItemDialog({ accessKey, item, onClose, onDeleted }: DeleteActionItemDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    if (!item) return;
    const code = item.code;
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteActionItem(accessKey, code);
        if (result.ok) onDeleted(code);
        else setError(result.message);
      } catch {
        setError("Server tidak menjawab. Periksa koneksi, lalu coba lagi.");
      }
    });
  }

  return (
    <Dialog
      open={item !== null}
      onClose={() => {
        if (!pending) {
          setError(null);
          onClose();
        }
      }}
      dismissible={!pending}
      title={item ? `Hapus butir ${item.code}?` : "Hapus butir"}
      description={item?.area ?? undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Batal
          </Button>
          <Button variant="danger" onClick={confirm} loading={pending} loadingText="Menghapus…">
            Hapus butir
          </Button>
        </>
      }
    >
      {item ? (
        <div className="flex flex-col gap-2">
          <p>
            Butir ini beserta Status ({item.status}, {item.progress}%), Realisasi / Bukti, dan Catatan KPS-nya hilang dari
            aplikasi, dan dari Google Sheet pada sinkronisasi berikutnya. Penghapusan tidak bisa dibatalkan.
          </p>
          {error ? (
            <p role="alert" className="font-medium text-critical">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}
