import { staffBaseline, startsWithText } from "@/lib/rules";
import {
  firstParam,
  hrefs,
  lastChangedLabel,
  parseStation,
  ruleSettings,
  sortedStaff,
  stationCodes,
  type ScreenProps,
  type Workspace,
  type WorkspaceAccess,
  type WorkspaceStaff,
} from "@/lib/workspace";
import { PageHeader, PageLoading } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { ButtonLink } from "@/components/ui/Button";
import { StationFilter, type StationFilterOption } from "@/components/ui/StationFilter";
import { RememberView } from "@/components/ui/RememberView";
import { rememberScope } from "@/components/ui/remember";
import { FlagSummary, type FlagItem } from "@/components/sdm/FlagSummary";
import { StaffGrid } from "@/components/sdm/StaffGrid";
import { AddStaffButton } from "@/components/sdm/AddStaffButton";
import type { SdmRow } from "@/components/sdm/types";
import { deleteStaff, saveStaff, saveStaffGender } from "./actions";

const TITLE = "Master SDM";

export function SdmLoading() {
  return <PageLoading title={TITLE} label="Memuat daftar SDM" />;
}

const CHECKS = ["beda", "nipp-ganda", "lp-kosong", "nipp-kosong"] as const;
type Check = (typeof CHECKS)[number];

type Query = { station: string | null; check: Check | null };

function hrefFor(access: WorkspaceAccess, q: Query): string {
  return hrefs(access).to("sdm", { stasiun: q.station, cek: q.check });
}

function toRows(ws: Workspace, list: WorkspaceStaff[]): SdmRow[] {
  const settings = ruleSettings(ws.settings);
  // Duplicate NIPP across everything this link can see (KPS: all stations).
  const byNipp = new Map<string, WorkspaceStaff[]>();
  for (const s of ws.staff) {
    const nipp = s.nipp?.trim();
    if (!nipp) continue;
    byNipp.set(nipp, [...(byNipp.get(nipp) ?? []), s]);
  }
  return list.map((s) => {
    const derived = staffBaseline(s, settings);
    const sameNipp = s.nipp?.trim() ? (byNipp.get(s.nipp.trim()) ?? []) : [];
    return {
      code: s.code,
      station: s.station,
      name: s.name,
      nipp: s.nipp,
      gender: s.gender,
      preTest: s.preTest,
      postTest: s.postTest,
      scores: [s.scoreA, s.scoreB, s.scoreC, s.scoreD, s.scoreE, s.scoreF],
      reportConclusion: s.reportConclusion,
      assignmentStatus: s.assignmentStatus,
      notes: s.notes,
      practiceAvg: derived.practiceAvg,
      criteriaStatus: derived.criteriaStatus,
      consistency: derived.consistency,
      duplicateNippWith: sameNipp.filter((o) => o.code !== s.code).map((o) => `${o.name} (${o.code})`),
      changedLabel: lastChangedLabel(s, ws),
      weeklyScoreCount: ws.weeklyScores.filter((r) => r.staffCode === s.code).length,
      bmiCheckCount: ws.bmiChecks.filter((r) => r.staffCode === s.code).length,
      replacementCount: ws.replacements.filter((r) => r.staffCode === s.code).length,
    };
  });
}

const MATCHES: Record<Check, (r: SdmRow) => boolean> = {
  beda: (r) => startsWithText(r.consistency, "Beda"),
  "nipp-ganda": (r) => r.duplicateNippWith.length > 0,
  "lp-kosong": (r) => !r.gender,
  "nipp-kosong": (r) => !r.nipp?.trim(),
};

/** Workbook sheet "Master SDM": staff data, training results and the 6.2 checks. */
export function SdmScreen({ access, ws, searchParams: sp }: ScreenProps) {
  const settings = ruleSettings(ws.settings);

  const rawCheck = firstParam(sp.cek);
  const query: Query = {
    station: parseStation(ws, sp.stasiun),
    // ?lp=1 (the old "Lengkapi L/P" mode) now opens the missing-L/P filter: L/P is a grid column.
    check: (CHECKS as readonly string[]).includes(rawCheck ?? "")
      ? (rawCheck as Check)
      : firstParam(sp.lp) === "1"
        ? "lp-kosong"
        : null,
  };

  const allStaff = sortedStaff(ws);
  const scopeStaff = query.station ? allStaff.filter((s) => s.station === query.station) : allStaff;
  const scopeRows = toRows(ws, scopeStaff);
  const rows = query.check ? scopeRows.filter(MATCHES[query.check]) : scopeRows;
  const scopeName = query.station ? `Stasiun ${query.station}` : ws.isKps ? "semua stasiun" : ws.scopeLabel;
  const stations = stationCodes(ws);
  const ownStation = ws.isKps ? null : ws.scope;

  const count = (check: Check) => scopeRows.filter(MATCHES[check]).length;
  const filterLink = (check: Check, label: string) => ({
    href: hrefFor(access, { ...query, check: query.check === check ? null : check }),
    label: query.check === check ? "Tampilkan semua SDM" : label,
    current: false,
  });

  const duplicateGroups = new Map<string, string[]>();
  for (const r of scopeRows) {
    if (r.duplicateNippWith.length === 0 || !r.nipp) continue;
    duplicateGroups.set(r.nipp.trim(), [...(duplicateGroups.get(r.nipp.trim()) ?? []), r.name]);
  }

  const flags: FlagItem[] = [
    {
      key: "beda",
      count: count("beda"),
      title: "Beda – verifikasi",
      detail: "Kesimpulan di laporan pelatihan tidak sama dengan status menurut kriteria 6.2. Cocokkan dengan laporan.",
      links: [filterLink("beda", "Tampilkan")],
      active: query.check === "beda",
    },
    {
      key: "nipp-ganda",
      count: count("nipp-ganda"),
      title: "NIPP ganda",
      detail:
        duplicateGroups.size > 0
          ? [...duplicateGroups.entries()].map(([nipp, names]) => `${nipp}: ${names.join(" dan ")}`).join("; ") +
            ". Satu NIPP hanya untuk satu orang."
          : "Satu NIPP hanya untuk satu orang.",
      links: [filterLink("nipp-ganda", "Tampilkan")],
      active: query.check === "nipp-ganda",
    },
    {
      key: "lp-kosong",
      count: count("lp-kosong"),
      title: "L/P belum diisi",
      detail: "Dibutuhkan untuk syarat tinggi badan di halaman BMI. Pilih L atau P langsung di kolom L/P.",
      links: [filterLink("lp-kosong", "Lengkapi L/P")],
      active: query.check === "lp-kosong",
    },
    {
      key: "nipp-kosong",
      count: count("nipp-kosong"),
      title: "NIPP belum diisi",
      detail: "Isi langsung di kolom NIPP, atau lewat tombol Ubah di baris SDM.",
      links: [filterLink("nipp-kosong", "Tampilkan")],
      active: query.check === "nipp-kosong",
    },
  ];

  const stationOptions: StationFilterOption[] = ws.isKps
    ? [null, ...stations].map((code) => ({
        code,
        label: code ?? "Semua stasiun",
        meta: String(code ? allStaff.filter((s) => s.station === code).length : allStaff.length),
        metaLabel: `${code ? allStaff.filter((s) => s.station === code).length : allStaff.length} SDM`,
        href: hrefFor(access, { ...query, station: code }),
      }))
    : [];

  const activeFlag = flags.find((f) => f.active);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={TITLE}
        context={ws.scopeLabel}
        description="Master SDM: data tiap SDM dan hasil pelatihannya. Periksa apakah datanya benar dan apakah SDM memenuhi kriteria 6.2."
        actions={
          <AddStaffButton
            accessKey={access.key}
            isKps={ws.isKps}
            ownStation={ownStation}
            stations={stations}
            settings={settings}
            saveAction={saveStaff}
          />
        }
      >
        {stationOptions.length > 0 ? (
          <StationFilter options={stationOptions} current={query.station} />
        ) : null}
        {ws.isKps ? (
          <RememberView scope={rememberScope(access, ws)} allowed={{ stasiun: stations }} shown={{ stasiun: query.station }} />
        ) : null}
      </PageHeader>

      <FlagSummary items={flags} scopeName={scopeName} />

      <Panel
        padding="flush"
        title={`Master SDM, ${scopeName}`}
        description={
          activeFlag
            ? `Menampilkan ${rows.length} dari ${scopeRows.length} SDM: ${activeFlag.title}.`
            : `${scopeRows.length} SDM. ${ws.isKps ? "Data pelatihan bisa diubah lewat tombol Ubah." : "Data pelatihan hanya bisa diubah lewat tautan KPS."}`
        }
        actions={
          activeFlag ? (
            <ButtonLink size="sm" href={hrefFor(access, { ...query, check: null })}>
              Tampilkan semua SDM
            </ButtonLink>
          ) : null
        }
      >
        <StaffGrid
          caption={`Master SDM ${scopeName}`}
          rows={rows}
          emptyTitle={
            activeFlag ? `Tidak ada SDM dengan ${activeFlag.title} di ${scopeName}` : `Belum ada SDM di ${scopeName}`
          }
          emptyHint={activeFlag ? "Pilih Tampilkan semua SDM untuk melihat seluruh daftar." : "Tambahkan lewat tombol Tambah SDM."}
          accessKey={access.key}
          isKps={ws.isKps}
          ownStation={ownStation}
          stations={stations}
          settings={settings}
          saveAction={saveStaff}
          saveGenderAction={saveStaffGender}
          canDelete={access.kind === "owner"}
          deleteAction={deleteStaff}
        />
      </Panel>
    </div>
  );
}
