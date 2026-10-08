import type { ReactNode } from "react";
import {
  OWNER_ACCESS,
  linkAccess,
  requireWorkspaceFor,
  type ScreenProps,
  type SearchParams,
} from "@/lib/workspace";

/** A workbook screen: components/<feature>/<Feature>Screen.tsx. */
export type WorkbookScreen = (props: ScreenProps) => ReactNode | Promise<ReactNode>;

/*
 * Thin route files render one of these inside <Suspense> (they await params, searchParams
 * and the workspace, which is request data under cacheComponents):
 *
 *   // app/s/[token]/bmi/page.tsx
 *   export default function Page({ params, searchParams }: PageProps<"/s/[token]/bmi">) {
 *     return (
 *       <Suspense fallback={<BmiLoading />}>
 *         <LinkScreenRoute params={params} searchParams={searchParams} screen={BmiScreen} />
 *       </Suspense>
 *     );
 *   }
 *
 *   // app/admin/bmi/page.tsx
 *   export default function Page({ searchParams }: PageProps<"/admin/bmi">) {
 *     return (
 *       <Suspense fallback={<BmiLoading />}>
 *         <OwnerScreenRoute searchParams={searchParams} screen={BmiScreen} />
 *       </Suspense>
 *     );
 *   }
 */

/** Station-link route: access from the token, workspace from share_open(token). */
export async function LinkScreenRoute({
  params,
  searchParams,
  screen: Screen,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<SearchParams>;
  screen: WorkbookScreen;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const access = linkAccess(token);
  const ws = await requireWorkspaceFor(access);
  return <Screen access={access} ws={ws} searchParams={query} />;
}

/** Owner route: requireAdmin(), then share_open('') with the session (scope KPS, label Pemilik). */
export async function OwnerScreenRoute({
  searchParams,
  screen: Screen,
}: {
  searchParams: Promise<SearchParams>;
  screen: WorkbookScreen;
}) {
  const query = await searchParams;
  const ws = await requireWorkspaceFor(OWNER_ACCESS);
  return <Screen access={OWNER_ACCESS} ws={ws} searchParams={query} />;
}
