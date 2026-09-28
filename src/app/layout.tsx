import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { getLang } from "@/lib/i18n/server";
import "./globals.css";

// Archivo, with its width axis: condensed for labels, expanded for headlines,
// the way broadcast timing graphics use one family at several widths.
const archivo = Archivo({
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Ghostbook", template: "%s · Ghostbook" },
  description: "Family records log: Mario Kart World time trials, Lounge, wars and CoD Zombies runs.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0a",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} className={archivo.variable}>
      <body>{children}</body>
    </html>
  );
}
