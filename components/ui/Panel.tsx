import type { ReactNode } from "react";
import { cx } from "./cx";

type PanelProps = {
  /** Panel heading (h2 by default). Optional: a panel holding only a table can rely on the table caption. */
  title?: ReactNode;
  /** One line under the title: what this panel answers. */
  description?: ReactNode;
  /** Buttons or links aligned with the title (right on desktop, below on phones). */
  actions?: ReactNode;
  /** Heading level for the title. Default 2. */
  headingLevel?: 2 | 3;
  /**
   * "default" pads the body; "flush" lets a DataTable or list run edge to edge.
   */
  padding?: "default" | "flush";
  /** Use for landmarks, e.g. aria-labelledby is set automatically when title is given. */
  id?: string;
  className?: string;
  children: ReactNode;
};

/**
 * A white surface on the paper background with a --line border and 10 px radius.
 * No shadow: panels sit on the page, they do not float. Server-component friendly.
 */
export function Panel({
  title,
  description,
  actions,
  headingLevel = 2,
  padding = "default",
  id,
  className,
  children,
}: PanelProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const headingId = id ? `${id}-title` : undefined;
  const hasHeader = Boolean(title || description || actions);

  return (
    <section
      id={id}
      aria-labelledby={title && headingId ? headingId : undefined}
      className={cx("min-w-0 rounded-panel border border-line bg-surface", className)}
    >
      {hasHeader ? (
        <div
          className={cx(
            "flex flex-col gap-3 px-4 pt-4 sm:flex-row sm:items-start sm:justify-between sm:px-6 sm:pt-5",
            padding === "flush" && "pb-4",
          )}
        >
          <div className="min-w-0">
            {title ? (
              <Heading id={headingId} className="text-lg font-semibold text-ink">
                {title}
              </Heading>
            ) : null}
            {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div
        className={cx(
          padding === "default" && "px-4 pb-4 sm:px-6 sm:pb-6",
          padding === "default" && (hasHeader ? "pt-4" : "pt-4 sm:pt-6"),
          padding === "flush" && "overflow-hidden rounded-b-panel",
          padding === "flush" && !hasHeader && "rounded-t-panel",
        )}
      >
        {children}
      </div>
    </section>
  );
}
