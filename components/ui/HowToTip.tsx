"use client";

import { useSyncExternalStore, type ReactNode } from "react";

const listeners = new Set<() => void>();

function storageKey(id: string): string {
  return `joumpa.tip.${id}`;
}

function isDismissed(id: string): boolean {
  try {
    return window.localStorage.getItem(storageKey(id)) === "1";
  } catch {
    return false;
  }
}

function setDismissed(id: string, dismissed: boolean) {
  try {
    if (dismissed) window.localStorage.setItem(storageKey(id), "1");
    else window.localStorage.removeItem(storageKey(id));
  } catch {
    // Storage blocked (private window): the choice lasts until the page reloads.
  }
  memory.set(id, dismissed);
  for (const listener of listeners) listener();
}

const memory = new Map<string, boolean>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const button =
  "inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-2 sm:min-h-0";

/**
 * The one-line "Cara mengisi" tip of an entry sheet (docs/UX.md §4): "Sembunyikan" hides it
 * in this browser, "Cara mengisi" brings it back. Renders inline, so it fits a Panel
 * description.
 */
export function HowToTip({ id, children }: { id: string; children: ReactNode }) {
  const dismissed = useSyncExternalStore(
    subscribe,
    () => memory.get(id) ?? isDismissed(id),
    () => false,
  );

  if (dismissed) {
    return (
      <button type="button" className={button} onClick={() => setDismissed(id, false)}>
        Tampilkan cara mengisi
      </button>
    );
  }
  return (
    <span>
      Cara mengisi: {children}{" "}
      <button type="button" className={button} onClick={() => setDismissed(id, true)}>
        Sembunyikan
      </button>
    </span>
  );
}
