import Image from "next/image";
import logo from "@/public/brand/gapura-airport-services.png";
import { cx } from "@/components/ui/cx";

/** Intrinsic size of the official file: 1052 × 569 (ratio 1.849:1). */
const RATIO = logo.width / logo.height;

type LogoProps = {
  /**
   * Rendered height in px. DESIGN.md sizes: app header 36, login 72,
   * share page header 40, printed report 48. Width always follows the ratio.
   */
  height?: number;
  /**
   * Logos sit at the top of every screen, so they load eagerly by default
   * (Next 16: `priority` is deprecated; eager loading is the replacement).
   */
  eager?: boolean;
  /**
   * Keep the clear space DESIGN.md asks for (≥ 25 % of the height on every side)
   * as padding. Default true; turn off only when the parent already reserves it.
   */
  clearSpace?: boolean;
  className?: string;
};

/**
 * The official Gapura Airport Services logo, never stretched, recoloured or cropped.
 * Height is set and width derived; the box cannot shrink, so a narrow parent cannot squash it.
 */
export function Logo({ height = 36, eager = true, clearSpace = true, className }: LogoProps) {
  const width = Math.round(height * RATIO);
  const pad = clearSpace ? Math.ceil(height * 0.25) : 0;
  return (
    <span className={cx("inline-flex shrink-0", className)} style={{ padding: pad }}>
      <Image
        src={logo}
        alt="Gapura Airport Services"
        width={width}
        height={height}
        loading={eager ? "eager" : "lazy"}
        style={{
          height,
          width: "auto",
          maxWidth: "none",
          aspectRatio: `${logo.width} / ${logo.height}`,
          flexShrink: 0,
        }}
      />
    </span>
  );
}
