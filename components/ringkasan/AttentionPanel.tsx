import type { SheetLinks } from "@/lib/workspace/access";
import Link from "next/link";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/States";
import { StatusChip } from "@/components/ui/StatusChip";
import type { Attention, StationGap } from "./attention";
import { formatHariTanggal } from "@/lib/dates";
import { relativeDays } from "@/lib/format";
import { Tanggal } from "./format";

type AttentionPanelProps = {
  attention: Attention;
  /** hrefs(access): every sheet path for this access. */
  links: SheetLinks;
  /** More than one station on screen: show per-station lines. */
  multiStation: boolean;
};

/**
 * The lead of Ringkasan: exceptions only, most urgent first, each group linking to the
 * screen where it is fixed.
 */
export function AttentionPanel({ attention: a, links, multiStation }: AttentionPanelProps) {
  const groups: ReactNode[] = [];

  if (a.dueItems.length > 0) {
    const overdue = a.dueItems.filter((d) => d.flag === "OVERDUE").length;
    groups.push(
      <Group
        key="tl"
        title="Tindak lanjut lewat atau dekat jatuh tempo"
        summary={
          overdue > 0
            ? `${overdue} lewat batas waktu, ${a.dueItems.length - overdue} jatuh tempo dalam 7 hari.`
            : `${a.dueItems.length} butir jatuh tempo dalam 7 hari.`
        }
        action={
          <ButtonLink href={links.tindakLanjut} size="sm">
            Perbarui tindak lanjut
          </ButtonLink>
        }
      >
        <DueList items={a.dueItems.slice(0, SHOWN)} links={links} />
        {a.dueItems.length > SHOWN ? (
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-brand underline underline-offset-2 [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">Tampilkan {a.dueItems.length - SHOWN} butir lainnya</span>
              <span className="hidden group-open:inline">Sembunyikan {a.dueItems.length - SHOWN} butir lainnya</span>
            </summary>
            <DueList items={a.dueItems.slice(SHOWN)} links={links} />
          </details>
        ) : null}
      </Group>,
    );
  }

  if (a.scores && a.scores.missing > 0) {
    const { week } = a.scores;
    groups.push(
      <Group
        key="nilai"
        title={`Nilai praktik Minggu ke-${week} belum diisi`}
        summary={gapSummary(a.scores.stations, a.scores.missing, "dinilai")}
        action={
          <ButtonLink href={links.to("performa", { minggu: week })} size="sm">
            Isi nilai Minggu ke-{week}
          </ButtonLink>
        }
      >
        <GapList stations={a.scores.stations} multiStation={multiStation} />
      </Group>,
    );
  }

  if (a.bmi && a.bmi.missing > 0) {
    const { period, checkDate } = a.bmi;
    groups.push(
      <Group
        key="bmi"
        title={`Cek BMI periode ${period} belum dicatat`}
        summary={`Jadwal cek ${formatHariTanggal(checkDate)}. ${gapSummary(a.bmi.stations, a.bmi.missing, "dicek")}`}
        action={
          <ButtonLink href={links.to("bmi", { periode: period })} size="sm">
            Catat cek BMI periode {period}
          </ButtonLink>
        }
      >
        <GapList stations={a.bmi.stations} multiStation={multiStation} />
      </Group>,
    );
  }

  if (a.replacements.length > 0) {
    const days = a.daysToReplacementDeadline;
    groups.push(
      <Group
        key="ganti"
        title="Penggantian SDM belum efektif"
        summary={
          days >= 0
            ? `Batas penggantian ${formatHariTanggal(a.replacementDeadline)} (${relativeDays(days)}).`
            : `Batas penggantian ${formatHariTanggal(a.replacementDeadline)} sudah lewat ${-days} hari.`
        }
        action={
          <ButtonLink href={links.penggantian} size="sm">
            Buka Penggantian SDM
          </ButtonLink>
        }
      >
        <ul className="flex flex-col divide-y divide-line">
          {a.replacements.map((r) => (
            <li key={r.id ?? r.replacedName} className="grid gap-1 py-3 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-4">
              <div>
                <StatusChip label={r.timeliness} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">
                  {r.replacedName}
                  {multiStation && r.station ? <span className="font-normal text-ink-muted"> · {r.station}</span> : null}
                </p>
                {r.reason ? <p className="text-sm text-ink-muted">{r.reason}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      </Group>,
    );
  }

  return (
    <Panel
      id="perlu-ditangani"
      title="Perlu ditangani"
      description="Diurutkan dari yang paling mendesak. Tiap bagian membuka sheet tempat datanya diisi."
    >
      {groups.length === 0 ? (
        <EmptyState title="Tidak ada yang mendesak saat ini" layout="inline">
          Tidak ada tindak lanjut yang lewat atau jatuh tempo dalam 7 hari, semua SDM aktif sudah dinilai dan
          dicek BMI untuk periode berjalan, dan tidak ada penggantian yang menunggu.
        </EmptyState>
      ) : (
        <div className="-my-4 flex flex-col divide-y divide-line">{groups}</div>
      )}
    </Panel>
  );
}

/** The most urgent items stay visible; the rest open on request, so the list stays scannable. */
const SHOWN = 5;

function DueList({ items, links }: { items: Attention["dueItems"]; links: SheetLinks }) {
  return (
    <ul className="flex flex-col divide-y divide-line border-y border-line">
      {items.map((d) => (
        <li key={d.code} className="grid gap-1 py-2.5 sm:grid-cols-[9.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip label={d.flag} />
            <span className="text-xs font-semibold text-ink sm:hidden">
              {relativeDays(d.daysLeft)}, batas <Tanggal date={d.dueDate} />
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm">
              <Link
                href={links.to("tindakLanjut", undefined, `tl-${d.code}`)}
                className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-2 sm:min-h-0"
              >
                {d.code}
              </Link>
              {d.area ? <span className="text-ink-muted"> · {d.area}</span> : null}
            </p>
            {d.action ? (
              <p className="line-clamp-2 text-sm text-ink sm:line-clamp-1" title={d.action}>
                {d.action}
              </p>
            ) : null}
            <p className="truncate text-xs text-ink-muted">
              {d.status ?? "Belum Mulai"}
              {d.pic ? ` · PIC ${d.pic}` : ""}
            </p>
          </div>
          <p className="hidden text-right text-xs text-ink-muted sm:block">
            <span className="block font-semibold text-ink">{relativeDays(d.daysLeft)}</span>
            Batas <Tanggal date={d.dueDate} />
          </p>
        </li>
      ))}
    </ul>
  );
}

function Group({
  title,
  summary,
  action,
  children,
}: {
  title: string;
  summary: string;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          <p className="text-sm text-ink-muted">{summary}</p>
        </div>
        <div className="shrink-0">{action}</div>
      </div>
      {children}
    </section>
  );
}

function gapSummary(stations: StationGap[], missing: number, verb: string): string {
  const onDuty = stations.reduce((n, s) => n + s.onDuty, 0);
  return `${missing} dari ${onDuty} SDM aktif belum ${verb}.`;
}

/** Per station: how many are still missing; names once only a few remain. */
function GapList({ stations, multiStation }: { stations: StationGap[]; multiStation: boolean }) {
  const open = stations.filter((s) => s.missing.length > 0);
  const named = (s: StationGap) => s.missing.length <= 6;
  if (!multiStation) {
    const s = open[0];
    if (!s || !named(s)) return null;
    return <p className="text-sm text-ink">Belum: {s.missing.map((m) => m.name).join(", ")}.</p>;
  }
  return (
    <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
      {open.map((s) => (
        <li key={s.station} className="text-sm">
          <span className="font-semibold text-ink">{s.station}</span>{" "}
          <span className="text-ink-muted">
            {s.missing.length} dari {s.onDuty}
            {named(s) ? `: ${s.missing.map((m) => m.name).join(", ")}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
