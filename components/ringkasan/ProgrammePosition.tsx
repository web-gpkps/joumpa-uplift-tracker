import Link from "next/link";
import { formatHariTanggal, formatTanggal, formatTanggalPendek } from "@/lib/dates";
import type { SheetLinks } from "@/lib/workspace/access";
import type { Workspace } from "@/lib/workspace";
import { WeekRail } from "@/components/shell/WeekRail";
import { nextBmiCheck, programmeStatus } from "@/components/shell/programme-calendar";
import type { Settings } from "@/lib/rules";

const linkClass = "font-semibold text-brand underline underline-offset-2";

type ProgrammePositionProps = {
  ws: Workspace;
  settings: Settings;
  today: string;
  links: SheetLinks;
  /** Before week 1: what can be done now. */
  firstSteps: { dueBeforeStart: number; noGender: number };
};

/**
 * Dashboard question 1 (docs/UX.md §3): where are we in the programme? One sentence in
 * plain words, the 10-week rail (each week opens its Laporan Mingguan), and before the
 * start, what to do first.
 */
export function ProgrammePosition({ ws, settings: s, today, links, firstSteps }: ProgrammePositionProps) {
  const status = programmeStatus(s, today);
  const next = nextBmiCheck(s, today);

  let headline: string;
  if (status.phase === "before") {
    const when = status.daysUntilStart === 1 ? "besok" : `${status.daysUntilStart} hari lagi`;
    headline = `Program mulai ${formatHariTanggal(status.startDate)} (${when})`;
  } else if (status.phase === "during") {
    headline = `Minggu ke-${status.week} dari ${s.weeks}`;
  } else {
    headline = `Program ${s.weeks} minggu selesai ${formatTanggal(status.endDate)}`;
  }

  const detail: string[] = [];
  if (status.phase === "during") detail.push(`${formatTanggalPendek(status.start)} s.d. ${formatTanggal(status.end)}`);
  if (next) {
    detail.push(
      next.date === today
        ? `cek BMI periode ${next.period} hari ini`
        : `cek BMI berikutnya periode ${next.period}, ${formatHariTanggal(next.date)}`,
    );
  } else if (status.phase !== "before") {
    detail.push(`cek BMI terakhir (periode ${s.bmiPeriods}) sudah lewat`);
  }

  return (
    <section
      aria-labelledby="posisi-program"
      className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-4 sm:p-6"
    >
      <div>
        <h2 id="posisi-program" className="text-xl font-semibold text-ink">
          {headline}
        </h2>
        {detail.length > 0 ? (
          <p className="mt-1 text-sm text-ink-muted">{detail.join(" · ").replace(/^./, (c) => c.toUpperCase())}.</p>
        ) : null}
      </div>

      {ws.schedule ? (
        <div className="flex flex-col gap-1.5">
          <WeekRail
            settings={ws.schedule}
            today={today}
            showSummary={false}
            hrefForWeek={(w) => links.to("laporan", { minggu: w })}
            label="Jadwal 10 minggu; pilih minggu untuk membuka laporannya"
          />
          <p className="text-xs text-ink-muted">Pilih minggu untuk membuka Laporan Mingguan minggu itu.</p>
        </div>
      ) : null}

      {status.phase === "before" ? (
        <div>
          <h3 className="section-label">Yang bisa dikerjakan sebelum Minggu ke-1</h3>
          <ol className="mt-2 flex list-decimal flex-col gap-2 pl-5 text-sm text-ink marker:text-ink-muted">
            {firstSteps.dueBeforeStart > 0 ? (
              <li>
                Perbarui {firstSteps.dueBeforeStart} tindak lanjut yang jatuh tempo sebelum Minggu ke-1 di{" "}
                <Link href={links.tindakLanjut} className={linkClass}>
                  Tindak Lanjut
                </Link>
                .
              </li>
            ) : null}
            {firstSteps.noGender > 0 ? (
              <li>
                Isi L/P untuk {firstSteps.noGender} SDM di{" "}
                <Link href={links.sdm} className={linkClass}>
                  Master SDM
                </Link>
                , supaya syarat tinggi badan bisa dicek sejak cek BMI pertama.
              </li>
            ) : null}
            <li>
              {formatHariTanggal(s.bmiFirstCheck)}: catat cek BMI periode 1 di{" "}
              <Link href={links.to("bmi", { periode: 1 })} className={linkClass}>
                Cek BMI
              </Link>
              , lalu isi nilai praktik Minggu ke-1 di{" "}
              <Link href={links.to("performa", { minggu: 1 })} className={linkClass}>
                Log Performa
              </Link>
              .
            </li>
          </ol>
        </div>
      ) : null}
    </section>
  );
}
