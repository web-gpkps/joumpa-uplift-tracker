"use client";

import { useState } from "react";
import type { Settings } from "@/lib/rules";
import { Button } from "@/components/ui/Button";
import { StaffDialog } from "./StaffDialog";
import type { SaveStaffAction } from "./types";

type AddStaffButtonProps = {
  accessKey: string;
  isKps: boolean;
  ownStation: string | null;
  stations: string[];
  settings: Settings;
  saveAction: SaveStaffAction;
};

/** "Tambah SDM" for untrained or replacement staff: opens the add dialog. Client component. */
export function AddStaffButton(props: AddStaffButtonProps) {
  const [open, setOpen] = useState(false);
  const [openCount, setOpenCount] = useState(0);
  const [message, setMessage] = useState("");

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button
        onClick={() => {
          setOpenCount((n) => n + 1);
          setMessage("");
          setOpen(true);
        }}
      >
        Tambah SDM
      </Button>
      <p role="status" aria-live="polite" className="text-sm font-semibold text-good">
        {message}
      </p>
      <StaffDialog
        open={open}
        onClose={() => setOpen(false)}
        row={null}
        formKey={`baru-${openCount}`}
        accessKey={props.accessKey}
        isKps={props.isKps}
        ownStation={props.ownStation}
        stations={props.stations}
        settings={props.settings}
        saveAction={props.saveAction}
        onSaved={setMessage}
      />
    </div>
  );
}
