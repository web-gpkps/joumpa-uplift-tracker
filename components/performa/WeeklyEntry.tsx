"use client";

import { useSyncExternalStore } from "react";
import type { Settings } from "@/lib/rules";
import { Field, Input } from "@/components/ui/Field";
import { cx } from "@/components/ui/cx";
import { ASPECTS } from "./format";
import { CELL, ROW_GRID, STICKY_FIRST } from "./entry-layout";
import { ScoreRow, type EntryStaff, type SaveScoreAction } from "./ScoreRow";

export type EntryGroup = {
  /** Station code; the heading is shown only when the list holds more than one station. */
  station: string;
  /** "26 SDM, 3 sudah dinilai". */
  summary: string;
  staff: EntryStaff[];
};

type WeeklyEntryProps = {
  accessKey: string;
  week: number;
  settings: Settings;
  groups: EntryGroup[];
  showStationHeadings: boolean;
  /** Accessible name of the list, e.g. "Nilai Minggu ke-1, Stasiun SUB". */
  label: string;
  saveAction: SaveScoreAction;
};

/*
 * The default observer is a per-browser convenience (the supervisor usually scores the
 * whole station), kept in localStorage. Every access is guarded: private windows and
 * blocked storage fall back to memory, so the field always stays editable.
 */
const OBSERVER_KEY = "joumpa.performa.pengamat";
let observerMemory = "";
const observerListeners = new Set<() => void>();

function subscribeObserver(callback: () => void) {
  observerListeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    observerListeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function readObserver(): string {
  try {
    return window.localStorage.getItem(OBSERVER_KEY) ?? observerMemory;
  } catch {
    return observerMemory;
  }
}

function writeObserver(value: string) {
  observerMemory = value;
  try {
    if (value === "") window.localStorage.removeItem(OBSERVER_KEY);
    else window.localStorage.setItem(OBSERVER_KEY, value);
  } catch {
    // Storage unavailable: the in-memory value still works for this page.
  }
  for (const listener of observerListeners) listener();
}

/**
 * Weekly entry list (Log Performa Mingguan): one row per staff member in scope.
 * Client component; each row saves on its own through `saveAction`.
 */
export function WeeklyEntry({ accessKey, week, settings, groups, showStationHeadings, label, saveAction }: WeeklyEntryProps) {
  const defaultObserver = useSyncExternalStore(subscribeObserver, readObserver, () => "");

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-3 border-b border-line px-4 pb-4 sm:px-6 nav:flex-row nav:items-end nav:justify-between nav:gap-6">
        <Field
          label="Pengamat untuk baris yang Anda nilai"
          help="Terisi sendiri di kolom Pengamat saat Anda mulai menilai SDM yang pengamatnya masih kosong. Diingat di peramban ini."
          className="max-w-md"
        >
          <Input
            value={defaultObserver}
            onChange={(event) => writeObserver(event.target.value)}
            maxLength={200}
            autoComplete="name"
            placeholder="Nama Anda"
          />
        </Field>
        <p className="max-w-md text-xs text-ink-muted">
          Ketik angka 1 sampai 5; kursor pindah sendiri ke aspek berikutnya. Tekan Enter di kolom mana pun
          untuk menyimpan baris itu. Kosongkan semua kolom baris yang sudah tersimpan untuk menghapusnya.
          Δ adalah selisih rata-rata minggu ini dengan baseline pelatihan.
        </p>
      </div>

      <div
        role="region"
        aria-label={label}
        className="nav:max-h-[min(72dvh,820px)] nav:overflow-auto nav:overscroll-x-contain"
      >
        <div className="nav:w-max nav:min-w-full">
          <div
            aria-hidden="true"
            className={cx(
              ROW_GRID,
              "hidden border-b border-line-strong bg-paper py-2 text-xs font-semibold text-ink-muted",
              "nav:sticky nav:top-0 nav:z-[2] nav:grid",
            )}
          >
            <div className={cx(CELL.name, STICKY_FIRST, "nav:z-[3] nav:flex nav:items-center nav:bg-paper")}>SDM</div>
            {ASPECTS.map((aspect) => (
              <div key={aspect.key} className={cx(CELL.score, "flex flex-col items-center text-center leading-tight")}>
                <span className="text-sm text-ink">{aspect.letter}</span>
                <span>{aspect.name}</span>
              </div>
            ))}
            <div className={cx(CELL.result, "leading-tight")}>
              Rata-rata, Δ
              <br />
              status minggu ini
            </div>
            <div className={CELL.observer}>Pengamat</div>
            <div className={CELL.notes}>Catatan coaching</div>
            <div className={cx(CELL.save, "nav:pr-3")}>Simpan</div>
          </div>

          <ul>
            {groups.map((group) => (
              <GroupRows
                key={group.station}
                group={group}
                showHeading={showStationHeadings}
                accessKey={accessKey}
                week={week}
                settings={settings}
                defaultObserver={defaultObserver}
                saveAction={saveAction}
              />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function GroupRows({
  group,
  showHeading,
  ...rowProps
}: {
  group: EntryGroup;
  showHeading: boolean;
  accessKey: string;
  week: number;
  settings: Settings;
  defaultObserver: string;
  saveAction: SaveScoreAction;
}) {
  return (
    <>
      {showHeading ? (
        <li className="border-b border-line bg-paper px-4 py-2 nav:px-3">
          <h3 className="text-sm font-semibold text-ink nav:sticky nav:left-3 nav:w-fit">
            Stasiun {group.station}
            <span className="ml-2 text-xs font-normal text-ink-muted">{group.summary}</span>
          </h3>
        </li>
      ) : null}
      {group.staff.map((staff) => (
        <ScoreRow key={staff.code} staff={staff} {...rowProps} />
      ))}
    </>
  );
}
