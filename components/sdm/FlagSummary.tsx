import type { ReactNode } from "react";
import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { buttonClasses } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";

export type FlagItem = {
  key: string;
  count: number;
  /** "Beda – verifikasi", "NIPP ganda", ... */
  title: string;
  /** What the flag means and why it matters. */
  detail: ReactNode;
  /** Links shown when count > 0. */
  links: Array<{ href: string; label: string; current?: boolean }>;
  /** This flag is the active table filter. */
  active: boolean;
};

/**
 * "Perlu diperiksa": the record problems on this screen, counted generically from the
 * data (lib/rules for Beda; NIPP and L/P from the staff rows). Each one filters the
 * table through a real link (?cek=...). Server component.
 */
export function FlagSummary({ items, scopeName }: { items: FlagItem[]; scopeName: string }) {
  return (
    <Panel
      title="Perlu diperiksa"
      description={`Data SDM ${scopeName} yang tidak cocok atau belum lengkap. Pilih salah satu untuk menyaring tabel.`}
      padding="flush"
    >
      <ul className="grid border-t border-line sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <li
            key={item.key}
            className={cx(
              "flex flex-col gap-2 border-b border-line px-4 py-4 sm:px-6 xl:border-b-0 xl:border-r xl:last:border-r-0",
              "sm:odd:border-r xl:odd:border-r",
              item.active && "bg-brand-tint",
            )}
          >
            <p className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-ink tabular-nums">{item.count}</span>
              <span className="text-sm font-semibold text-ink">{item.title}</span>
            </p>
            <div className="text-xs text-ink-muted">{item.detail}</div>
            {item.count > 0 ? (
              <div className="mt-auto flex flex-wrap gap-2 pt-1">
                {item.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={link.current ? "page" : undefined}
                    className={buttonClasses({ variant: "secondary", size: "sm" })}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-auto text-xs font-semibold text-good">Tidak ada</p>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
