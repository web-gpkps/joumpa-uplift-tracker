"use client";

import { useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { deltaVsBaseline, practiceAvg, weeklyStatus, type Settings } from "@/lib/rules";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input, NumberInput } from "@/components/ui/Field";
import { SaveStatus, type SaveState } from "@/components/ui/SaveStatus";
import { StatusChip } from "@/components/ui/StatusChip";
import { cx } from "@/components/ui/cx";
import type { WeeklyScoreInput, WeeklyScoreResult } from "@/components/performa/actions";
import { formatScore, formatSignedScore } from "@/lib/format";
import { ASPECTS, parseScore } from "./format";
import { CELL, ROW_GRID, STICKY_FIRST } from "./entry-layout";

export type SavedScore = {
  scores: Array<number | null>;
  observer: string | null;
  coachingNotes: string | null;
};

export type EntryStaff = {
  code: string;
  name: string;
  assignmentStatus: string;
  /** Training baseline average (Master SDM P), for Δ vs baseline. */
  baselineAvg: number | null;
  /** This week's saved row, or null. */
  saved: SavedScore | null;
  /** "Diubah lewat tautan ini, 8 Okt 14.05" for the saved row. */
  changedLabel: string | null;
};

export type SaveScoreAction = (accessKey: string, input: WeeklyScoreInput) => Promise<WeeklyScoreResult>;

type Draft = { scores: string[]; observer: string; notes: string };

function draftFrom(saved: SavedScore | null): Draft {
  return {
    scores: ASPECTS.map((_, i) => (saved?.scores[i] == null ? "" : String(saved.scores[i]))),
    observer: saved?.observer ?? "",
    notes: saved?.coachingNotes ?? "",
  };
}

function normalise(d: Draft): Draft {
  return { scores: d.scores.map((s) => s.trim()), observer: d.observer.trim(), notes: d.notes.trim() };
}

function sameDraft(a: Draft, b: Draft): boolean {
  const x = normalise(a);
  const y = normalise(b);
  return x.observer === y.observer && x.notes === y.notes && x.scores.every((s, i) => s === y.scores[i]);
}

function isEmpty(d: Draft): boolean {
  const n = normalise(d);
  return n.observer === "" && n.notes === "" && n.scores.every((s) => s === "");
}

const FIELD_INDEX: Record<string, number> = {
  score_a: 0,
  score_b: 1,
  score_c: 2,
  score_d: 3,
  score_e: 4,
  score_f: 5,
};

function joinLetters(letters: string[]): string {
  if (letters.length <= 1) return letters.join("");
  return `${letters.slice(0, -1).join(", ")} dan ${letters[letters.length - 1]}`;
}

type ScoreRowProps = {
  accessKey: string;
  week: number;
  settings: Settings;
  staff: EntryStaff;
  /** Observer name filled into an empty Pengamat field when scoring starts. */
  defaultObserver: string;
  saveAction: SaveScoreAction;
};

/**
 * One staff member's scores for one week: A to F (1 to 5), live average, weekly status
 * and Δ vs baseline (lib/rules), observer, coaching notes, and a per-row save.
 * Enter in any field saves the row. Clearing every field of a saved row deletes it
 * after a confirmation. Typed input survives a failed save.
 */
export function ScoreRow({ accessKey, week, settings, staff, defaultObserver, saveAction }: ScoreRowProps) {
  const id = useId();
  const nameId = `${id}-name`;
  const messageId = `${id}-message`;
  const scoreRefs = useRef<Array<HTMLInputElement | null>>([]);
  const observerRef = useRef<HTMLInputElement | null>(null);

  const [draft, setDraft] = useState<Draft>(() => draftFrom(staff.saved));
  const [prevSaved, setPrevSaved] = useState<SavedScore | null>(staff.saved);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [serverField, setServerField] = useState<{ field: string; message: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // New server data after refresh(): adopt it unless the person is still editing this row.
  if (prevSaved !== staff.saved) {
    setPrevSaved(staff.saved);
    if (sameDraft(draft, draftFrom(prevSaved))) setDraft(draftFrom(staff.saved));
  }

  const savedDraft = draftFrom(staff.saved);
  const dirty = !sameDraft(draft, savedDraft);
  const saving = saveState.status === "saving";
  const willDelete = dirty && staff.saved !== null && isEmpty(draft);

  const parsed = draft.scores.map(parseScore);
  const invalidLetters = parsed.flatMap((p, i) => (p === "invalid" ? [ASPECTS[i].letter] : []));
  const valid = parsed.map((p) => (p === "invalid" ? null : p));
  const avg = practiceAvg(valid);
  const status = weeklyStatus(avg, settings);
  const delta = deltaVsBaseline(avg, staff.baselineAvg);
  const serverIndex = serverField ? FIELD_INDEX[serverField.field] : undefined;

  let message: string | null = null;
  if (invalidLetters.length > 0) {
    message = `Nilai ${joinLetters(invalidLetters)} harus angka bulat 1 sampai 5.`;
  } else if (serverField) {
    message = serverField.message;
  }

  function edit(next: Draft) {
    setDraft(next);
    if (saveState.status === "saved" || saveState.status === "error") setSaveState({ status: "idle" });
    if (serverField) setServerField(null);
  }

  function onScoreChange(index: number, event: ChangeEvent<HTMLInputElement>) {
    const native = event.nativeEvent as InputEvent;
    // A score is one key: typing into a filled field replaces it (wherever the caret is).
    const typed = native.inputType === "insertText" && native.data ? native.data : null;
    const value = typed !== null && draft.scores[index].trim() !== "" ? typed : event.target.value;
    const scores = draft.scores.map((s, i) => (i === index ? value : s));
    const startedScoring = draft.scores.every((s) => s.trim() === "") && value.trim() !== "";
    const observer =
      startedScoring && draft.observer.trim() === "" && defaultObserver.trim() !== ""
        ? defaultObserver.trim()
        : draft.observer;
    edit({ ...draft, scores, observer });

    // Typing one valid digit moves on to the next aspect (announced in the help text above the list).
    if (typed !== null && /^[1-5]$/.test(value.trim())) {
      const next = index < ASPECTS.length - 1 ? scoreRefs.current[index + 1] : observerRef.current;
      next?.focus();
    }
  }

  async function persist(toSave: Draft) {
    const values = toSave.scores.map(parseScore).map((p) => (p === "invalid" ? null : p));
    setSaveState({ status: "saving" });
    try {
      const result = await saveAction(accessKey, {
        staffCode: staff.code,
        week,
        scores: values,
        observer: toSave.observer,
        coachingNotes: toSave.notes,
      });
      if (!result.ok) {
        setSaveState({ status: "error", message: result.error.message });
        if (result.error.field) setServerField({ field: result.error.field, message: result.error.message });
        return;
      }
      // Show the trimmed values the database stored, unless the row was edited meanwhile.
      setDraft((current) => (current === toSave ? normalise(toSave) : current));
      setSaveState({ status: result.deleted ? "deleted" : "saved", at: result.savedAt });
    } catch {
      setSaveState({
        status: "error",
        message: "koneksi ke server terputus. Nilai yang Anda ketik masih ada; simpan lagi.",
      });
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || saving) return;
    if (invalidLetters.length > 0) {
      const first = scoreRefs.current[parsed.findIndex((p) => p === "invalid")];
      first?.focus();
      first?.select();
      return;
    }
    if (willDelete) {
      setConfirmOpen(true);
      return;
    }
    void persist(draft);
  }

  function confirmDelete() {
    setConfirmOpen(false);
    void persist(draft);
  }

  const notActive = staff.assignmentStatus && staff.assignmentStatus !== "Aktif";

  return (
    <li className="group border-b border-line px-4 py-4 focus-within:bg-brand-tint nav:px-0 nav:py-1.5">
      <form onSubmit={onSubmit} noValidate>
        <div role="group" aria-labelledby={nameId} className={ROW_GRID}>
          <div
            className={cx(
              CELL.name,
              STICKY_FIRST,
              "flex flex-col justify-center gap-0.5 bg-transparent nav:bg-surface nav:group-focus-within:bg-brand-tint",
            )}
          >
            <p id={nameId} className="text-sm font-semibold text-ink">
              {staff.name}
            </p>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
              <span className="tabular-nums">{staff.code}</span>
              {notActive ? <StatusChip label={staff.assignmentStatus} /> : null}
            </p>
            {staff.changedLabel ? <p className="text-xs text-ink-muted">{staff.changedLabel}</p> : null}
          </div>

          {ASPECTS.map((aspect, i) => {
            const inputId = `${id}-${aspect.letter}`;
            const bad = parsed[i] === "invalid" || serverIndex === i;
            return (
              <div key={aspect.key} className={cx(CELL.score, "flex flex-col justify-end gap-1")}>
                <label htmlFor={inputId} className="text-xs font-semibold text-ink nav:sr-only">
                  {`${aspect.letter} ${aspect.name}`}
                </label>
                <NumberInput
                  id={inputId}
                  ref={(node) => {
                    scoreRefs.current[i] = node;
                  }}
                  value={draft.scores[i]}
                  onChange={(event) => onScoreChange(i, event)}
                  onFocus={(event) => event.currentTarget.select()}
                  alignEnd={false}
                  className="text-center"
                  aria-invalid={bad || undefined}
                  aria-describedby={bad && message ? messageId : undefined}
                />
              </div>
            );
          })}

          <div className={cx(CELL.result, "flex flex-wrap items-center gap-x-3 gap-y-1 nav:flex-col nav:items-start nav:gap-1")}>
            {avg !== null ? (
              <p className="text-sm tabular-nums">
                <span className="text-ink-muted nav:sr-only">Rata-rata </span>
                <span className="font-semibold text-ink">{formatScore(avg)}</span>
                {delta !== null ? (
                  <span className="ml-2 text-xs text-ink-muted">
                    <span aria-hidden="true">Δ </span>
                    <span className="sr-only">selisih dengan baseline </span>
                    {formatSignedScore(delta)}
                  </span>
                ) : null}
              </p>
            ) : null}
            <StatusChip label={status} emptyLabel="Belum dinilai" />
          </div>

          <div className={cx(CELL.observer, "flex flex-col gap-1")}>
            <label htmlFor={`${id}-observer`} className="text-xs font-semibold text-ink nav:sr-only">
              Pengamat
            </label>
            <Input
              id={`${id}-observer`}
              ref={observerRef}
              value={draft.observer}
              onChange={(event) => edit({ ...draft, observer: event.target.value })}
              maxLength={200}
              autoComplete="off"
              aria-invalid={serverField?.field === "observer" || undefined}
            />
          </div>

          <div className={cx(CELL.notes, "flex flex-col gap-1")}>
            <label htmlFor={`${id}-notes`} className="text-xs font-semibold text-ink nav:sr-only">
              Catatan coaching
            </label>
            <Input
              id={`${id}-notes`}
              value={draft.notes}
              onChange={(event) => edit({ ...draft, notes: event.target.value })}
              maxLength={4000}
              autoComplete="off"
              aria-invalid={serverField?.field === "coaching_notes" || undefined}
            />
          </div>

          <div className={cx(CELL.save, "flex flex-wrap items-center gap-x-3 gap-y-1 nav:flex-col nav:items-start nav:gap-0.5 nav:pr-3")}>
            <Button
              type="submit"
              size="sm"
              variant={willDelete ? "danger" : "primary"}
              disabled={!dirty}
              loading={saving}
              loadingText="Menyimpan…"
            >
              {willDelete ? "Hapus nilai" : "Simpan nilai"}
            </Button>
            {dirty && !saving && saveState.status !== "error" ? (
              <span className="text-xs font-semibold text-warning">Belum disimpan</span>
            ) : null}
            <SaveStatus state={saveState} className="nav:min-h-0" />
          </div>

          {message ? (
            <p id={messageId} className={cx(CELL.message, "text-sm font-medium text-critical nav:pt-1 nav:pb-1")}>
              <span className="nav:sticky nav:left-3 nav:inline-block">{message}</span>
            </p>
          ) : null}
        </div>
      </form>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Hapus nilai Minggu ke-${week} untuk ${staff.name}?`}
        description="Nilai A sampai F, pengamat, dan catatan coaching minggu ini dikosongkan. Nilai minggu lain tidak berubah."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Batal
            </Button>
            <Button variant="danger" onClick={confirmDelete}>
              Hapus nilai
            </Button>
          </>
        }
      />
    </li>
  );
}
