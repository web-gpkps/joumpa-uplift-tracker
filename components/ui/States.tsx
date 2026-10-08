import type { ReactNode } from "react";
import { cx } from "./cx";

/*
 * Empty / loading / error states (R-27). Each one says WHY and WHAT NEXT,
 * in the workbook's own terms. Examples:
 *   <EmptyState title="Belum ada nilai untuk Minggu ke-1">
 *     Pemantauan mulai Senin, 12 Okt 2026.
 *   </EmptyState>
 *   <LoadingState label="Memuat daftar SDM" />
 *   <ErrorState title="Daftar SDM tidak bisa dimuat" cause={message} action={<Button onClick={retry}>Muat ulang</Button>} />
 * All three are server-component friendly.
 */

type Layout = "block" | "inline";

// No horizontal padding: the container (Panel, table cell, page) already sets the gutter.
const shell: Record<Layout, string> = {
  block: "flex flex-col items-start gap-2 py-6 sm:py-8",
  inline: "flex flex-col items-start gap-1 py-3",
};

type EmptyStateProps = {
  /** What is missing, specifically: "Belum ada tindak lanjut untuk SUB". */
  title: ReactNode;
  /** Why it is empty and when or how it fills. */
  children?: ReactNode;
  /** The one action that fills it, e.g. <ButtonLink href="/sdm/baru">Tambah SDM</ButtonLink>. */
  action?: ReactNode;
  layout?: Layout;
  className?: string;
};

export function EmptyState({ title, children, action, layout = "block", className }: EmptyStateProps) {
  return (
    <div className={cx(shell[layout], className)}>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {children ? <div className="max-w-2xl text-sm text-ink-muted">{children}</div> : null}
      {action ? <div className="mt-2 flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

type LoadingStateProps = {
  /** What is loading, e.g. "Memuat nilai Minggu ke-3". An ellipsis is added. */
  label: string;
  layout?: Layout;
  className?: string;
};

/** Text only, no spinner: MOTION 1 allows no looping animation. Announced politely. */
export function LoadingState({ label, layout = "block", className }: LoadingStateProps) {
  return (
    <div role="status" aria-live="polite" className={cx(shell[layout], className)}>
      <p className="text-sm text-ink-muted">{label}…</p>
    </div>
  );
}

type ErrorStateProps = {
  /** What failed, in plain words: "Nilai Minggu ke-3 tidak bisa dimuat". */
  title: ReactNode;
  /** The cause if known (network, permission, a message from the database). */
  cause?: ReactNode;
  /** What to do next. Defaults to a sentence; pass a button for a real retry. */
  action?: ReactNode;
  layout?: Layout;
  className?: string;
};

export function ErrorState({ title, cause, action, layout = "block", className }: ErrorStateProps) {
  return (
    <div role="alert" className={cx(shell[layout], className)}>
      <p className="text-sm font-semibold text-critical">{title}</p>
      {cause ? <p className="max-w-2xl text-sm text-ink">{cause}</p> : null}
      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
        {action ?? "Muat ulang halaman. Jika masih gagal, hubungi pengelola aplikasi."}
      </div>
    </div>
  );
}
