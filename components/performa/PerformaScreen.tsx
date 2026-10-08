import { practiceAvg, staffRekap, weekEnd, weekOfDate, weekStart } from "@/lib/rules";
import { formatTanggal, formatTanggalPendek, formatHariTanggal } from "@/lib/dates";
import {
  hrefs,
  lastChangedLabel,
  parseStation,
  ruleSettings,
  sortedStaff,
  stationCodes,
  type ScreenProps,
  type WorkspaceAccess,
  type Workspace,
  type WorkspaceStaff,
} from "@/lib/workspace";
import { todayInJakarta } from "@/components/shell/programme-calendar";
import { WeekRail } from "@/components/shell/WeekRail";
import { PageHeader, PageLoading } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StationFilter, type StationFilterOption } from "@/components/ui/StationFilter";
import { HowToTip } from "@/components/ui/HowToTip";
import { RememberView } from "@/components/ui/RememberView";
import { oneTo, rememberScope } from "@/components/ui/remember";
import { TabNav } from "@/components/ui/TabNav";
import { EmptyState } from "@/components/ui/States";
import { WeeklyEntry, type EntryGroup } from "@/components/performa/WeeklyEntry";
import type { EntryStaff } from "@/components/performa/ScoreRow";
import { RekapTable } from "@/components/performa/RekapTable";
import { ScoreGrid, type ScoreGridRow } from "@/components/performa/ScoreGrid";
import { parseWeek } from "@/components/performa/workspace-data";
import { saveWeeklyScore } from "./actions";

const TITLE = "Log Performa";

export function PerformaLoading() {
  return <PageLoading title={TITLE} label="Memuat nilai performa" />;
}

type Query = { tab: "input" | "rekap"; week: number; station: string | null };

function hrefFor(access: WorkspaceAccess, q: Query): string {
  return hrefs(access).to("performa", {
    tab: q.tab === "rekap" ? "rekap" : null,
    minggu: q.week,
    stasiun: q.station,
  });
}

function isAssessed(ws: Workspace, code: string, week: number): boolean {
  const row = ws.weeklyScores.find((r) => r.staffCode === code && r.week === week);
  return row ? practiceAvg(row) !== null : false;
}

/** Workbook sheets "Log Performa Mingguan" (input) and "Rekap Performa" (rekap). */
export function PerformaScreen({ access, ws, searchParams: sp }: ScreenProps) {
  const today = todayInJakarta();
  const settings = ruleSettings(ws.settings);

  const query: Query = {
    tab: sp.tab === "rekap" ? "rekap" : "input",
    week: parseWeek(sp.minggu, settings, today),
    station: parseStation(ws, sp.stasiun),
  };
  const currentWeek = weekOfDate(today, settings);
  const allStaff = sortedStaff(ws);
  const staff = query.station ? allStaff.filter((s) => s.station === query.station) : allStaff;
  const scopeName = query.station ? `Stasiun ${query.station}` : ws.isKps ? "semua stasiun" : ws.scopeLabel;

  const assessedCount = (list: WorkspaceStaff[]) =>
    list.filter((s) => isAssessed(ws, s.code, query.week)).length;

  const stationOptions: StationFilterOption[] = ws.isKps
    ? [null, ...stationCodes(ws)].map((code) => {
        const list = code ? allStaff.filter((s) => s.station === code) : allStaff;
        const done = assessedCount(list);
        return {
          code,
          label: code ?? "Semua stasiun",
          meta: query.tab === "input" ? `${done}/${list.length}` : String(list.length),
          metaLabel:
            query.tab === "input"
              ? `${done} dari ${list.length} SDM sudah dinilai`
              : `${list.length} SDM`,
          href: hrefFor(access, { ...query, station: code }),
        };
      })
    : [];

  const tabs = [
    { href: hrefFor(access, { ...query, tab: "input" }), label: "Input mingguan" },
    { href: hrefFor(access, { ...query, tab: "rekap" }), label: "Rekap" },
  ];

  const weekRange = `${formatTanggalPendek(weekStart(query.week, settings))} s.d. ${formatTanggal(
    weekEnd(query.week, settings),
  )}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={TITLE}
        context={`${ws.scopeLabel} · ${query.tab === "input" ? `Minggu ke-${query.week}, ${weekRange}` : `Rekap ${settings.weeks} minggu`}`}
        description="Nilai praktik mingguan aspek A sampai F per SDM dari observasi, role play, atau mystery guest, beserta rekap perkembangannya dari minggu ke minggu."
      >
        <TabNav
          label="Tampilan performa"
          items={tabs}
          currentHref={query.tab === "rekap" ? tabs[1].href : tabs[0].href}
        />
        {query.tab === "rekap" && stationOptions.length > 0 ? (
          <StationFilter options={stationOptions} current={query.station} />
        ) : null}
        <RememberView
          scope={rememberScope(access, ws)}
          allowed={{ minggu: oneTo(settings.weeks), ...(ws.isKps ? { stasiun: stationCodes(ws) } : {}) }}
          shown={{ minggu: String(query.week), stasiun: query.station }}
        />
      </PageHeader>

      {query.tab === "input" ? (
        <InputView
          ws={ws}
          access={access}
          query={query}
          staff={staff}
          scopeName={scopeName}
          today={today}
          currentWeek={currentWeek}
          assessed={assessedCount(staff)}
          stationOptions={stationOptions}
        />
      ) : (
        <RekapView ws={ws} staff={staff} scopeName={scopeName} currentWeek={currentWeek} />
      )}
    </div>
  );
}

function InputView({
  ws,
  access,
  query,
  staff,
  scopeName,
  today,
  currentWeek,
  assessed,
  stationOptions,
}: {
  ws: Workspace;
  access: WorkspaceAccess;
  query: Query;
  staff: WorkspaceStaff[];
  scopeName: string;
  today: string;
  currentWeek: number | null;
  assessed: number;
  stationOptions: StationFilterOption[];
}) {
  const settings = ruleSettings(ws.settings);
  const start = weekStart(query.week, settings);
  const isFuture = today < start;
  const total = staff.length;
  const percent = total === 0 ? 0 : Math.round((assessed / total) * 100);

  const groups: EntryGroup[] = [];
  const gridRows: ScoreGridRow[] = [];
  for (const s of staff) {
    let group = groups.find((g) => g.station === s.station);
    if (!group) {
      group = { station: s.station, summary: "", staff: [] };
      groups.push(group);
    }
    const row = ws.weeklyScores.find((r) => r.staffCode === s.code && r.week === query.week) ?? null;
    const entry: EntryStaff = {
      code: s.code,
      name: s.name,
      assignmentStatus: s.assignmentStatus,
      baselineAvg: practiceAvg(s),
      saved: row
        ? {
            scores: [row.scoreA, row.scoreB, row.scoreC, row.scoreD, row.scoreE, row.scoreF],
            observer: row.observer,
            coachingNotes: row.coachingNotes,
          }
        : null,
      changedLabel: row ? lastChangedLabel(row, ws) : null,
    };
    group.staff.push(entry);
    gridRows.push({
      code: s.code,
      name: s.name,
      assignmentStatus: s.assignmentStatus,
      baselineAvg: entry.baselineAvg,
      score_a: row?.scoreA ?? null,
      score_b: row?.scoreB ?? null,
      score_c: row?.scoreC ?? null,
      score_d: row?.scoreD ?? null,
      score_e: row?.scoreE ?? null,
      score_f: row?.scoreF ?? null,
      observer: row?.observer ?? null,
      coaching_notes: row?.coachingNotes ?? null,
      changedLabel: entry.changedLabel,
    });
  }
  for (const g of groups) {
    const done = g.staff.filter((e) => isAssessed(ws, e.code, query.week)).length;
    g.summary = `${g.staff.length} SDM, ${done} sudah dinilai`;
  }

  const weekHref = (w: number) => hrefFor(access, { ...query, week: w });
  const futureNote = isFuture
    ? `Minggu ke-${query.week} belum berjalan (mulai ${formatHariTanggal(start)}). Nilai tetap bisa diisi bila penilaian sudah dilakukan.`
    : null;
  const label = `Nilai Minggu ke-${query.week}, ${scopeName}`;
  const emptyState = (
    <EmptyState title={`Belum ada SDM di ${scopeName}`} layout="inline">
      Tambahkan SDM lewat Master SDM (tombol Tambah SDM). Barisnya muncul di sini setelah tersimpan.
    </EmptyState>
  );

  return (
    <>
      {/* Phones: the week and station pickers sit above the cards (on desktop they are in the grid toolbar). */}
      <div className="flex flex-col gap-4 nav:hidden">
        {ws.schedule ? (
          <WeekRail
            settings={ws.schedule}
            today={today}
            selectedWeek={query.week}
            hrefForWeek={weekHref}
            showSummary={false}
            label="Pilih minggu penilaian"
          />
        ) : null}
        {stationOptions.length > 0 ? <StationFilter options={stationOptions} current={query.station} /> : null}
      </div>

      <Panel
        padding="flush"
        title={label}
        description={
          <>
            <span className="hidden nav:inline">
              <HowToTip id="performa">
                ketik angka 1 sampai 5 di sel kuning, kursor pindah sendiri ke aspek berikutnya. Blok nilai dari Excel
                bisa ditempel dengan Ctrl+V. Baris tersimpan sendiri; kosongkan semua isian sebuah baris untuk menghapus
                nilai minggu itu.
              </HowToTip>{" "}
            </span>
            {futureNote}
          </>
        }
      >
        <div className="px-4 pb-4 sm:px-6 sm:pb-6">
          <ScoreGrid
            key={`${query.week}-${query.station ?? "semua"}`}
            caption={label}
            rows={gridRows}
            week={query.week}
            settings={settings}
            accessKey={access.key}
            saveAction={saveWeeklyScore}
            summary={
              <>
                <span className="font-semibold text-ink tabular-nums">{assessed}</span> dari {total} SDM sudah dinilai
              </>
            }
            toolbar={
              <>
                {ws.schedule ? (
                  <div className="flex flex-col gap-1">
                    <span className="section-label">Minggu</span>
                    <WeekRail
                      variant="compact"
                      settings={ws.schedule}
                      today={today}
                      selectedWeek={query.week}
                      hrefForWeek={weekHref}
                      showSummary={false}
                      label="Pilih minggu penilaian"
                    />
                  </div>
                ) : null}
                {stationOptions.length > 0 ? <StationFilter options={stationOptions} current={query.station} /> : null}
              </>
            }
            emptyState={emptyState}
            phone={
              <div className="-mx-4 flex flex-col gap-4 sm:-mx-6">
                <div className="flex flex-col gap-2 px-4 sm:px-6">
                  <p className="text-sm text-ink">
                    <span className="text-xl font-semibold tabular-nums">{assessed}</span>{" "}
                    <span className="font-semibold">dari {total} SDM sudah dinilai</span>
                    {query.week === currentWeek ? <span className="text-ink-muted"> minggu ini</span> : null}
                  </p>
                  <div aria-hidden="true" className="h-1.5 w-full max-w-md overflow-hidden rounded-control bg-neutral-tint">
                    <div className="h-full bg-brand" style={{ width: `${percent}%` }} />
                  </div>
                </div>
                {total === 0 ? (
                  <div className="px-4 sm:px-6">{emptyState}</div>
                ) : (
                  <WeeklyEntry
                    key={`${query.week}-${query.station ?? "semua"}`}
                    accessKey={access.key}
                    week={query.week}
                    settings={settings}
                    groups={groups}
                    showStationHeadings={groups.length > 1}
                    label={label}
                    saveAction={saveWeeklyScore}
                  />
                )}
              </div>
            }
          />
        </div>
      </Panel>
    </>
  );
}

function RekapView({
  ws,
  staff,
  scopeName,
  currentWeek,
}: {
  ws: Workspace;
  staff: WorkspaceStaff[];
  scopeName: string;
  currentWeek: number | null;
}) {
  const settings = ruleSettings(ws.settings);
  const rows = staff.map((s) => ({
    code: s.code,
    name: s.name,
    rekap: staffRekap(s, ws.weeklyScores, settings),
  }));
  const anyScore = rows.some((r) => r.rekap.weeksAssessed > 0);

  return (
    <Panel
      padding="flush"
      title={`Rekap performa, ${scopeName}`}
      description="Rata-rata nilai praktik per minggu. Minggu tanpa nilai dibiarkan kosong. Status terkini memakai kriteria 6.2 (nilai terakhir dan post-test)."
    >
      {!anyScore ? (
        <div className="border-t border-line px-4 sm:px-6">
          <EmptyState title="Belum ada nilai mingguan di lingkup ini" layout="inline">
            Rekap terisi setelah nilai disimpan di tab Input mingguan. Pemantauan Minggu ke-1 mulai{" "}
            {formatHariTanggal(settings.week1Start)}.
          </EmptyState>
        </div>
      ) : null}
      <RekapTable
        caption={`Rekap performa ${scopeName}, Minggu ke-1 sampai ke-${settings.weeks}`}
        rows={rows}
        weeks={settings.weeks}
        currentWeek={currentWeek}
      />
    </Panel>
  );
}
