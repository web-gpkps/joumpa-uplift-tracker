import { Suspense } from "react";
import type { Metadata } from "next";
import { LinkScreenRoute } from "@/components/shell/ScreenRoute";
import { LaporanLoading, LaporanScreen } from "@/components/laporan/LaporanScreen";

export const metadata: Metadata = { title: "Laporan Mingguan" };

/** Laporan Mingguan, station link (scope from the token). The screen is shared with /admin/laporan. */
export default function Page({ params, searchParams }: PageProps<"/s/[token]/laporan">) {
  return (
    <Suspense fallback={<LaporanLoading />}>
      <LinkScreenRoute params={params} searchParams={searchParams} screen={LaporanScreen} />
    </Suspense>
  );
}
