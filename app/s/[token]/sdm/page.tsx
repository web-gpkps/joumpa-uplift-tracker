import { Suspense } from "react";
import type { Metadata } from "next";
import { LinkScreenRoute } from "@/components/shell/ScreenRoute";
import { SdmLoading, SdmScreen } from "@/components/sdm/SdmScreen";

export const metadata: Metadata = { title: "Master SDM" };

/** Master SDM, station link (scope from the token). The screen is shared with /admin/sdm. */
export default function Page({ params, searchParams }: PageProps<"/s/[token]/sdm">) {
  return (
    <Suspense fallback={<SdmLoading />}>
      <LinkScreenRoute params={params} searchParams={searchParams} screen={SdmScreen} />
    </Suspense>
  );
}
