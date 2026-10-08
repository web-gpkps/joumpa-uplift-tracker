import { parseStation, ruleSettings, stationCodes, type ScreenProps } from "@/lib/workspace";
import { RememberView } from "@/components/ui/RememberView";
import { oneTo, rememberScope } from "@/components/ui/remember";

import { todayInJakarta } from "@/components/shell/programme-calendar";
import { PageLoading } from "@/components/ui/PageHeader";
import { parseWeek } from "@/components/performa/workspace-data";
import { LaporanView } from "./LaporanView";

export function LaporanLoading() {
  return <PageLoading title="Laporan Mingguan" label="Memuat laporan mingguan" />;
}

/** Workbook sheet "Laporan Mingguan": pick a week, check, add findings, print A4 landscape. */
export function LaporanScreen({ access, ws, searchParams }: ScreenProps) {
  const today = todayInJakarta();
  const settings = ruleSettings(ws.settings);
  const week = parseWeek(searchParams.minggu, settings, today);
  const station = parseStation(ws, searchParams.stasiun);
  return (
    <>
      <RememberView
        scope={rememberScope(access, ws)}
        allowed={{ minggu: oneTo(settings.weeks), ...(ws.isKps ? { stasiun: stationCodes(ws) } : {}) }}
        shown={{ minggu: String(week), stasiun: station }}
      />
      <LaporanView ws={ws} access={access} today={today} week={week} station={station} />
    </>
  );
}
