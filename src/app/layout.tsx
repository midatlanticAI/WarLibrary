import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "War Library — Live Conflict Tracker",
  description:
    "Neutral, source-verified tracking of the 2026 Middle East conflict. 124+ events across 17 countries. AI-powered analysis. 100% of proceeds to humanitarian aid.",
  keywords: [
    "war",
    "middle east",
    "conflict",
    "iran",
    "israel",
    "map",
    "analysis",
    "humanitarian",
    "tracker",
  ],
  openGraph: {
    title: "War Library — Live Conflict Tracker",
    description:
      "Neutral, source-verified tracking of the 2026 Middle East conflict. 124+ events across 17 countries. AI-powered analysis. 100% of proceeds to humanitarian aid.",
    type: "website",
    siteName: "War Library",
  },
  twitter: {
    card: "summary",
    title: "War Library — Live Conflict Tracker",
    description:
      "Neutral, source-verified tracking of the 2026 Middle East conflict. 124+ events across 17 countries. AI-powered analysis.",
  },
  other: {
    "theme-color": "#0a0a0a",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css"
          rel="stylesheet"
        />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="War Library" />
        <meta name="theme-color" content="#0a0a0a" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
