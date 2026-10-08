import { Suspense } from "react";
import type { Metadata } from "next";
import { OwnerScreenRoute } from "@/components/shell/ScreenRoute";
import { PerformaLoading, PerformaScreen } from "@/components/performa/PerformaScreen";

export const metadata: Metadata = { title: "Log Performa" };

/** Log Performa, owner (all stations). The screen is shared with /s/[token]/performa. */
export default function Page({ searchParams }: PageProps<"/admin/performa">) {
  return (
    <Suspense fallback={<PerformaLoading />}>
      <OwnerScreenRoute searchParams={searchParams} screen={PerformaScreen} />
    </Suspense>
  );
}
