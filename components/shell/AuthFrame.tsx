import type { ReactNode } from "react";
import { Logo } from "./Logo";

type AuthFrameProps = {
  /** Page heading (h1). */
  title: ReactNode;
  /** One or two sentences under the heading. */
  intro?: ReactNode;
  children?: ReactNode;
  /** Muted note under the panel. */
  footnote?: ReactNode;
};

/**
 * Frame for screens outside the shells (login, access problems). The panel's top edge in the
 * logo mark's lime-to-emerald gradient is the app's one brand moment.
 */
export function AuthFrame({ title, intro, children, footnote }: AuthFrameProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-[26rem]">
        <section
          aria-labelledby="auth-frame-title"
          className="overflow-hidden rounded-panel border border-line bg-surface"
        >
          <div aria-hidden="true" className="h-1 bg-linear-to-r from-mark-lime to-mark-emerald" />
          {/* Panel padding (24 px+) is the logo's clear space (≥ 25 % of 72 px = 18 px). */}
          <div className="px-6 pt-6 pb-8 sm:px-8 sm:pt-8">
            <Logo height={72} clearSpace={false} />
            <h1 id="auth-frame-title" className="mt-6 text-xl font-semibold text-ink sm:text-2xl">
              {title}
            </h1>
            {intro ? <div className="mt-2 text-sm wrap-break-word text-ink-muted">{intro}</div> : null}
            {children ? <div className="mt-6">{children}</div> : null}
          </div>
        </section>
        {footnote ? <div className="mt-4 px-1 text-sm text-ink-muted">{footnote}</div> : null}
      </div>
    </main>
  );
}
