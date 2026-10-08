import { bmiPeriodByStation, TOTAL, type BmiPeriodRow } from "@/lib/aggregate";
import { diffDays, formatHariTanggal } from "@/lib/dates";
import { bmiCheckDate, bmiSummary, type BmiCheckRow, type Settings } from "@/lib/rules";
import {
  firstParam,
  hrefs,
  changedVia,
  lastChangedLabel,
  shortDateTime,
  parseStation,
  ruleSettings,
  sortedStaff,
  stationCodes,
  type ScreenProps,
  type Workspace,
} from "@/lib/workspace";
import { ButtonLink } from "@/components/ui/Button";
import { DataTable, Td, Th, Tr } from "@/components/ui/DataTable";
import { PageHeader, PageLoading } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { StationFilter } from "@/components/ui/StationFilter";
import { HowToTip } from "@/components/ui/HowToTip";
import { RememberView } from "@/components/ui/RememberView";
import { oneTo, rememberScope } from "@/components/ui/remember";
import { StatusChip, toneForStatus } from "@/components/ui/StatusChip";
import { todayInJakarta } from "@/components/shell/programme-calendar";
import { BmiStaffRow } from "./BmiStaffRow";
import { BmiGrid, type BmiGridRow } from "./BmiGrid";
import { formatRatio } from "@/lib/format";
import { PeriodRail, type RailPeriod } from "./PeriodRail";

const TITLE = "Cek BMI 2 mingguan";
const DESCRIPTION =
  "Ukur tinggi dan berat tiap SDM pada tanggal cek, lalu simpan per baris. BMI dan kategori dihitung otomatis.";

/** "tautan ini, 8 Okt 07.55" (the grid column header already says "Terakhir diubah lewat"). */
function changedWhen(row: { updatedByLink?: string | null; updatedAt?: string | null }, ws: Workspace): string {
  const when = shortDateTime(row.updatedAt);
  return `${changedVia(row, ws)}${when ? `, ${when}` : ""}`;
}

/** The period whose planned date is the latest on or before today; period 1 before the first check. */
function defaultPeriod(s: Settings, today: string): number {
  let chosen = 1;
  for (let p = 1; p <= s.bmiPeriods; p++) {
    if (bmiCheckDate(p, s) <= today) chosen = p;
  }
  return chosen;
}

function relativeDay(date: string, today: string): string {
  const days = diffDays(date, today);
  if (days === 0) return "hari ini";
  if (days === 1) return "besok";
  if (days > 1) return `${days} hari lagi`;
  if (days === -1) return "kemarin";
  return `${-days} hari lalu`;
}

export function BmiLoading() {
  return <PageLoading title={TITLE} label="Memuat daftar SDM dan hasil cek BMI" />;
}

/** Workbook sheet "Cek BMI 2 Mingguan". */
export function BmiScreen({ access, ws, searchParams: query }: ScreenProps) {
  const links = hrefs(access);
  const today = todayInJakarta();
  // Without the schedule the BMI periods cannot be placed on dates.
  const settings = ws.schedule ? ruleSettings(ws.settings) : null;

  if (!settings) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={TITLE} context={ws.scopeLabel} description={DESCRIPTION} />
        <Panel>
          <ErrorState
            title="Jadwal cek BMI belum terbaca"
            cause="Tanggal cek pertama, jarak antar cek, atau jumlah periode belum ada di Parameter."
            action="Minta pemilik aplikasi melengkapi Parameter, lalu muat ulang halaman ini."
          />
        </Panel>
      </div>
    );
  }

  const stationFilter = parseStation(ws, query.stasiun);

  const requestedPeriod = Number(firstParam(query.periode));
  const period =
    Number.isInteger(requestedPeriod) && requestedPeriod >= 1 && requestedPeriod <= settings.bmiPeriods
      ? requestedPeriod
      : defaultPeriod(settings, today);
  const currentPeriod = bmiCheckDate(1, settings) <= today ? defaultPeriod(settings, today) : null;
  const plannedDates = Array.from({ length: settings.bmiPeriods }, (_, i) => bmiCheckDate(i + 1, settings));
  const plannedDate = plannedDates[period - 1];

  const href = (p: number, station: string | null) => links.to("bmi", { periode: p, stasiun: station });

  const data = {
    settings,
    staff: ws.staff,
    weeklyScores: [],
    bmiChecks: ws.bmiChecks as BmiCheckRow[],
    actionItems: [],
    replacements: [],
    stations: ws.stations,
  };
  // The row that matches what is on screen: one station, or TOTAL for KPS "Semua stasiun".
  const viewKey = stationFilter ?? (ws.isKps ? TOTAL : ws.scope);
  const periodRows = plannedDates.map((_, i) => bmiPeriodByStation(data, i + 1));
  const rowFor = (rows: BmiPeriodRow[]) => rows.find((r) => r.key === viewKey) ?? rows[rows.length - 1];
  const view = rowFor(periodRows[period - 1]);

  const railPeriods: RailPeriod[] = plannedDates.map((date, i) => {
    const row = rowFor(periodRows[i]);
    return {
      period: i + 1,
      date,
      checked: row.checked,
      staffCount: row.staffCount,
      phase: currentPeriod === i + 1 ? "current" : date < today ? "past" : "future",
    };
  });

  const staffInView = sortedStaff(ws).filter((st) => !stationFilter || st.station === stationFilter);
  const checksByStaff = new Map<string, Workspace["bmiChecks"]>();
  for (const c of ws.bmiChecks) {
    const list = checksByStaff.get(c.staffCode);
    if (list) list.push(c);
    else checksByStaff.set(c.staffCode, [c]);
  }

  const summaries = new Map(
    staffInView.map((st) => [st.code, bmiSummary((checksByStaff.get(st.code) ?? []) as BmiCheckRow[], st.gender, settings)]),
  );
  const gridRows: BmiGridRow[] = staffInView.map((st) => {
    const checks = checksByStaff.get(st.code) ?? [];
    const summary = summaries.get(st.code)!;
    const latest = checks.reduce<(typeof checks)[number] | null>(
      (a, c) => (!a || (c.updatedAt ?? "") > (a.updatedAt ?? "") ? c : a),
      null,
    );
    return {
      code: st.code,
      name: st.name ?? st.code,
      station: st.station,
      gender: st.gender,
      bmiNote: st.bmiNote,
      checks: summary.periods.map((p) =>
        p && p.heightCm !== null && p.weightKg !== null
          ? { date: p.checkDate, tb: p.heightCm, bb: p.weightKg, bmi: p.bmi, category: p.category }
          : null,
      ),
      weightDelta: summary.weightDelta,
      weighings: summary.periods.filter((p) => p?.weightKg !== null && p?.weightKg !== undefined).length,
      heightRequirement: summary.heightRequirement,
      changed: latest ? changedWhen(latest, ws) : null,
    };
  });

  const missingGender = staffInView.filter((st) => st.gender !== "L" && st.gender !== "P").length;
  const standardMissing =
    settings.minHeightFemale === null && settings.minHeightMale === null
      ? "Standar tinggi belum diisi di Parameter, jadi syarat tinggi badan belum bisa dinilai."
      : settings.minHeightFemale === null
        ? "Standar tinggi untuk perempuan (P) belum diisi di Parameter."
        : settings.minHeightMale === null
          ? "Standar tinggi untuk laki-laki (L) belum diisi di Parameter."
          : null;

  const scopeName = stationFilter ? `Stasiun ${stationFilter}` : ws.isKps ? "semua stasiun" : ws.scopeLabel;
  const stationOptions = ws.isKps
    ? [null, ...stationCodes(ws)].map((code) => {
        const row = periodRows[period - 1].find((r) => r.key === (code ?? TOTAL));
        return {
          code,
          label: code ?? "Semua stasiun",
          meta: row ? `${row.checked}/${row.staffCount}` : undefined,
          metaLabel: row ? `${row.checked} dari ${row.staffCount} SDM sudah dicek` : undefined,
          href: href(period, code),
        };
      })
    : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={TITLE} context={ws.scopeLabel} description={DESCRIPTION}>
        {stationOptions ? <StationFilter options={stationOptions} current={stationFilter} /> : null}
        <RememberView
          scope={rememberScope(access, ws)}
          allowed={{ periode: oneTo(settings.bmiPeriods), ...(ws.isKps ? { stasiun: stationCodes(ws) } : {}) }}
          shown={{ periode: String(period), stasiun: stationFilter }}
        />
        <div className="flex flex-col gap-3">
          <PeriodRail periods={railPeriods} selected={period} hrefForPeriod={(p) => href(p, stationFilter)} />
          <div className="flex flex-col gap-1">
            <p className="text-sm text-ink">
              <span className="font-semibold">Periode {period}</span>, dijadwalkan{" "}
              <time dateTime={plannedDate}>{formatHariTanggal(plannedDate)}</time> ({relativeDay(plannedDate, today)}).
            </p>
            <p className="text-sm text-ink">
              <span className="font-semibold tabular-nums">
                {view.checked} dari {view.staffCount} SDM
              </span>{" "}
              sudah dicek pada periode ini{ws.isKps ? ` (${scopeName})` : ""}.
            </p>
            {view.checked > 0 ? (
              <ul aria-label={`Kategori BMI periode ${period}`} className="mt-1 flex flex-wrap gap-2">
                {(
                  [
                    ["Normal", view.normal],
                    ["Kurus", view.kurus],
                    ["Overweight", view.overweight],
                    ["Obesitas", view.obesitas],
                  ] as const
                ).map(([label, n]) => (
                  <li key={label}>
                    <StatusChip label={`${label}: ${n}`} tone={toneForStatus(label)} />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </PageHeader>

      <Panel
        padding="flush"
        title={`Cek BMI ${scopeName}`}
        description={<HowToTip id="bmi">isi TB dan BB (desimal pakai koma, 165,5). Tanggal kosong memakai tanggal cek terjadwal. Kosongkan TB dan BB suatu periode untuk menghapus cek itu.</HowToTip>}
      >
        {staffInView.length === 0 ? (
          <div className="px-4 sm:px-6">
            <EmptyState
              title={`Belum ada SDM di ${scopeName}`}
              action={
                <ButtonLink href={links.sdm} variant="secondary">
                  Buka Master SDM
                </ButtonLink>
              }
            >
              Cek BMI dicatat per SDM. Tambahkan SDM stasiun ini di Master SDM, lalu kembali ke sini.
            </EmptyState>
          </div>
        ) : (
          <div className="px-4 pb-4 sm:px-6 sm:pb-6">
            <BmiGrid
              caption={`Cek BMI 2 mingguan, ${scopeName}`}
              rows={gridRows}
              accessKey={access.key}
              plannedDates={plannedDates}
              period={period}
              periodNote={period === currentPeriod ? "periode berjalan" : "periode yang dipilih"}
              showStation={ws.isKps && !stationFilter}
              summary={`${staffInView.length} SDM · ${view.checked} sudah dicek periode ${period}`}
              emptyState={<p className="text-sm text-ink-muted">Tidak ada SDM yang cocok dengan pencarian.</p>}
              phone={
                <ol className="-mx-4 flex flex-col divide-y divide-line border-t border-line sm:-mx-6">
                  {staffInView.map((st) => {
                    const checks = checksByStaff.get(st.code) ?? [];
                    const current = checks.find((c) => c.period === period);
                    return (
                      <BmiStaffRow
                        key={`${st.code}-${period}`}
                        accessKey={access.key}
                        period={period}
                        plannedDate={plannedDate}
                        plannedDates={plannedDates}
                        settings={settings}
                        showStation={ws.isKps && !stationFilter}
                        staff={{
                          code: st.code,
                          name: st.name ?? st.code,
                          station: st.station,
                          gender: st.gender,
                          bmiNote: st.bmiNote,
                          assignmentStatus: st.assignmentStatus,
                        }}
                        saved={
                          current && current.heightCm !== null && current.weightKg !== null
                            ? {
                                checkDate: current.checkDate,
                                heightCm: Number(current.heightCm),
                                weightKg: Number(current.weightKg),
                                changedLabel: lastChangedLabel(current, ws),
                              }
                            : null
                        }
                        summary={summaries.get(st.code)!}
                      />
                    );
                  })}
                </ol>
              }
            />
          </div>
        )}
      </Panel>

      {standardMissing || missingGender > 0 ? (
        <section
          aria-label="Catatan syarat tinggi badan"
          className="rounded-panel border border-line bg-surface px-4 py-3 text-sm sm:px-6"
        >
          <p className="font-semibold text-ink">Syarat tinggi badan</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-ink">
            {standardMissing ? <li>{standardMissing}</li> : null}
            {missingGender > 0 ? (
              <li>
                L/P belum diisi untuk {missingGender} dari {staffInView.length} SDM. Isi kolom L/P (di HP: bagian
                &ldquo;Profil, catatan, dan riwayat&rdquo; tiap SDM).
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {ws.isKps && !stationFilter ? (
        <Panel
          padding="flush"
          title={`Kategori BMI periode ${period} per stasiun`}
          description="Dihitung dari hasil cek periode ini, seperti bagian C Laporan Mingguan."
        >
          {view.checked === 0 ? (
            <div className="px-4 sm:px-6">
              <EmptyState title={`Belum ada hasil cek untuk periode ${period}`} layout="inline">
                Jumlah per kategori muncul setelah stasiun menyimpan cek BMI periode ini.
              </EmptyState>
            </div>
          ) : (
            <DataTable caption={`Kategori BMI periode ${period} per stasiun`} hideCaption stickyHeader={false} minWidth="44rem">
              <thead>
                <tr>
                  <Th>Stasiun</Th>
                  <Th numeric>Jumlah SDM</Th>
                  <Th numeric>Sudah dicek</Th>
                  <Th numeric>Belum dicek</Th>
                  <Th numeric>Normal</Th>
                  <Th numeric>Kurus</Th>
                  <Th numeric>Overweight</Th>
                  <Th numeric>Obesitas</Th>
                  <Th numeric>% Normal</Th>
                </tr>
              </thead>
              <tbody>
                {periodRows[period - 1].map((row) => (
                  <Tr key={row.key}>
                    <Th scope="row" className={row.key === TOTAL ? "font-semibold" : "font-normal"}>
                      {row.key === TOTAL ? "Total" : row.key}
                    </Th>
                    <Td numeric>{row.staffCount}</Td>
                    <Td numeric>{row.checked}</Td>
                    <Td numeric>{row.notChecked}</Td>
                    <Td numeric>{row.normal}</Td>
                    <Td numeric>{row.kurus}</Td>
                    <Td numeric>{row.overweight}</Td>
                    <Td numeric>{row.obesitas}</Td>
                    <Td numeric>{formatRatio(row.pctNormal)}</Td>
                  </Tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
