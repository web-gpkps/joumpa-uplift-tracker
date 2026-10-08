import type { ReactNode } from "react";
import { replacementsByGroup, TOTAL } from "@/lib/aggregate";
import { diffDays, formatHariTanggal, formatTanggal } from "@/lib/dates";
import {
  replacementPass,
  replacementTimeliness,
  type ReplacementRow,
  type Settings,
} from "@/lib/rules";
import { formatDecimal } from "@/lib/format";
import {
  changedVia,
  hrefs,
  lastChangedLabel,
  parseStation,
  ruleSettings,
  settingsComplete,
  shortDateTime,
  sortedStaff,
  stationCodes,
  type ScreenProps,
  type Workspace,
} from "@/lib/workspace";
import { ButtonLink } from "@/components/ui/Button";
import { PageHeader, PageLoading } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { StationFilter } from "@/components/ui/StationFilter";
import { HowToTip } from "@/components/ui/HowToTip";
import { RememberView } from "@/components/ui/RememberView";
import { rememberScope } from "@/components/ui/remember";
import { StatusChip, toneForStatus } from "@/components/ui/StatusChip";
import { todayInJakarta } from "@/components/shell/programme-calendar";
import {
  AddReplacementButton,
  ReplacementPageStatus,
  ReplacementRowActions,
  type ReplacementContext,
  type ReplacementFormRow,
} from "./ReplacementDialogs";
import { ReplacementGrid, type ReplacementGridRow } from "./ReplacementGrid";

const TITLE = "Penggantian SDM";

function countdown(deadline: string, today: string): { big: string; small: string } {
  const days = diffDays(deadline, today);
  const when = formatHariTanggal(deadline);
  if (days > 1) return { big: `${days} hari lagi`, small: `menuju batas penggantian, ${when}` };
  if (days === 1) return { big: "Besok", small: `batas penggantian, ${when}` };
  if (days === 0) return { big: "Hari ini", small: `batas penggantian, ${when}` };
  return { big: `Lewat ${-days} hari`, small: `batas penggantian sudah lewat, ${when}` };
}

/** "tautan ini, 8 Okt 07.55" (the grid header already says "Terakhir diubah lewat"). */
function changedWhen(row: { updatedByLink?: string | null; updatedAt?: string | null }, ws: Workspace): string {
  const when = shortDateTime(row.updatedAt);
  return `${changedVia(row, ws)}${when ? `, ${when}` : ""}`;
}

function toFormRow(row: Workspace["replacements"][number]): ReplacementFormRow {
  return {
    id: row.id,
    station: row.station,
    staffCode: row.staffCode,
    replacedName: row.replacedName,
    reason: row.reason,
    withdrawnOn: row.withdrawnOn,
    replacementName: row.replacementName,
    effectiveOn: row.effectiveOn,
    trainingOn: row.trainingOn,
    postTest: row.postTest === null ? null : Number(row.postTest),
    practiceAvg: row.practiceAvg === null ? null : Number(row.practiceAvg),
    reported: row.reported,
    notes: row.notes,
  };
}

export function PenggantianLoading() {
  return <PageLoading title={TITLE} label="Memuat daftar penggantian SDM" />;
}

/** Workbook sheet "Penggantian SDM". */
export function PenggantianScreen({ access, ws, searchParams: query }: ScreenProps) {
  const today = todayInJakarta();
  const settings = ruleSettings(ws.settings);

  if (!settingsComplete(ws.settings)) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={TITLE} context={ws.scopeLabel} />
        <Panel>
          <ErrorState
            title="Parameter penggantian belum terbaca"
            cause="Batas penggantian dan syarat lulus training diambil dari Parameter, yang tidak terkirim lewat tautan ini."
            action="Minta pemilik aplikasi memeriksa Parameter, lalu muat ulang halaman ini."
          />
        </Panel>
      </div>
    );
  }

  const stations = stationCodes(ws);
  const stationFilter = parseStation(ws, query.stasiun);
  const scopeName = stationFilter ? `Stasiun ${stationFilter}` : ws.isKps ? "semua stasiun" : ws.scopeLabel;
  const rows = ws.replacements.filter((r) => !stationFilter || r.station === stationFilter);

  const href = (station: string | null) => hrefs(access).to("penggantian", { stasiun: station });

  const ctx: ReplacementContext = {
    accessKey: access.key,
    fixedStation: ws.isKps ? null : ws.scope,
    stations,
    staff: sortedStaff(ws).map((st) => ({ code: st.code, name: st.name ?? st.code, station: st.station })),
    settings,
    today,
    defaultStation: stationFilter,
  };

  const gridRows: ReplacementGridRow[] = rows.map((row) => ({
    ...toFormRow(row),
    reportGroup: row.reportGroup,
    pass: replacementPass(row, settings),
    timeliness: replacementTimeliness(row, settings, today),
    changed: changedWhen(row, ws),
  }));

  const deadline = countdown(settings.replacementDeadline, today);
  const minPost = formatDecimal(settings.posttestMin, 0, 2);
  const minAvg = formatDecimal(settings.passAvgMin, 2);

  return (
    <ReplacementPageStatus>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={TITLE}
          context={ws.scopeLabel}
          description={
            <>
              Komitmen: SDM yang tidak memenuhi spesifikasi diganti paling lambat{" "}
              {formatTanggal(settings.replacementDeadline)}. Pengganti baru boleh bertugas setelah lulus training:
              post-test minimal {minPost} dan rata-rata praktik minimal {minAvg}.
            </>
          }
          actions={
            // With rows, desktop adds through the grid toolbar ("Tambah baris"); phones keep this button.
            <div className={rows.length > 0 ? "nav:hidden" : undefined}>
              <AddReplacementButton ctx={ctx} />
            </div>
          }
        >
          {ws.isKps ? (
            <RememberView scope={rememberScope(access, ws)} allowed={{ stasiun: stations }} shown={{ stasiun: stationFilter }} />
          ) : null}
          {ws.isKps ? (
            <StationFilter
              current={stationFilter}
              options={[null, ...stations].map((code) => {
                const count = code ? ws.replacements.filter((r) => r.station === code).length : ws.replacements.length;
                return {
                  code,
                  label: code ?? "Semua stasiun",
                  meta: String(count),
                  metaLabel: `${count} penggantian`,
                  href: href(code),
                };
              })}
            />
          ) : null}
        </PageHeader>

        <OnTrackSummary rows={rows} settings={settings} today={today} deadline={deadline} />

        {rows.length === 0 ? (
          <Panel>
            <EmptyState
              title={`Belum ada penggantian SDM untuk ${scopeName}`}
              action={
                stationFilter ? (
                  <ButtonLink href={href(null)} variant="secondary">
                    Lihat semua stasiun
                  </ButtonLink>
                ) : undefined
              }
            >
              Catat SDM yang harus diganti dengan Tambah penggantian. Pengganti dan hasil training bisa diisi
              belakangan.
            </EmptyState>
          </Panel>
        ) : (
          <Panel
            padding="flush"
            title={`Penggantian SDM, ${scopeName}`}
            description={<HowToTip id="penggantian">ketik langsung di sel kuning, baris tersimpan sendiri. Pilih ID SDM dari Master SDM untuk mengisi nama otomatis.</HowToTip>}
          >
            <div className="px-4 pb-4 sm:px-6 sm:pb-6">
              <ReplacementGrid
                caption={`Penggantian SDM, ${scopeName}`}
                rows={gridRows}
                ctx={ctx}
                summary={`${rows.length} penggantian · ${rows.filter((r) => replacementPass(r, settings)?.startsWith("Lulus")).length} pengganti lulus`}
                actions={<AddReplacementButton ctx={ctx} label="Tambah baris" />}
                phone={
                  <ol className="-mx-4 flex flex-col gap-4 sm:-mx-6" aria-label={`Daftar penggantian ${scopeName}`}>
                    {rows.map((row) => (
                      <li key={row.id}>
                        <ReplacementCard row={row} ws={ws} ctx={ctx} settings={settings} today={today} />
                      </li>
                    ))}
                  </ol>
                }
              />
            </div>
          </Panel>
        )}
      </div>
    </ReplacementPageStatus>
  );
}

function OnTrackSummary({
  rows,
  settings,
  today,
  deadline,
}: {
  rows: Workspace["replacements"];
  settings: Settings;
  today: string;
  deadline: { big: string; small: string };
}) {
  const total = replacementsByGroup(rows as ReplacementRow[], settings, today, []).find((r) => r.key === TOTAL)!;
  const timeliness = rows.map((r) => replacementTimeliness(r, settings, today));
  const passes = rows.map((r) => replacementPass(r, settings));
  const late = total.lateOrOverdue;
  const waiting = timeliness.filter((t) => t === "Menunggu").length;
  const notPassed = passes.filter((p) => p === "Belum lulus" || p === "Belum training/dinilai").length;

  // One verdict, most urgent first: past the deadline, no effective date yet, not yet passed.
  let verdict: { text: string; className: string } | null = null;
  if (rows.length > 0) {
    if (late > 0) {
      verdict = { text: `${late} dari ${rows.length} penggantian melewati batas.`, className: "text-critical" };
    } else if (waiting > 0) {
      verdict = {
        text: `${waiting} dari ${rows.length} SDM belum punya tanggal efektif pengganti.`,
        className: "text-warning",
      };
    } else if (notPassed > 0) {
      verdict = {
        text: `${notPassed} pengganti belum lulus training, jadi belum boleh bertugas.`,
        className: "text-warning",
      };
    } else {
      verdict = { text: "Semua penggantian tepat waktu dan penggantinya lulus training.", className: "text-good" };
    }
  }

  const counts = new Map<string, number>();
  for (const t of [...timeliness, ...passes]) {
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  }

  return (
    <section
      aria-label="Apakah penggantian sesuai jadwal"
      className="grid gap-4 rounded-panel border border-line bg-surface px-4 py-4 sm:px-6 sm:py-5 md:grid-cols-[minmax(12rem,auto)_minmax(0,1fr)] md:gap-8"
    >
      <div className="flex flex-col gap-0.5">
        <p className="text-2xl font-semibold text-ink tabular-nums">{deadline.big}</p>
        <p className="text-sm text-ink-muted">{deadline.small}</p>
      </div>
      {verdict ? (
        <div className="flex min-w-0 flex-col gap-2 md:border-l md:border-line md:pl-8">
          <p className={`font-semibold ${verdict.className}`}>{verdict.text}</p>
          <p className="text-sm text-ink">
            {total.toReplace} SDM akan diganti, {total.placed} pengganti sudah ditempatkan, {total.passed} lulus
            training, {total.reported} sudah dilaporkan ke OAO/Direksi.
          </p>
          <ul aria-label="Rincian status" className="flex flex-wrap gap-2">
            {[...counts.entries()].map(([label, n]) => (
              <li key={label}>
                <StatusChip label={`${label}: ${n}`} tone={toneForStatus(label)} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Empty({ children = "Belum diisi" }: { children?: ReactNode }) {
  return <span className="text-ink-muted">{children}</span>;
}

function dateOrEmpty(date: string | null) {
  return date ? <time dateTime={date}>{formatTanggal(date)}</time> : <Empty />;
}

/** Score against its minimum, in words as well as colour. */
function AgainstMinimum({ value, min, digits }: { value: number | null; min: number; digits: number }) {
  if (value === null) return <Empty>Belum dinilai</Empty>;
  const ok = value >= min;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <span className="font-semibold tabular-nums">{formatDecimal(value, digits, 2)}</span>
      <span className={ok ? "text-xs font-semibold text-good" : "text-xs font-semibold text-critical"}>
        {ok ? "memenuhi" : "di bawah"} syarat {formatDecimal(min, digits, 2)}
      </span>
    </span>
  );
}

function DetailList({ items }: { items: Array<{ term: string; value: ReactNode; wide?: boolean }> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.term} className={item.wide ? "flex min-w-0 flex-col gap-0.5 sm:col-span-2" : "flex min-w-0 flex-col gap-0.5"}>
          <dt className="section-label">{item.term}</dt>
          <dd className="min-w-0 text-sm text-ink [overflow-wrap:anywhere]">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ReplacementCard({
  row,
  ws,
  ctx,
  settings,
  today,
}: {
  row: Workspace["replacements"][number];
  ws: Workspace;
  ctx: ReplacementContext;
  settings: Settings;
  today: string;
}) {
  const pass = replacementPass(row, settings);
  const timeliness = replacementTimeliness(row, settings, today);
  const formRow = toFormRow(row);
  const postTest = formRow.postTest;
  const practiceAvg = formRow.practiceAvg;
  const meta = [
    row.staffCode,
    row.station ? `Stasiun ${row.station}` : "Stasiun belum diisi",
    row.reportGroup ? `Laporan ${row.reportGroup}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      aria-labelledby={`penggantian-${row.id}`}
      className="flex flex-col rounded-panel border border-line bg-surface"
    >
      <header className="flex flex-col gap-3 px-4 pt-4 sm:px-6 sm:pt-5 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="section-label">SDM diganti</p>
          <h2 id={`penggantian-${row.id}`} className="text-lg font-semibold text-ink [overflow-wrap:anywhere]">
            {row.replacedName}
          </h2>
          <p className="text-xs text-ink-muted">{meta}</p>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-2">
          <div className="flex flex-col gap-1">
            <dt className="section-label">Ketepatan waktu</dt>
            <dd>
              <StatusChip label={timeliness} />
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="section-label">Status kelulusan</dt>
            <dd>
              <StatusChip label={pass} emptyLabel="Belum ada pengganti" />
            </dd>
          </div>
        </dl>
      </header>

      <div className="grid gap-6 px-4 py-4 sm:px-6 md:grid-cols-2 md:gap-8">
        <section aria-label="Yang diganti" className="flex flex-col gap-3">
          <DetailList
            items={[
              { term: "Alasan", value: row.reason ?? <Empty />, wide: true },
              { term: "Tgl ditarik", value: dateOrEmpty(row.withdrawnOn) },
              {
                term: "Dilaporkan ke OAO/Direksi",
                value: row.reported ? <StatusChip label={row.reported} /> : <Empty />,
              },
              { term: "Catatan", value: row.notes ?? <Empty>Tidak ada</Empty>, wide: true },
            ]}
          />
        </section>
        <section
          aria-label="Pengganti dan syarat bertugas"
          className="flex flex-col gap-3 md:border-l md:border-line md:pl-8"
        >
          <DetailList
            items={[
              { term: "SDM pengganti", value: row.replacementName ?? <Empty>Belum ada</Empty>, wide: true },
              { term: "Tgl efektif", value: dateOrEmpty(row.effectiveOn) },
              { term: "Tgl training", value: dateOrEmpty(row.trainingOn) },
              { term: "Post-test", value: <AgainstMinimum value={postTest} min={settings.posttestMin} digits={0} /> },
              {
                term: "Rata-rata praktik",
                value: <AgainstMinimum value={practiceAvg} min={settings.passAvgMin} digits={2} />,
              },
            ]}
          />
        </section>
      </div>

      <footer className="flex flex-col gap-2 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-xs text-ink-muted">{lastChangedLabel(row, ws)}</p>
        <ReplacementRowActions ctx={ctx} row={formRow} />
      </footer>
    </article>
  );
}
