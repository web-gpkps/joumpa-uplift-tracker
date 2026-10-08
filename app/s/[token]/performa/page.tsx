import { Suspense } from "react";
import type { Metadata } from "next";
import { LinkScreenRoute } from "@/components/shell/ScreenRoute";
import { PerformaLoading, PerformaScreen } from "@/components/performa/PerformaScreen";

export const metadata: Metadata = { title: "Log Performa" };

/** Log Performa, station link (scope from the token). The screen is shared with /admin/performa. */
export default function Page({ params, searchParams }: PageProps<"/s/[token]/performa">) {
  return (
    <Suspense fallback={<PerformaLoading />}>
      <LinkScreenRoute params={params} searchParams={searchParams} screen={PerformaScreen} />
    </Suspense>
  );
}
