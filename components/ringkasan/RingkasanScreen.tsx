import { parseStation, stationCodes, type ScreenProps } from "@/lib/workspace";
import { RememberView } from "@/components/ui/RememberView";
import { rememberScope } from "@/components/ui/remember";

import { todayInJakarta } from "@/components/shell/programme-calendar";
import { PageLoading } from "@/components/ui/PageHeader";
import { RingkasanView } from "./RingkasanView";

export function RingkasanLoading() {
  return <PageLoading title="Dashboard" label="Memuat dashboard" />;
}

/** Workbook sheet "Dashboard": what needs attention now, then sections 1 to 4. */
export function RingkasanScreen({ access, ws, searchParams }: ScreenProps) {
  const stationFilter = parseStation(ws, searchParams.stasiun);
  return (
    <>
      {ws.isKps ? (
        <RememberView scope={rememberScope(access, ws)} allowed={{ stasiun: stationCodes(ws) }} shown={{ stasiun: stationFilter }} />
      ) : null}
      <RingkasanView ws={ws} access={access} today={todayInJakarta()} stationFilter={stationFilter} />
    </>
  );
}
