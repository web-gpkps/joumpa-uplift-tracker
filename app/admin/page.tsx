import { Suspense } from "react";
import type { Metadata } from "next";
import { OwnerScreenRoute } from "@/components/shell/ScreenRoute";
import { RingkasanLoading, RingkasanScreen } from "@/components/ringkasan/RingkasanScreen";

export const metadata: Metadata = { title: "Dashboard" };

// Sits in the same segment as the owner gate, which must check the session on every request.
export const instant = false;

/** Dashboard, owner (all stations). The screen is shared with /s/[token]. */
export default function Page({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<RingkasanLoading />}>
      <OwnerScreenRoute searchParams={searchParams} screen={RingkasanScreen} />
    </Suspense>
  );
}
