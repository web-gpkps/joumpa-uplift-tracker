import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type ButtonSize = "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 rounded-control font-semibold whitespace-nowrap select-none " +
  "transition-colors duration-150 " +
  "disabled:cursor-not-allowed aria-disabled:cursor-not-allowed";

const sizes: Record<ButtonSize, string> = {
  // 44 px tall on phones (tap target), 40 px from 640 px up.
  md: "min-h-11 px-4 text-sm sm:min-h-10",
  // Compact rows in dense tables. Still 44 px on phones.
  sm: "min-h-11 px-3 text-sm sm:min-h-8 sm:text-xs",
};

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-white hover:bg-brand-strong active:bg-brand-strong " +
    "disabled:bg-neutral-tint disabled:text-ink-muted",
  secondary:
    "bg-surface text-ink border border-line-strong hover:bg-neutral-tint active:bg-neutral-tint " +
    "disabled:text-ink-muted disabled:border-line",
  quiet:
    "bg-transparent text-ink hover:bg-neutral-tint active:bg-neutral-tint disabled:text-ink-muted",
  danger:
    "bg-critical text-white hover:bg-critical-strong active:bg-critical-strong " +
    "disabled:bg-neutral-tint disabled:text-ink-muted",
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  fullWidth = false,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
} = {}): string {
  return cx(base, sizes[size], variants[variant], fullWidth && "w-full");
}

type ButtonProps = Omit<ComponentProps<"button">, "children"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Disables the button and swaps the label for `loadingText`. No spinner (MOTION 1: no loops). */
  loading?: boolean;
  /** Label shown while loading, e.g. "Menyimpan…". Name the action in progress. */
  loadingText?: ReactNode;
  children: ReactNode;
};

/**
 * Button. Server-component friendly (no hooks). `type` defaults to "button" so a
 * button inside a form never submits by accident; pass type="submit" explicitly.
 */
export function Button({
  variant = "primary",
  size = "md",
  fullWidth,
  loading = false,
  loadingText,
  disabled,
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(buttonClasses({ variant, size, fullWidth }), className)}
      {...rest}
    >
      {loading && loadingText ? loadingText : children}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
};

/** A next/link styled as a button, for actions that navigate. */
export function ButtonLink({
  variant = "secondary",
  size = "md",
  fullWidth,
  className,
  ...rest
}: ButtonLinkProps) {
  return <Link className={cx(buttonClasses({ variant, size, fullWidth }), className)} {...rest} />;
}
