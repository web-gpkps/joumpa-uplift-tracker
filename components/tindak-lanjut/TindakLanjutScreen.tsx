import { PageHeader, PageLoading } from "@/components/ui/PageHeader";
import { HowToTip } from "@/components/ui/HowToTip";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/States";
import { todayInJakarta } from "@/components/shell/programme-calendar";
import { ActionGrid } from "@/components/tindak-lanjut/ActionGrid";
import { AddActionItemButton } from "@/components/tindak-lanjut/AddActionItemButton";
import { ReportGroupFilter } from "@/components/tindak-lanjut/ReportGroupFilter";
import { TindakLanjutBoard, type GroupSummary } from "@/components/tindak-lanjut/TindakLanjutBoard";
import { asDueRule, toActionView } from "@/components/tindak-lanjut/action-view";
import { actionProgress, reportGroups, TOTAL } from "@/lib/aggregate";
import { firstParam, hrefs, ruleSettings, settingsComplete, type ScreenProps } from "@/lib/workspace";

export function TindakLanjutLoading() {
  return <PageLoading title="Tindak Lanjut" label="Memuat tindak lanjut" />;
}

/**
 * Workbook sheet "Tindak Lanjut": a spreadsheet from 900 px (progress cells for every link,
 * KPS fields for KPS and the owner), cards with an update dialog on phones. The owner can
 * also add and delete items.
 */
export function TindakLanjutScreen({ access, ws, searchParams }: ScreenProps) {
  const today = todayInJakarta();
  const settings = ruleSettings(ws.settings);
  const complete = settingsComplete(ws.settings);
  const isOwner = access.kind === "owner" && ws.isOwner;
  const links = hrefs(access);

  const all = ws.actionItems.map((item) => toActionView(item, settings, today, ws));

  // Report groups of this workspace (CGK and HLP share "CGK & HLP"); fall back to the items' own groups.
  const fromStations = ws.stations.length > 0 ? reportGroups(ws.stations) : [];
  const groupKeys = fromStations.length > 0 ? fromStations : [...new Set(all.map((v) => v.reportGroup))];

  // ?laporan= for KPS and the owner; a station link always works on its own group.
  const requested = firstParam(searchParams.laporan) ?? null;
  const groupFilter = ws.isKps && requested && groupKeys.includes(requested) ? requested : null;
  const items = groupFilter ? all.filter((v) => v.reportGroup === groupFilter) : all;

  // Dashboard section 1 formula (lib/aggregate), so the counts agree with Dashboard and Laporan.
  const progressRows = actionProgress(
    ws.actionItems.map((a) => ({
      code: a.code,
      reportGroup: a.reportGroup,
      kind: a.kind,
      schedule: a.schedule,
      dueDate: a.dueDate,
      dueRule: asDueRule(a.dueRule),
      status: a.status,
      progress: a.progress,
    })),
    settings,
    today,
    groupKeys,
  );
  const groups: GroupSummary[] = progressRows
    .filter((r) => r.key !== TOTAL)
    .map((r) => ({
      key: r.key,
      total: r.total,
      selesai: r.selesai,
      overdue: r.overdue,
      dueSoon: r.dueSoon,
      avgProgress: r.avgProgress,
    }));
  const shownGroups = groupFilter ? groups.filter((g) => g.key === groupFilter) : groups;
  const totals = progressRows.find((r) => r.key === TOTAL);
  const shown = groupFilter ? shownGroups[0] : totals;

  const sharedGroup = ws.scope === "CGK" || ws.scope === "HLP";
  const scopeName = groupFilter ? `laporan ${groupFilter}` : ws.isKps ? "semua laporan" : `laporan ${groupKeys[0] ?? ws.scope}`;
  const filterOptions = ws.isKps
    ? [null, ...groupKeys].map((key) => {
        const row = progressRows.find((r) => r.key === (key ?? TOTAL));
        return {
          key,
          label: key ?? "Semua laporan",
          meta: row ? `${row.selesai}/${row.total}` : "",
          metaLabel: row ? `${row.selesai} dari ${row.total} butir selesai` : "",
          href: links.to("tindakLanjut", { laporan: key }),
        };
      })
    : null;

  const overdue = shown?.overdue ?? 0;
  const dueSoon = shown?.dueSoon ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        context={ws.scopeLabel}
        title="Tindak Lanjut"
        description={
          <>
            Butir 1 sampai 11 dari tabel 7.2 laporan training, butir 12 dan 13 tambahan (cek BMI dan laporan
            performa mingguan). Perbarui Status, % Progres, Tgl update, dan Realisasi / Bukti setiap minggu.
            {ws.isKps ? " KPS dan pemilik juga mengisi Catatan KPS dan definisi butir." : null}
            {sharedGroup ? ` Tautan ${ws.scope} mengerjakan butir laporan gabungan CGK & HLP.` : null}
          </>
        }
        actions={
          isOwner ? (
            <AddActionItemButton
              accessKey={access.key}
              existing={all.map((v) => ({ code: v.code, reportGroup: v.reportGroup }))}
              defaultGroup={groupFilter}
            />
          ) : undefined
        }
      >
        {filterOptions ? <ReportGroupFilter options={filterOptions} current={groupFilter} /> : null}
        <p className="text-base text-ink">
          {overdue + dueSoon === 0 ? (
            <>Tidak ada butir {scopeName} yang OVERDUE atau jatuh tempo dalam 7 hari.</>
          ) : (
            <>
              Perlu ditangani ({scopeName}): <span className="font-semibold text-critical">{overdue} OVERDUE</span> dan{" "}
              <span className="font-semibold text-warning">{dueSoon} jatuh tempo ≤ 7 hari</span> dari {items.length} butir.
            </>
          )}
        </p>
      </PageHeader>

      {!complete ? (
        <p className="text-sm text-warning">
          Parameter program tidak lengkap, jadi batas waktu bergulir memakai nilai bawaan workbook. Pemilik aplikasi
          bisa memeriksanya di halaman Parameter.
        </p>
      ) : null}

      {items.length === 0 ? (
        <Panel>
          <EmptyState title={`Belum ada tindak lanjut untuk ${scopeName}`}>
            Butir tindak lanjut dibuat dari laporan training (13 butir per laporan).
            {isOwner
              ? " Tambahkan butir dengan tombol Tambah butir."
              : " Jika daftar ini seharusnya terisi, minta pemilik aplikasi memeriksa data Tindak Lanjut."}
          </EmptyState>
        </Panel>
      ) : (
        <Panel
          padding="flush"
          title={`Tindak Lanjut ${scopeName}`}
          description={<HowToTip id="tindak-lanjut">pilih Status, ketik % Progres (0 sampai 100) dan bukti yang bisa dicek. Saat progres diubah, Tgl update terisi tanggal hari ini kecuali Anda mengetiknya sendiri. Batas waktu, Sisa hari, dan Flag dihitung otomatis.</HowToTip>}
        >
          <div className="px-4 pb-4 sm:px-6 sm:pb-6">
            <ActionGrid
              // A new report-group filter starts a fresh order (most urgent first).
              key={groupFilter ?? "semua"}
              accessKey={access.key}
              isKps={ws.isKps}
              isOwner={isOwner}
              today={today}
              settings={settings}
              items={items}
              showGroup={ws.isKps && !groupFilter}
              caption={`Tindak Lanjut ${scopeName}`}
              phone={
                <div className="-mx-4 sm:-mx-6">
                  <TindakLanjutBoard
                    accessKey={access.key}
                    isKps={ws.isKps}
                    isOwner={isOwner}
                    today={today}
                    settings={settings}
                    items={items}
                    groups={shownGroups}
                  />
                </div>
              }
            />
          </div>
        </Panel>
      )}
    </div>
  );
}
