import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import JsonLd from "@/components/seo/JsonLd";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = "https://warlibrary.midatlantic.ai";
const siteTitle = "War Library — Live Conflict Tracker";
const siteDescription =
  "Real-time, open-source tracker of the 2026 US-Israel war on Iran (Operation Epic Fury). 150+ verified conflict events mapped across 28 countries — airstrikes, missile attacks, drone strikes, and strategic developments. Every event is source-attributed from Al Jazeera, BBC, Reuters, CNN, and AP with confidence scoring. Includes AI analyst for querying the dataset. 100% of donations go to humanitarian aid.";
const ogImage = `${siteUrl}/icons/icon-512.png`;

export const metadata: Metadata = {
  title: {
    default: siteTitle,
    template: "%s | War Library",
  },
  description: siteDescription,
  keywords: [
    "war library",
    "conflict tracker",
    "middle east",
    "iran",
    "israel",
    "operation epic fury",
    "2026 war",
    "humanitarian",
    "live map",
    "verified events",
    "airstrike tracker",
    "missile attack map",
    "Iran war map",
    "OSINT",
    "open source intelligence",
    "conflict data",
    "real-time war tracker",
    "civilian casualties",
    "drone strikes Iran",
  ],
  category: "News",
  classification: "Conflict Tracking / Open Source Intelligence",
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    type: "website",
    url: siteUrl,
    siteName: "War Library",
    locale: "en_US",
    images: [
      {
        url: ogImage,
        width: 512,
        height: 512,
        alt: "War Library — Live Conflict Tracker",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: siteTitle,
    description: siteDescription,
    images: [ogImage],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
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
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <JsonLd />
        {children}
      </body>
    </html>
  );
}
