import { Suspense } from "react";
import type { Metadata } from "next";
import { OwnerScreenRoute } from "@/components/shell/ScreenRoute";
import { TindakLanjutLoading, TindakLanjutScreen } from "@/components/tindak-lanjut/TindakLanjutScreen";

export const metadata: Metadata = { title: "Tindak Lanjut" };

/** Tindak Lanjut, owner (all stations). The screen is shared with /s/[token]/tindak-lanjut. */
export default function Page({ searchParams }: PageProps<"/admin/tindak-lanjut">) {
  return (
    <Suspense fallback={<TindakLanjutLoading />}>
      <OwnerScreenRoute searchParams={searchParams} screen={TindakLanjutScreen} />
    </Suspense>
  );
}
