import { Suspense } from "react";
import type { Metadata } from "next";
import { OwnerScreenRoute } from "@/components/shell/ScreenRoute";
import { SdmLoading, SdmScreen } from "@/components/sdm/SdmScreen";

export const metadata: Metadata = { title: "Master SDM" };

/** Master SDM, owner (all stations). The screen is shared with /s/[token]/sdm. */
export default function Page({ searchParams }: PageProps<"/admin/sdm">) {
  return (
    <Suspense fallback={<SdmLoading />}>
      <OwnerScreenRoute searchParams={searchParams} screen={SdmScreen} />
    </Suspense>
  );
}
