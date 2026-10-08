import { Suspense } from "react";
import type { Metadata } from "next";
import { OwnerScreenRoute } from "@/components/shell/ScreenRoute";
import { LaporanLoading, LaporanScreen } from "@/components/laporan/LaporanScreen";

export const metadata: Metadata = { title: "Laporan Mingguan" };

/** Laporan Mingguan, owner (all stations). The screen is shared with /s/[token]/laporan. */
export default function Page({ searchParams }: PageProps<"/admin/laporan">) {
  return (
    <Suspense fallback={<LaporanLoading />}>
      <OwnerScreenRoute searchParams={searchParams} screen={LaporanScreen} />
    </Suspense>
  );
}
