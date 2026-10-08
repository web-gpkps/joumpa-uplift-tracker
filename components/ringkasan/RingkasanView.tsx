import type { ReactNode } from "react";
import { TOTAL, dashboard, staffDerived } from "@/lib/aggregate";
import { formatHariTanggal } from "@/lib/dates";
import { formatScore } from "@/lib/format";
import { reportGroupOf } from "@/lib/rules";
import { hrefs, stationCodes, trackerData, type Workspace, type WorkspaceAccess } from "@/lib/workspace";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StationFilter } from "@/components/ui/StationFilter";
import { AttentionPanel } from "./AttentionPanel";
import { ProgrammePosition } from "./ProgrammePosition";
import { KpiGrid, StationCards } from "./StationCards";
import { StationComparison } from "@/components/dashboard/StationComparison";
import { dashboardSummary } from "@/lib/dashboard";
import { ActionProgressTable, BmiOverviewTable, PerformanceTable, ReplacementOverviewTable } from "./DashboardTables";
import { buildAttention } from "./attention";
import { withoutTotals } from "./data";
import { buildVerification } from "./verification";
import { VerificationPanel } from "./VerificationPanel";

type RingkasanViewProps = {
  ws: Workspace;
  access: WorkspaceAccess;
  today: string;
  /** KPS station filter (?stasiun=SUB), already validated; null = all stations. */
  stationFilter: string | null;
};

export function RingkasanView({ ws, access, today, stationFilter }: RingkasanViewProps) {
  const links = hrefs(access);
  const allStations = stationCodes(ws);
  const station = ws.isKps ? stationFilter : ws.scope;
  const single = station !== null;
  const stations = station ? [station] : allStations;

  const data = trackerData(ws, ws.isKps ? stationFilter : null);
  const s = data.settings;
  const attention = buildAttention(data, stations, today);
  const verification = buildVerification(data, stations);
  const dash = dashboard(data, today);

  const assessedByKey: Record<string, number> = {};
  for (const d of staffDerived(data)) {
    if (d.rekap?.latest == null || !d.staff.station) continue;
    assessedByKey[d.staff.station] = (assessedByKey[d.staff.station] ?? 0) + 1;
    assessedByKey[TOTAL] = (assessedByKey[TOTAL] ?? 0) + 1;
  }

  const group = station ? reportGroupOf(station) : null;
  const sharedGroup = station && group && group !== station ? group : null;
  const asOf = formatHariTanggal(today);
  const totalBmiChecked = dash.bmi.find((r) => r.key === TOTAL)?.everChecked ?? 0;
  const heightInactive = verification.noGender.total > 0 || verification.minHeightMissing.length > 0;
  const programme = attention.programme;

  const summary = dashboardSummary(data, today, stations);

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <PageHeader
        title="Dashboard"
        context={ws.scopeLabel}
        description={`Posisi per ${asOf}: posisi program, angka utama, yang perlu ditangani, lalu perbandingan stasiun.`}
      >
        {ws.isKps ? (
          <StationFilter
            current={stationFilter}
            options={[null, ...allStations].map((code) => ({
              code,
              label: code ?? "Semua stasiun",
              href: links.to("dashboard", { stasiun: code }),
            }))}
          />
        ) : null}
      </PageHeader>

      <ProgrammePosition
        ws={ws}
        settings={s}
        today={today}
        links={links}
        firstSteps={{
          dueBeforeStart:
            programme.phase === "before"
              ? attention.dueItems.filter((d) => d.dueDate < programme.startDate).length
              : 0,
          noGender: verification.noGender.total,
        }}
      />

      <section aria-labelledby="angka-utama" className="flex flex-col gap-3">
        <div>
          <h2 id="angka-utama" className="text-lg font-semibold text-ink">
            Angka utama{single ? ` ${station}` : ""}
          </h2>
          <p className="text-sm text-ink-muted">
            {programme.phase === "before"
              ? "Program belum mulai, jadi penilaian dan cek BMI belum dihitung. Tindak lanjut dan penggantian sudah berjalan."
              : "Angka nyata hari ini, masing-masing dengan dasar hitungnya. Pilih angka untuk membuka sheet-nya."}
          </p>
        </div>
        <KpiGrid kpis={summary.kpis} links={links} />
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <AttentionPanel attention={attention} links={links} multiStation={!single} />
        {/* A short list, so it sits beside the exceptions on wide screens and under them on phones. */}
        <VerificationPanel v={verification} links={links} multiStation={!single} />
      </div>

      <section aria-labelledby="perbandingan" className="flex flex-col gap-3">
        <div>
          <h2 id="perbandingan" className="text-lg font-semibold text-ink">
            {single ? `Stasiun ${station}` : "Perbandingan stasiun"}
          </h2>
          <p className="text-sm text-ink-muted">
            {single
              ? "Posisi stasiun ini. Pilih angka untuk membuka sheet yang sudah disaring ke stasiun ini."
              : "Satu baris per stasiun. Pilih angka untuk membuka sheet yang sudah disaring ke stasiun itu."}
            {summary.comparison.some((r) => r.sharedGroup) ? " CGK dan HLP berbagi satu laporan tindak lanjut (CGK & HLP)." : ""}
          </p>
        </div>
        <div className="hidden md:block">
          <div className="rounded-panel border border-line bg-surface">
            <StationComparison summary={summary} links={links} />
          </div>
        </div>
        <div className="md:hidden">
          <StationCards summary={summary} links={links} />
        </div>
      </section>

      <details className="group rounded-panel border border-line bg-surface">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-panel px-4 py-3 sm:px-6 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block text-lg font-semibold text-ink">Detail per bagian</span>
            <span className="block text-sm text-ink-muted">
              Bagian 1 sampai 4 dari sheet Dashboard di workbook, dengan rumus yang sama.
              {single ? ` Hanya ${station}.` : " Baris TOTAL menjumlahkan semua stasiun."}
            </span>
          </span>
          <span className="shrink-0 text-sm font-semibold text-brand">
            <span className="group-open:hidden">Tampilkan</span>
            <span className="hidden group-open:inline">Sembunyikan</span>
          </span>
        </summary>

        <div className="flex flex-col gap-4 border-t border-line bg-paper p-3 sm:p-4">
          <Panel
            headingLevel={3}
            title="1. Progres tindak lanjut per laporan"
            description={sharedGroup ? `Laporan ${sharedGroup} dipakai bersama stasiun CGK dan HLP.` : undefined}
            padding="flush"
          >
            <ActionProgressTable caption="Progres tindak lanjut per laporan" rows={withoutTotals(dash.actionProgress, single)} />
          </Panel>

          <Panel headingLevel={3} title="2. Kesesuaian dan kenaikan performa SDM per stasiun" padding="flush">
            <PerformanceTable
              caption="Kesesuaian dan kenaikan performa SDM per stasiun"
              rows={withoutTotals(dash.performance, single)}
              assessedByKey={assessedByKey}
            />
            <Footnotes>
              <p>
                * Termasuk “Sesuai dengan Catatan”. Kriteria 6.2: Sesuai = rata-rata praktik ≥ {formatScore(s.passAvgMin)} dan
                post-test ≥ {s.posttestMin}. Kesimpulan beda = kesimpulan di laporan tidak sama dengan hasil hitung kriteria.
              </p>
              <p>
                ** Kenaikan = rata-rata skor terkini SDM yang sudah dinilai dikurangi rata-rata baseline semua SDM (rumus
                workbook). Selama baru sebagian SDM dinilai, angka ini belum mewakili seluruh stasiun: lihat “dari” di
                kolom skor terkini.
              </p>
            </Footnotes>
          </Panel>

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Panel headingLevel={3} title="3. BMI, tinggi dan berat badan (cek terakhir tiap SDM)" padding="flush">
              <BmiOverviewTable caption="BMI, tinggi dan berat badan per stasiun" rows={withoutTotals(dash.bmi, single)} />
              {totalBmiChecked === 0 || heightInactive ? (
                <Footnotes>
                  {totalBmiChecked === 0 ? (
                    <p>Belum ada cek BMI yang tercatat. Cek periode 1 dijadwalkan {formatHariTanggal(s.bmiFirstCheck)}.</p>
                  ) : null}
                  {heightInactive ? (
                    <p>“Tinggi tidak memenuhi” baru terhitung untuk SDM yang L/P-nya terisi, setelah standar tinggi minimum diisi di Parameter.</p>
                  ) : null}
                </Footnotes>
              ) : null}
            </Panel>

            <Panel
              headingLevel={3}
              title={`4. Penggantian SDM (batas ${formatHariTanggal(s.replacementDeadline)})`}
              padding="flush"
            >
              <ReplacementOverviewTable
                caption="Penggantian SDM per laporan"
                rows={withoutTotals(dash.replacements, single)}
                rowLabel={(key) => (sharedGroup && key === sharedGroup ? `${station} (laporan ${key})` : key)}
              />
            </Panel>
          </div>
        </div>
      </details>
    </div>
  );
}

function Footnotes({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-t border-line px-4 py-3 text-xs text-ink-muted sm:px-6">{children}</div>
  );
}
