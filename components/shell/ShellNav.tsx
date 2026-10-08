"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { isActive, type NavItem } from "./nav-items";

type ShellNavProps = {
  /** Logo + context (product, scope), rendered on the server and passed in. */
  brand: ReactNode;
  /** Sections. Plain data, so a server component can build them (e.g. per token). */
  items: NavItem[];
  /** Right side of row 1 on desktop, bottom of the menu on phones (user + sign-out, link label). */
  aside?: ReactNode;
  /** Accessible name of the nav landmark. */
  label: string;
};

function linkClasses(active: boolean): string {
  return cx(
    "flex min-h-11 items-center px-3 font-semibold whitespace-nowrap transition-colors duration-150",
    // Phones and tablets: full-width 44 px rows, the current one on --brand-tint.
    "rounded-control text-base",
    active ? "bg-brand-tint text-ink" : "text-ink-muted hover:bg-neutral-tint hover:text-ink",
    // From 900 px: a horizontal row; the current section gets a 2 px --brand underline.
    "nav:-mb-px nav:rounded-none nav:border-b-2 nav:bg-transparent nav:text-sm nav:hover:bg-transparent",
    active ? "nav:border-brand" : "nav:border-transparent nav:hover:border-line-strong",
  );
}

/**
 * Top bar rows 1 and 2 for both shells. Under 900 px the nav collapses behind a labelled
 * "Menu" disclosure; Escape closes it and returns focus to the button.
 */
export function ShellNav({ brand, items, aside, label }: ShellNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <div className="flex min-h-14 items-center gap-3">
        {brand}
        {aside ? (
          <div className="ml-auto hidden max-w-[24rem] min-w-0 items-center gap-3 nav:flex">{aside}</div>
        ) : null}
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          aria-controls="menu-utama"
          onClick={() => setOpen((value) => !value)}
          className="ml-auto inline-flex min-h-11 shrink-0 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-neutral-tint nav:hidden"
        >
          <span aria-hidden="true" className="flex w-4 flex-col gap-[3px]">
            <span className="h-0.5 bg-ink" />
            <span className="h-0.5 bg-ink" />
            <span className="h-0.5 bg-ink" />
          </span>
          {open ? "Tutup menu" : "Menu"}
        </button>
      </div>

      <div
        id="menu-utama"
        className={cx(open ? "block" : "hidden", "pb-3 nav:block nav:border-b nav:border-line nav:pb-0")}
      >
        <nav aria-label={label}>
          <ul className="flex flex-col gap-1 nav:-mx-3 nav:flex-row nav:flex-wrap nav:gap-0">
            {items.map((item) => {
              const active = isActive(pathname, item);
              return (
                <li key={item.href} className={item.groupLabel ? "mt-3 nav:mt-0 nav:flex nav:items-center" : undefined}>
                  {item.groupLabel ? (
                    <>
                      {/* Phones: a small heading. Desktop: a thin divider before the group. */}
                      <span className="section-label mb-1 block px-3 nav:hidden">{item.groupLabel}</span>
                      <span aria-hidden="true" className="mx-2 hidden h-5 w-px bg-line-strong nav:block" />
                    </>
                  ) : null}
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={linkClasses(active)}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        {aside ? (
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3 nav:hidden">
            {aside}
          </div>
        ) : null}
      </div>
    </>
  );
}
