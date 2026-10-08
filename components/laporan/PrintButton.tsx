"use client";

import { Button } from "@/components/ui/Button";

/** Opens the browser's print dialog; "Simpan sebagai PDF" there gives the PDF for OCS, OAO and the GM. */
export function PrintButton({ label = "Cetak / simpan PDF" }: { label?: string }) {
  return (
    <Button variant="primary" onClick={() => window.print()}>
      {label}
    </Button>
  );
}
