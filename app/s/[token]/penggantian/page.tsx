import { Suspense } from "react";
import type { Metadata } from "next";
import { LinkScreenRoute } from "@/components/shell/ScreenRoute";
import { PenggantianLoading, PenggantianScreen } from "@/components/penggantian/PenggantianScreen";

export const metadata: Metadata = { title: "Penggantian SDM" };

/** Penggantian SDM, station link (scope from the token). The screen is shared with /admin/penggantian. */
export default function Page({ params, searchParams }: PageProps<"/s/[token]/penggantian">) {
  return (
    <Suspense fallback={<PenggantianLoading />}>
      <LinkScreenRoute params={params} searchParams={searchParams} screen={PenggantianScreen} />
    </Suspense>
  );
}
