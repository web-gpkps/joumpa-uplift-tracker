import type { SheetLinks } from "@/lib/workspace/access";
import Link from "next/link";
import type { ReactNode } from "react";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/States";
import type { StationCount, Verification } from "./verification";

const linkClass =
  "inline-flex min-h-11 items-center text-sm font-semibold text-brand underline underline-offset-2 sm:min-h-0";

function perStation(rows: StationCount[], show: boolean): string {
  if (!show || rows.length === 0) return "";
  return ` (${rows.map((r) => `${r.station} ${r.count}`).join(", ")})`;
}

/**
 * Known data issues from the training reports and the roster (docs/SPEC.md), shown as
 * they are so someone checks them; nothing here is corrected automatically.
 */
export function VerificationPanel({
  v,
  links,
  multiStation,
}: {
  v: Verification;
  /** hrefs(access): every sheet path for this access. */
  links: SheetLinks;
  multiStation: boolean;
}) {
  const items: ReactNode[] = [];

  if (v.beda.total > 0) {
    items.push(
      <Item
        key="beda"
        text={`${v.beda.total} SDM ditandai “Beda – verifikasi”${perStation(v.beda.byStation, multiStation)}: kesimpulan di laporan pelatihan berbeda dari hasil hitung kriteria 6.2.`}
        link={
          <Link href={links.sdm} className={linkClass}>
            Periksa {v.beda.total} SDM di Master SDM
          </Link>
        }
      />,
    );
  }

  if (v.noGender.total > 0) {
    items.push(
      <Item
        key="lp"
        text={`${v.noGender.total} SDM belum diisi L/P${perStation(v.noGender.byStation, multiStation)}, jadi syarat tinggi badan belum bisa dicek untuk mereka.`}
        link={
          <Link href={links.sdm} className={linkClass}>
            Isi L/P di Master SDM
          </Link>
        }
      />,
    );
  }

  if (v.minHeightMissing.length > 0) {
    const which = v.minHeightMissing.length === 2 ? "L dan P" : v.minHeightMissing[0];
    items.push(
      <Item
        key="tinggi"
        text={`Standar tinggi minimum ${which} belum diisi di Parameter, jadi kolom "Tinggi tidak memenuhi" belum menghitung siapa pun. Pemilik aplikasi yang mengisinya di Pengaturan.`}
      />,
    );
  }

  for (const d of v.duplicateNipp) {
    const names = d.staff.map((s) => (multiStation && s.station ? `${s.name} (${s.station})` : s.name));
    items.push(
      <Item
        key={`nipp-${d.nipp}`}
        text={`NIPP ${d.nipp} dipakai ${d.staff.length} SDM: ${names.join(" dan ")}.`}
        link={
          <Link href={links.sdm} className={linkClass}>
            Periksa NIPP {d.nipp} di Master SDM
          </Link>
        }
      />,
    );
  }

  return (
    <Panel
      id="perlu-diverifikasi"
      title="Perlu diverifikasi"
      description="Data dari laporan pelatihan dan daftar SDM yang belum cocok. Ditampilkan apa adanya sampai diperiksa."
    >
      {items.length === 0 ? (
        <EmptyState title="Tidak ada data yang perlu diverifikasi" layout="inline">
          Kesimpulan laporan cocok dengan kriteria 6.2, L/P terisi, standar tinggi sudah ada, dan tidak ada NIPP ganda.
        </EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-line">{items}</ul>
      )}
    </Panel>
  );
}

function Item({ text, link }: { text: string; link?: ReactNode }) {
  return (
    <li className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
      <p className="text-sm text-ink">{text}</p>
      {link ?? null}
    </li>
  );
}
