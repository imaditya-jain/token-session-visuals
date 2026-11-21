import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";

import Providers from "@/components/providers/Providers";
import { publicOrigin } from "@/server/config/site";

import "../styles.css";

// Same files and weight faces Google Fonts served for the original design (see src/fonts/README.md).
const fraunces = localFont({
  src: [
    { path: "../fonts/fraunces-latin-v38.woff2", weight: "400", style: "normal" },
    { path: "../fonts/fraunces-latin-v38.woff2", weight: "500", style: "normal" },
    { path: "../fonts/fraunces-latin-v38.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
  // Metric-adjusted fallback: until the web font arrives, text is laid out in the same space, so nothing moves
  // when it swaps in (no layout shift).
  adjustFontFallback: "Times New Roman",
  variable: "--font-fraunces",
});

const workSans = localFont({
  src: [
    { path: "../fonts/work-sans-latin-v24.woff2", weight: "300", style: "normal" },
    { path: "../fonts/work-sans-latin-v24.woff2", weight: "400", style: "normal" },
    { path: "../fonts/work-sans-latin-v24.woff2", weight: "500", style: "normal" },
    { path: "../fonts/work-sans-latin-v24.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
  adjustFontFallback: "Arial",
  variable: "--font-work-sans",
});

export const metadata: Metadata = {
  // Makes every relative canonical / social-card URL absolute.
  metadataBase: new URL(publicOrigin()),
  title: "Fernwood — Premium Plants & Garden Essentials",
  description:
    "Shop lush house plants, succulents, handmade pots and garden tools at Fernwood — a premium botanical store for greener living.",
  openGraph: {
    title: "Fernwood — Premium Plants & Garden Essentials",
    description:
      "Bring color and life to your home. House plants, succulents, pots and tools from Fernwood's nursery to your door.",
    type: "website",
    siteName: "Fernwood",
    images: [{ url: "/images/hero-plants.jpg", alt: "Fernwood plants" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/images/hero-plants.jpg"],
    title: "Fernwood — Premium Plants & Garden Essentials",
    description: "Bring color and life to your home with Fernwood's premium plants and pots.",
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${workSans.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
