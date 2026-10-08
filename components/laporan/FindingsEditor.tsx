"use client";

import { startTransition, useActionState, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Textarea } from "@/components/ui/Field";
import { SaveStatus, type SaveState } from "@/components/ui/SaveStatus";
import type { FindingsState } from "@/components/laporan/actions";

type FindingsEditorProps = {
  /** saveWeeklyFindings bound to the accessKey and week. */
  action: (previous: FindingsState, formData: FormData) => Promise<FindingsState>;
  week: number;
  /** "Stasiun SUB" / "KPS". */
  scopeName: string;
  initialFindings: string;
  /** "Terakhir disimpan … lewat tautan ini", or null when nothing is saved yet. */
  lastChanged: string | null;
  /** Heading above the printed text (KPS prints its own findings above the stations'). */
  printLabel?: string;
};

/**
 * Section E for the link's own scope. Typed text stays in the box whatever happens
 * (the form is submitted by hand, so React never resets it); Ctrl/Cmd+Enter saves.
 * Prints as plain text, or as blank lines to write on when empty.
 */
export function FindingsEditor({ action, week, scopeName, initialFindings, lastChanged, printLabel }: FindingsEditorProps) {
  const [text, setText] = useState(initialFindings);
  // A dropped connection must not reach the error boundary (that would discard the typed text).
  const [state, formAction, pending] = useActionState<FindingsState, FormData>(async (previous, formData) => {
    try {
      return await action(previous, formData);
    } catch {
      return {
        status: "error",
        message: "Server tidak terjangkau. Teks Anda masih ada di kotak; periksa koneksi lalu simpan lagi.",
      };
    }
  }, { status: "idle" });
  const formRef = useRef<HTMLFormElement>(null);

  const saved = state.status === "saved" ? state.findings : initialFindings.trim();
  const dirty = text.trim() !== saved;

  const saveState: SaveState = pending
    ? { status: "saving" }
    : state.status === "saved"
      ? { status: state.findings === "" ? "deleted" : "saved", at: state.at }
      : state.status === "error"
        ? { status: "error", message: state.message }
        : { status: "idle" };

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  return (
    <>
      <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-3" data-print="hide">
        <Field
          label={`Temuan ${scopeName}, Minggu ke-${week}`}
          help="Ditulis PIC atau Manager JOUMPA dan ikut tercetak. Kosongkan lalu simpan untuk menghapus. Ctrl+Enter atau ⌘+Enter juga menyimpan."
          error={state.status === "error" && state.invalid && !pending ? "Teks temuan ditolak database. Periksa panjang dan isinya." : undefined}
        >
          <Textarea
            name="findings"
            rows={6}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            maxLength={20000}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button type="submit" loading={pending} loadingText="Menyimpan temuan…" disabled={!dirty && state.status !== "error"}>
            Simpan temuan Minggu ke-{week}
          </Button>
          <SaveStatus state={saveState} />
          {dirty && !pending ? <span className="text-xs text-ink-muted">Ada perubahan yang belum disimpan.</span> : null}
          {!dirty && state.status === "idle" && lastChanged ? (
            <span className="text-xs text-ink-muted">{lastChanged}</span>
          ) : null}
        </div>
      </form>
      <PrintedFindings text={text} label={printLabel} />
    </>
  );
}

/** What section E looks like on paper: the text, or ruled lines to write on. */
export function PrintedFindings({ text, label }: { text: string; label?: string }) {
  const body = text.trim();
  return (
    <div className="hidden print:block">
      {label ? <p className="font-semibold">{label}</p> : null}
      {body ? (
        <p className="text-sm whitespace-pre-wrap text-ink">{body}</p>
      ) : (
        <div aria-hidden="true" className="flex flex-col">
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} className="h-8 border-b border-line-strong" />
          ))}
        </div>
      )}
    </div>
  );
}
