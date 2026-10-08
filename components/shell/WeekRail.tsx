import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import {
  describeWeekStart,
  programmeSummary,
  railWeeks,
  shortDate,
  type ProgrammeSettings,
  type RailWeek,
} from "./programme-calendar";

type WeekRailProps = {
  /** public.settings row as returned by Supabase (snake_case), or lib/rules Settings (camelCase). */
  settings: ProgrammeSettings;
  /** Today in Asia/Jakarta, 'YYYY-MM-DD'. Get it with todayInJakarta() at request time. */
  today: string;
  /** Week shown on the screen (entry grid, report). Gets a 2 px ink ring and aria-current / aria-pressed. */
  selectedWeek?: number;
  /** Makes each week a link, e.g. (w) => `/performa?minggu=${w}`. Works in server components. */
  hrefForWeek?: (week: number) => string;
  /** Makes each week a button. Only from a client component. Ignored when hrefForWeek is set. */
  onSelectWeek?: (week: number) => void;
  /**
   * "full": week, start date and BMI label per cell; 5 per row on phones, one row from 768 px.
   * "compact": numbers only, 28 px cells, for the header context line. Compact is for
   * display; for a week selector use "full" (its cells are ≥ 44 px tall).
   */
  variant?: "full" | "compact";
  /** Show the one-sentence status above the rail. Default true. */
  showSummary?: boolean;
  /** Accessible name of the list. */
  label?: string;
  className?: string;
};

/**
 * The 10-week rail (DESIGN.md identity motif): the current week and the BMI-check Mondays,
 * never colour-only. No hooks, so it renders on the server and inside client components.
 */
export function WeekRail({
  settings,
  today,
  selectedWeek,
  hrefForWeek,
  onSelectWeek,
  variant = "full",
  showSummary = true,
  label = `Jadwal ${settings.weeks} minggu pemantauan`,
  className,
}: WeekRailProps) {
  const weeks = railWeeks(settings, today);
  const compact = variant === "compact";
  const interactive = Boolean(hrefForWeek || onSelectWeek);
  const gridStyle = { "--rail-cols": settings.weeks } as CSSProperties;

  return (
    <div className={cx("flex min-w-0 flex-col gap-2", className)}>
      {showSummary ? (
        <p className={cx("text-ink", compact ? "text-xs" : "text-sm")}>
          {programmeSummary(settings, today)}
        </p>
      ) : null}
      <div className={cx("flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2")}>
        <ol
          aria-label={label}
          style={gridStyle}
          className={cx(
            "grid min-w-0 gap-1",
            compact
              ? "grid-cols-[repeat(var(--rail-cols),1.75rem)]"
              : "w-full grid-cols-5 md:grid-cols-[repeat(var(--rail-cols),minmax(0,1fr))]",
          )}
        >
          {weeks.map((week) => (
            <li key={week.week} className="flex min-w-0">
              <WeekCell
                week={week}
                compact={compact}
                selected={selectedWeek === week.week}
                interactive={interactive}
                href={hrefForWeek?.(week.week)}
                onSelect={onSelectWeek}
              />
            </li>
          ))}
        </ol>
        <p className="flex items-center gap-1.5 text-xs text-ink-muted">
          <BmiMarker />
          Cek BMI
        </p>
      </div>
    </div>
  );
}

function BmiMarker({ className }: { className?: string }) {
  // A small square turned 45°: a quiet echo of the gate geometry, not the logo mark.
  return (
    <span
      aria-hidden="true"
      className={cx("inline-block size-1.5 shrink-0 rotate-45 bg-ink-muted", className)}
    />
  );
}

function describe(week: RailWeek): string {
  const parts = [`Minggu ke-${week.week}`, `mulai ${describeWeekStart(week.start)}`];
  if (week.phase === "current") parts.push("minggu berjalan");
  if (week.phase === "past") parts.push("sudah lewat");
  if (week.bmiPeriod) parts.push(`cek BMI periode ${week.bmiPeriod}`);
  return parts.join(", ");
}

type WeekCellProps = {
  week: RailWeek;
  compact: boolean;
  selected: boolean;
  interactive: boolean;
  href?: string;
  onSelect?: (week: number) => void;
};

function WeekCell({ week, compact, selected, interactive, href, onSelect }: WeekCellProps) {
  const isCurrent = week.phase === "current";
  const isPast = week.phase === "past";

  const box = cx(
    "relative flex w-full rounded-control border text-left",
    "transition-colors duration-150",
    compact
      ? cx("h-7 items-center justify-center", interactive && "min-h-11 sm:min-h-7")
      : "min-h-16 flex-col items-start justify-start gap-0.5 px-1.5 py-1.5 sm:px-2",
    isCurrent
      ? "border-brand bg-brand-tint border-b-[3px]"
      : isPast
        ? "border-transparent bg-neutral-tint"
        : "border-line bg-surface",
    selected && "ring-2 ring-ink ring-inset",
    interactive && !isCurrent && "hover:border-line-strong",
  );

  const content: ReactNode = compact ? (
    <span className="flex items-center gap-[3px]">
      <span
        className={cx(
          "text-xs tabular-nums",
          isCurrent ? "font-bold text-brand" : isPast ? "text-ink-muted" : "font-semibold text-ink",
        )}
      >
        {week.week}
      </span>
      {week.bmiPeriod ? <BmiMarker className="size-[5px]" /> : null}
    </span>
  ) : (
    <>
      <span
        className={cx(
          "text-xs font-semibold",
          isCurrent ? "text-brand" : isPast ? "text-ink-muted" : "text-ink",
        )}
      >
        Mg {week.week}
      </span>
      <time dateTime={week.start} className="text-xs whitespace-nowrap text-ink-muted">
        {shortDate(week.start)}
      </time>
      {week.bmiPeriod ? (
        <span className="flex items-center gap-1 text-xs text-ink-muted">
          <BmiMarker />
          BMI
        </span>
      ) : null}
    </>
  );

  const name = describe(week);

  if (href) {
    return (
      <Link
        href={href}
        aria-label={name}
        aria-current={selected ? "true" : undefined}
        className={box}
      >
        {content}
      </Link>
    );
  }
  if (onSelect) {
    return (
      <button
        type="button"
        aria-label={name}
        aria-pressed={selected}
        onClick={() => onSelect(week.week)}
        className={box}
      >
        {content}
      </button>
    );
  }
  return (
    <div className={box}>
      <span className="sr-only">{name}</span>
      <span aria-hidden="true" className="contents">
        {content}
      </span>
    </div>
  );
}
