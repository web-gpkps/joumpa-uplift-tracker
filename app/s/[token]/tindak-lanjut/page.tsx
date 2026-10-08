import { Suspense } from "react";
import type { Metadata } from "next";
import { LinkScreenRoute } from "@/components/shell/ScreenRoute";
import { TindakLanjutLoading, TindakLanjutScreen } from "@/components/tindak-lanjut/TindakLanjutScreen";

export const metadata: Metadata = { title: "Tindak Lanjut" };

/** Tindak Lanjut, station link (scope from the token). The screen is shared with /admin/tindak-lanjut. */
export default function Page({ params, searchParams }: PageProps<"/s/[token]/tindak-lanjut">) {
  return (
    <Suspense fallback={<TindakLanjutLoading />}>
      <LinkScreenRoute params={params} searchParams={searchParams} screen={TindakLanjutScreen} />
    </Suspense>
  );
}
