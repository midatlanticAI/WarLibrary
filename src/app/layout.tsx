import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono, Noto_Sans_Arabic } from "next/font/google";
import JsonLd from "@/components/seo/JsonLd";
// Imported from @/i18n/locale, NOT @/i18n — the latter is a "use client"
// module, and a server component calling into it throws at runtime
// ("Attempted to call isLocale() from the server"). That failure typechecks
// and builds cleanly, so only an end-to-end request surfaces it.
import { LOCALE_COOKIE, isLocale, localeDir, type Locale } from "@/i18n/locale";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoArabic = Noto_Sans_Arabic({
  variable: "--font-noto-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
});

const siteUrl = "https://warlibrary.midatlantic.ai";
const siteTitle = "War Library — Live Conflict Tracker";
// Deliberately free of event and country counts. Both change continuously, a
// hardcoded figure here cannot track them, and earlier versions of this string,
// the README and the repository description each published a different number —
// none of which matched the dataset. On a site whose premise is accuracy, a
// stale number in the first thing a search engine reads is not a small thing.
// Live counts are rendered from the data itself, in the app.
const siteDescription =
  "Real-time, open-source tracker of the 2026 US-Israel war on Iran (Operation Epic Fury). Tens of thousands of source-attributed conflict events — airstrikes, missile attacks, drone strikes, and strategic developments — each carrying its source, confidence and verification status. Read it in English, Spanish, Arabic or Hebrew. Includes an AI analyst for querying the dataset. 100% of donations go to humanitarian aid.";
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
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolve the reader's language on the server so the very first paint has the
  // correct direction. Previously this was hardcoded to en/ltr, so every visit
  // by an Arabic or Hebrew reader rendered left-to-right and then mirrored the
  // entire layout once the client picked up their saved preference.
  const cookieStore = await cookies();
  const savedLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale: Locale = isLocale(savedLocale) ? savedLocale : "en";

  return (
    <html lang={locale} dir={localeDir(locale)} className="dark" suppressHydrationWarning>
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
        className={`${geistSans.variable} ${geistMono.variable} ${notoArabic.variable} antialiased`}
      >
        <JsonLd />
        {children}
      </body>
    </html>
  );
}
