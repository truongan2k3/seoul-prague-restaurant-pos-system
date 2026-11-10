import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import Script from "next/script";
import { Providers } from "@/components/providers";
import { ThemeScript } from "@/components/theme-script";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { DEFAULT_BUSINESS_NAME } from "@/lib/business-branding";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfair = localFont({
  variable: "--font-playfair",
  src: [
    { path: "./fonts/playfair-display/PlayfairDisplay-Regular.ttf", weight: "400 600", style: "normal" },
    { path: "./fonts/playfair-display/PlayfairDisplay-Italic.ttf", weight: "400 600", style: "italic" },
  ],
  display: "swap",
  adjustFontFallback: "Times New Roman",
});

export const metadata: Metadata = {
  title: DEFAULT_BUSINESS_NAME,
  description: "Multi-device restaurant POS — Windows, Server Tablet, KDS, Bar",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: DEFAULT_BUSINESS_NAME,
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-gray-900 dark:bg-gray-950 dark:text-gray-100">
        <ThemeScript />
        <Providers>{children}</Providers>
        <Analytics />
        <Script
          src="https://static.cloudflareinsights.com/beacon.min.js"
          strategy="afterInteractive"
          data-cf-beacon='{"token": "58d42cdaa5dc4db2b9861f97c188de25"}'
        />
      </body>
    </html>
  );
}
