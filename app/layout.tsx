import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Plus Jakarta Sans (DESIGN.md Typography): made for Jakarta's city identity,
// renders Bahasa Indonesia well and has tabular figures for score/BMI columns.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "JOUMPA Uplift Tracker",
    template: "%s | JOUMPA Uplift Tracker",
  },
  description:
    "Pemantauan 10 minggu pasca pelatihan Uplifting Service JOUMPA, Customer Service Division PT Gapura Angkasa.",
  // Internal tool: nothing here should appear in search results.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#faf9f5",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={jakarta.variable}>
      <body>{children}</body>
    </html>
  );
}
