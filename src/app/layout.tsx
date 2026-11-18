import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import Providers from "@/components/providers/Providers";

import "../styles.css";

export const metadata: Metadata = {
  title: "Fernwood — Premium Plants & Garden Essentials",
  description:
    "Shop lush house plants, succulents, handmade pots and garden tools at Fernwood — a premium botanical store for greener living.",
  openGraph: {
    title: "Fernwood — Premium Plants & Garden Essentials",
    description:
      "Bring color and life to your home. House plants, succulents, pots and tools from Fernwood's nursery to your door.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Fernwood — Premium Plants & Garden Essentials",
    description: "Bring color and life to your home with Fernwood's premium plants and pots.",
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- identical font request to the locked Lovable design; migrates to next/font in feat/perf-fonts with baseline verification */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Work+Sans:wght@300;400;500;600&display=swap"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
