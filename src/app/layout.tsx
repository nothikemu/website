import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/app/providers";
import "./globals.css";

const plex = localFont({
  src: [
    { path: "./fonts/plex-sans.woff2", style: "normal", weight: "100 700" },
    { path: "./fonts/plex-sans-italic.woff2", style: "italic", weight: "100 700" },
  ],
  variable: "--font-plex",
  display: "swap",
});
const mono = localFont({ src: "./fonts/jetbrains-mono.woff2", variable: "--font-jetbrains", weight: "100 800", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Forgebase — the engineering workspace for teams that build real things", template: "%s · Forgebase" },
  description:
    "Forgebase brings CAD, firmware, requirements, tests, decisions and lab notebooks into one versioned, traceable workspace for robotics and hardware teams.",
  applicationName: "Forgebase",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0d0f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${plex.variable} ${mono.variable}`}>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
