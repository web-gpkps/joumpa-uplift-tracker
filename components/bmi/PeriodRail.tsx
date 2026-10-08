import Link from "next/link";
import { cx } from "@/components/ui/cx";
import { describeWeekStart, shortDate } from "@/components/shell/programme-calendar";

export type RailPeriod = {
  period: number;
  /** Planned check date (bmiCheckDate). */
  date: string;
  checked: number;
  staffCount: number;
  phase: "past" | "current" | "future";
};

type PeriodRailProps = {
  periods: RailPeriod[];
  selected: number;
  hrefForPeriod: (period: number) => string;
};

function BmiMarker() {
  // Same square-turned-45° marker the 10-week rail uses for BMI weeks.
  return <span aria-hidden="true" className="inline-block size-1.5 shrink-0 rotate-45 bg-ink-muted" />;
}

/**
 * The five BMI checks as a compact rail (echo of the 10-week WeekRail): each cell is a
 * real link to ?periode=P, shows the planned Monday and how many staff are measured.
 * Current period: thicker --brand base. Selected: 2 px ink ring plus aria-current.
 */
export function PeriodRail({ periods, selected, hrefForPeriod }: PeriodRailProps) {
  return (
    <nav aria-label="Pilih periode cek BMI" className="w-full max-w-2xl">
      <ol className="grid grid-cols-5 gap-1">
        {periods.map((p) => {
          const isSelected = p.period === selected;
          const isCurrent = p.phase === "current";
          const isPast = p.phase === "past";
          const label = [
            `Periode ${p.period}`,
            `cek ${describeWeekStart(p.date)}`,
            isCurrent ? "periode berjalan" : null,
            `${p.checked} dari ${p.staffCount} SDM sudah dicek`,
          ]
            .filter(Boolean)
            .join(", ");
          return (
            <li key={p.period} className="flex min-w-0">
              <Link
                href={hrefForPeriod(p.period)}
                aria-label={label}
                aria-current={isSelected ? "page" : undefined}
                scroll={false}
                className={cx(
                  "flex min-h-16 w-full min-w-0 flex-col items-start gap-0.5 rounded-control border px-1.5 py-1.5 sm:px-2",
                  "transition-colors duration-150",
                  isCurrent
                    ? "border-brand border-b-[3px] bg-brand-tint"
                    : isPast
                      ? "border-transparent bg-neutral-tint hover:border-line-strong"
                      : "border-line bg-surface hover:border-line-strong",
                  isSelected && "ring-2 ring-ink ring-inset",
                )}
              >
                <span
                  className={cx(
                    "flex items-center gap-1 text-xs font-semibold",
                    isCurrent ? "text-brand" : "text-ink",
                  )}
                >
                  <BmiMarker />
                  Cek {p.period}
                </span>
                <time dateTime={p.date} className="text-xs whitespace-nowrap text-ink-muted">
                  {shortDate(p.date)}
                </time>
                <span className="text-xs text-ink-muted tabular-nums">
                  {p.checked}/{p.staffCount}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
