import { Suspense } from "react";
import type { Metadata } from "next";
import { LinkScreenRoute } from "@/components/shell/ScreenRoute";
import { RingkasanLoading, RingkasanScreen } from "@/components/ringkasan/RingkasanScreen";

// The layout's title template only reaches child segments, not this index page.
export const metadata: Metadata = { title: { absolute: "Dashboard | Ruang kerja JOUMPA" } };

// Sits in the same segment as the token gate, which must reach the database on every request.
export const instant = false;

/** Dashboard, station link (scope from the token). The screen is shared with /admin. */
export default function Page({ params, searchParams }: PageProps<"/s/[token]">) {
  return (
    <Suspense fallback={<RingkasanLoading />}>
      <LinkScreenRoute params={params} searchParams={searchParams} screen={RingkasanScreen} />
    </Suspense>
  );
}
