import Link from "next/link";
import type { ReactNode } from "react";
import { SEMUA, TOTAL, weeklyReport } from "@/lib/aggregate";
import { formatHariTanggal, formatTanggal } from "@/lib/dates";
import { formatScore } from "@/lib/format";
import { weekStart } from "@/lib/rules";
import { hrefs, lastChangedLabel, stationCodes, trackerData, type Workspace, type WorkspaceAccess } from "@/lib/workspace";
import { saveWeeklyFindings } from "./actions";
import { Logo } from "@/components/shell/Logo";
import { WeekRail } from "@/components/shell/WeekRail";
import { programmeStatus } from "@/components/shell/programme-calendar";
import { PageHeader } from "@/components/ui/PageHeader";
import { StationFilter } from "@/components/ui/StationFilter";
import { EmptyState } from "@/components/ui/States";
import { ActionProgressTable } from "@/components/ringkasan/DashboardTables";
import { withoutTotals } from "@/components/ringkasan/data";
import { FindingsEditor, PrintedFindings } from "./FindingsEditor";
import { PrintButton } from "./PrintButton";
import { BmiPeriodTable, TrendTable, WeeklyPerformanceTable } from "./ReportTables";
import { TrendChart } from "./TrendChart";

const linkClass = "font-semibold text-brand underline underline-offset-2";

/** Jump links for the screen version (the printed report reads top to bottom). */
const SECTIONS = [
  { id: "bagian-a", letter: "A", label: "Performa" },
  { id: "bagian-b", letter: "B", label: "Tindak lanjut" },
  { id: "bagian-c", letter: "C", label: "BMI" },
  { id: "bagian-d", letter: "D", label: "Tren" },
  { id: "bagian-e", letter: "E", label: "Temuan" },
] as const;

export function LaporanView({
  ws,
  access,
  today,
  week,
  station,
}: {
  ws: Workspace;
  access: WorkspaceAccess;
  today: string;
  week: number;
  /** KPS / owner: print one station's report (?stasiun=SUB); null = all stations. */
  station: string | null;
}) {
  const links = hrefs(access);
  const data = trackerData(ws, station);
  const s = data.settings;
  const single = !ws.isKps || station !== null;
  /** KPS or the owner looking at one station: that station's findings are read-only here. */
  const kpsStationView = ws.isKps && station !== null;
  const scopeName = station ? `Stasiun ${station}` : single ? ws.scopeLabel : "Semua stasiun";
  const weekHref = (w: number) => links.to("laporan", { minggu: w, stasiun: station });
  const report = weeklyReport(data, week, today);
  const programme = programmeStatus(s, today);

  const totalPerf = report.performance.find((r) => r.key === TOTAL);
  const totalBmi = report.bmi.find((r) => r.key === TOTAL);
  const stationTrend = report.trend.filter((r) => r.key !== SEMUA);
  const semua = report.trend.find((r) => r.key === SEMUA) ?? null;
  const trendRows = withoutTotals(report.trend, single);
  const trendEmpty = trendRows.every((r) => r.weeks.every((v) => v === null));
  const weekNotStarted = weekStart(week, s) > today;

  const own = ws.weeklyReports.find((r) => r.week === week && r.scope === ws.scope) ?? null;
  const viewed = station ? (ws.weeklyReports.find((r) => r.week === week && r.scope === station) ?? null) : null;
  const stationFindings = ws.isKps && !station
    ? stationCodes(ws).map((code) => ({
        code,
        row: ws.weeklyReports.find((r) => r.week === week && r.scope === code) ?? null,
      }))
    : [];

  return (
    <div className="flex flex-col gap-6 print:gap-4">
      <div className="hidden print:block">
        <Logo height={48} />
      </div>

      <PageHeader
        title={`Laporan Mingguan, Minggu ke-${week}`}
        context={scopeName}
        description="Kenaikan performa SDM dan tindak lanjut Uplifting Service JOUMPA."
        actions={<PrintButton label={station ? `Cetak laporan ${station}` : undefined} />}
      >
        {ws.isKps ? (
          <StationFilter
            label="Laporan untuk stasiun"
            current={station}
            options={[null, ...stationCodes(ws)].map((code) => ({
              code,
              label: code ?? "Semua stasiun",
              href: links.to("laporan", { minggu: week, stasiun: code }),
            }))}
          />
        ) : null}
        <dl className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-[auto_1fr] print:grid-cols-[auto_1fr_auto_1fr]">
          <dt className="text-ink-muted">Periode</dt>
          <dd className="font-semibold text-ink">
            {formatTanggal(report.periodStart)} s.d. {formatTanggal(report.periodEnd)}
          </dd>
          <dt className="text-ink-muted">Periode cek BMI terkait</dt>
          <dd className="text-ink">
            Cek ke-{report.bmiPeriod} (rencana {formatTanggal(report.bmiPlannedDate)})
          </dd>
          <dt className="text-ink-muted">Lingkup</dt>
          <dd className="text-ink">{kpsStationView ? `Stasiun ${station} (dicetak KPS)` : single ? ws.scopeLabel : "Semua stasiun (KPS)"}</dd>
          <dt className="text-ink-muted">Posisi tindak lanjut per</dt>
          <dd className="text-ink">{formatTanggal(today)}</dd>
        </dl>
      </PageHeader>

      <section aria-labelledby="pilih-minggu" className="flex flex-col gap-2" data-print="hide">
        <h2 id="pilih-minggu" className="section-label">
          Pilih minggu laporan. Semua bagian di bawah mengikuti minggu yang dipilih; cetak setiap Jumat untuk OCS,
          OAO dan GM cabang.
        </h2>
        {ws.schedule ? (
          <WeekRail
            settings={ws.schedule}
            today={today}
            selectedWeek={week}
            hrefForWeek={weekHref}
            showSummary={false}
            label="Minggu laporan"
          />
        ) : null}
      </section>

      <nav
        aria-label="Bagian laporan"
        data-print="hide"
        className="flex flex-wrap items-center gap-2 md:sticky md:top-0 md:z-10 md:-mx-2 md:bg-paper md:px-2 md:py-2"
      >
        <span className="section-label mr-1">Lompat ke</span>
        {SECTIONS.map((sec) => (
          <a
            key={sec.id}
            href={`#${sec.id}`}
            className="inline-flex min-h-11 items-center rounded-control border border-line-strong bg-surface px-3 text-sm text-ink transition-colors duration-150 hover:bg-neutral-tint sm:min-h-9"
          >
            <span className="font-semibold">{sec.letter}</span>
            <span className="ml-1.5">{sec.label}</span>
          </a>
        ))}
      </nav>

      {programme.phase === "before" ? (
        <p className="text-sm text-ink" data-print="hide">
          Program belum mulai: Minggu ke-1 dimulai {formatHariTanggal(programme.startDate)}. Bagian A, C dan D terisi setelah
          nilai praktik dan cek BMI pertama dicatat; bagian B sudah berisi posisi tindak lanjut hari ini.
        </p>
      ) : null}

      <article
        aria-label={`Isi laporan Minggu ke-${week}`}
        className="flex flex-col gap-8 rounded-panel border border-line bg-surface p-4 sm:p-6 print:gap-5 print:border-0 print:p-0"
      >
        <Section
          id="bagian-a"
          title="A. Performa SDM minggu ini"
          subtitle="Rata-rata skor praktik aspek A sampai F, skala 1 sampai 5."
          note={
            weekNotStarted ? (
              <>Minggu ke-{week} belum berjalan (mulai {formatHariTanggal(weekStart(week, s))}).</>
            ) : totalPerf && totalPerf.assessed === 0 ? (
              <>
                Belum ada nilai untuk Minggu ke-{week}.{" "}
                <Link href={links.to("performa", { minggu: week })} className={linkClass} data-print="hide">
                  Isi nilai Minggu ke-{week}
                </Link>
              </>
            ) : null
          }
          footnote={`* Kenaikan vs baseline = rata-rata minggu ini (SDM yang dinilai) dikurangi rata-rata baseline training semua SDM, sesuai rumus workbook. Sesuai = rata-rata ≥ ${formatScore(s.passAvgMin)}; Tidak Sesuai = di bawah ${formatScore(s.improveAvgMin)}.`}
        >
          <TableFrame>
            <WeeklyPerformanceTable
              caption={`Performa SDM Minggu ke-${week}`}
              rows={withoutTotals(report.performance, single)}
            />
          </TableFrame>
        </Section>

        <Section
          id="bagian-b"
          title="B. Progres tindak lanjut rekomendasi"
          subtitle={`Posisi per ${formatTanggal(today)}, tidak bergantung pada minggu yang dipilih.`}
        >
          <TableFrame>
            <ActionProgressTable
              caption="Progres tindak lanjut rekomendasi per laporan"
              rows={withoutTotals(report.actionProgress, single)}
            />
          </TableFrame>
        </Section>

        <Section
          id="bagian-c"
          title="C. Cek BMI, tinggi dan berat badan, periode terkait"
          subtitle={`Cek ke-${report.bmiPeriod}, rencana ${formatHariTanggal(report.bmiPlannedDate)}.`}
          note={
            totalBmi && totalBmi.checked === 0 ? (
              <>
                Belum ada cek BMI periode {report.bmiPeriod} yang tercatat.{" "}
                {report.bmiPlannedDate <= today ? (
                  <Link href={links.to("bmi", { periode: report.bmiPeriod })} className={linkClass} data-print="hide">
                    Catat cek BMI periode {report.bmiPeriod}
                  </Link>
                ) : null}
              </>
            ) : null
          }
          footnote="Kolom tinggi tidak memenuhi memakai cek terakhir tiap SDM dan baru terhitung bila L/P serta standar tinggi minimum terisi."
        >
          <TableFrame>
            <BmiPeriodTable caption={`Cek BMI periode ${report.bmiPeriod}`} rows={withoutTotals(report.bmi, single)} />
          </TableFrame>
        </Section>

        <Section
          id="bagian-d"
          title={`D. Rata-rata skor praktik per stasiun, Mg 1 sampai ${s.weeks}`}
          subtitle="Apakah rata-rata skor tiap stasiun naik dari minggu ke minggu?"
        >
          {trendEmpty ? (
            <EmptyState
              title="Belum ada nilai mingguan, jadi tren belum bisa digambar"
              layout="inline"
              className="rounded-control bg-neutral-tint px-3 print:bg-transparent print:px-0"
            >
              Grafik dan tabel tren muncul setelah nilai praktik Minggu ke-1 diisi di Log Performa
              {programme.phase === "before" ? ` (mulai ${formatHariTanggal(programme.startDate)})` : ""}.
            </EmptyState>
          ) : (
            <>
              <TrendChart
                rows={single ? trendRows : stationTrend}
                reference={single ? null : semua}
                passAvgMin={s.passAvgMin}
              />
              <TableFrame>
                <TrendTable caption="Rata-rata skor praktik per stasiun per minggu" rows={trendRows} selectedWeek={week} />
              </TableFrame>
            </>
          )}
        </Section>

        <div className="flex flex-col gap-8 print:break-inside-avoid print:gap-6">
          <Section
            id="bagian-e"
            title="E. Temuan, kendala dan rencana minggu depan"
            subtitle="Diisi PIC atau Manager JOUMPA."
          >
            {kpsStationView ? (
              <div className="flex flex-col gap-2">
                {viewed?.findings ? (
                  <>
                    <p className="text-sm whitespace-pre-wrap text-ink">{viewed.findings}</p>
                    <p className="text-xs text-ink-muted" data-print="hide">
                      {lastChangedLabel(viewed, ws)}. Hanya baca: temuan ini diisi lewat tautan {station}.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="rounded-control bg-neutral-tint px-3 py-2 text-sm text-ink" data-print="hide">
                      Stasiun {station} belum mengisi temuan Minggu ke-{week}. Temuan diisi lewat tautan {station}; di
                      kertas bagian ini tercetak sebagai baris kosong untuk ditulis tangan.
                    </p>
                    <PrintedFindings text="" />
                  </>
                )}
                <p className="text-xs text-ink-muted" data-print="hide">
                  Temuan KPS diisi di{" "}
                  <Link href={links.to("laporan", { minggu: week })} className={linkClass}>
                    laporan semua stasiun
                  </Link>
                  .
                </p>
              </div>
            ) : (
            <FindingsEditor
              key={week}
              action={saveWeeklyFindings.bind(null, access.key, week)}
              week={week}
              scopeName={single ? ws.scopeLabel : "KPS"}
              printLabel={single ? undefined : "Temuan KPS"}
              initialFindings={own?.findings ?? ""}
              lastChanged={own ? lastChangedLabel(own, ws) : null}
            />
            )}
            {stationFindings.length > 0 ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-ink">Temuan stasiun Minggu ke-{week} (hanya baca)</h3>
                <dl className="flex flex-col divide-y divide-line rounded-control border border-line">
                  {stationFindings.map(({ code, row }) => (
                    <div key={code} className="grid gap-1 px-3 py-2 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-4">
                      <dt className="text-sm font-semibold text-ink">{code}</dt>
                      <dd className="text-sm">
                        {row?.findings ? (
                          <>
                            <p className="whitespace-pre-wrap text-ink">{row.findings}</p>
                            <p className="mt-1 text-xs text-ink-muted" data-print="hide">
                              {lastChangedLabel(row, ws)}
                            </p>
                          </>
                        ) : (
                          <span className="text-ink-muted">Belum diisi lewat tautan {code}.</span>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
          </Section>

          <SignatureBlock />
        </div>
      </article>
    </div>
  );
}

function Section({
  id,
  title,
  subtitle,
  note,
  footnote,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  note?: ReactNode;
  footnote?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-judul`}
      className="flex min-w-0 scroll-mt-4 flex-col gap-3 md:scroll-mt-20 print:break-inside-avoid"
    >
      <div>
        <h2 id={`${id}-judul`} className="text-lg font-semibold text-ink print:text-base">
          {title}
        </h2>
        {subtitle ? <p className="text-sm text-ink-muted">{subtitle}</p> : null}
      </div>
      {note ? (
        <p className="rounded-control bg-neutral-tint px-3 py-2 text-sm text-ink print:bg-transparent print:p-0">{note}</p>
      ) : null}
      {children}
      {footnote ? <p className="text-xs text-ink-muted">{footnote}</p> : null}
    </section>
  );
}

/** Bordered table; on paper the rows tighten so a section fits beside the next one. */
function TableFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-control border border-line print:[&_td]:h-6 print:[&_td]:py-0.5 print:[&_th]:h-6 print:[&_th]:py-0.5">
      {children}
    </div>
  );
}

/** As in the workbook (rows 68 to 73): two signatures with room to sign. */
function SignatureBlock() {
  return (
    <div className="grid gap-8 pt-2 text-sm text-ink sm:grid-cols-2 print:grid-cols-2 print:break-inside-avoid">
      {[
        { lead: "Disusun oleh,", role: "Manager / PIC JOUMPA Cabang" },
        { lead: "Mengetahui,", role: "General Manager Cabang" },
      ].map(({ lead, role }) => (
        <div key={role} className="flex flex-col">
          <p>{lead}</p>
          <span aria-hidden="true" className="h-16" />
          <p aria-label="Tanda tangan dan nama">( ........................................ )</p>
          <p className="font-semibold">{role}</p>
        </div>
      ))}
    </div>
  );
}
