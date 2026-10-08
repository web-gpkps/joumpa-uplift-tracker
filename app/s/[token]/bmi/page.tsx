import { Suspense } from "react";
import type { Metadata } from "next";
import { LinkScreenRoute } from "@/components/shell/ScreenRoute";
import { BmiLoading, BmiScreen } from "@/components/bmi/BmiScreen";

// Health data: the title never carries a name or a measurement.
export const metadata: Metadata = { title: "Cek BMI" };

/** Cek BMI, station link (scope from the token). The screen is shared with /admin/bmi. */
export default function Page({ params, searchParams }: PageProps<"/s/[token]/bmi">) {
  return (
    <Suspense fallback={<BmiLoading />}>
      <LinkScreenRoute params={params} searchParams={searchParams} screen={BmiScreen} />
    </Suspense>
  );
}
