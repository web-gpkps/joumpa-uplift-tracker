import type { ReactNode } from "react";
import { cx } from "./cx";
import { LoadingState } from "./States";

type PageHeaderProps = {
  /** The page's h1. One per page. */
  title: ReactNode;
  /** One or two sentences: what this screen is for. */
  description?: ReactNode;
  /** Primary actions for the whole page (e.g. "Tambah SDM"). Wrap onto their own row on phones. */
  actions?: ReactNode;
  /** Small context line above the title, e.g. the selected week or station. Not a badge. */
  context?: ReactNode;
  /** Filters or a WeekRail that belong to the header (sit under the title). */
  children?: ReactNode;
  className?: string;
};

/** Page title block. 22 px on phones, 28 px from 640 px, weight 600. Server-component friendly. */
export function PageHeader({ title, description, actions, context, children, className }: PageHeaderProps) {
  return (
    <header className={cx("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {context ? <p className="section-label mb-1">{context}</p> : null}
          <h1 className="text-xl font-semibold text-ink sm:text-2xl">{title}</h1>
          {description ? <p className="mt-2 max-w-3xl text-sm text-ink-muted">{description}</p> : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap gap-2" data-print="hide">
            {actions}
          </div>
        ) : null}
      </div>
      {children}
    </header>
  );
}

/** Suspense fallback for a page: its title right away, then what is loading. */
export function PageLoading({ title, label }: { title: ReactNode; label: string }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} />
      <LoadingState label={label} />
    </div>
  );
}
