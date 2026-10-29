import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Nastaliq_Urdu, Noto_Sans_Arabic, Noto_Sans_Hebrew, Vazirmatn } from "next/font/google";
import JsonLd from "@/components/seo/JsonLd";
// Imported from @/i18n/locale and @/i18n/server, NOT @/i18n — the latter is
// a "use client" module, and a server component calling into it throws at
// runtime ("Attempted to call isLocale() from the server"). That failure
// typechecks and builds cleanly, so only an end-to-end request surfaces it.
import { localeDir } from "@/i18n/locale";
import { resolveLocale } from "@/i18n/server";
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

// Geist has no Hebrew glyphs; without this the Hebrew UI fell back to
// whatever the OS had (Arial on Windows, something else elsewhere) and
// mixed weights with the Latin fragments around it.
const notoHebrew = Noto_Sans_Hebrew({
  variable: "--font-noto-hebrew",
  subsets: ["hebrew"],
  weight: ["400", "500", "600", "700"],
});

// Persian is written in the Arabic script with four extra letters. Noto Sans
// Arabic has the glyphs, but Vazirmatn is what Persian-language sites use:
// its letterforms and the extended digits (۰-۹) are drawn for Persian, not
// adapted from Arabic.
const vazirmatn = Vazirmatn({
  variable: "--font-vazirmatn",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
});

// Urdu is set in Nastaliq, a hanging calligraphic style that a Naskh face
// such as Noto Sans Arabic renders legibly but wrong — Urdu readers see it
// as foreign. Nastaliq needs more line height than Latin; globals.css
// raises it for `[lang="ur"]`.
const notoNastaliq = Noto_Nastaliq_Urdu({
  variable: "--font-noto-nastaliq",
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
  "Real-time, open-source tracker of the 2026 US-Israel war on Iran (Operation Epic Fury). Tens of thousands of source-attributed conflict events — airstrikes, missile attacks, drone strikes, and strategic developments — each carrying its source, confidence and verification status. Read it in English, Spanish, French, Turkish, Arabic, Persian, Urdu or Hebrew. Includes an AI analyst for querying the dataset. 100% of donations go to humanitarian aid.";
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
  // No site-wide canonical: it used to be "/" here, which told search engines
  // every page on the site was a copy of the homepage. Each route sets its own.
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
  // correct direction. The saved cookie wins; a first-time visitor gets the
  // best match for their browser's Accept-Language. Previously a first visit
  // always rendered English/LTR and then mirrored the whole layout once the
  // client detected the browser language.
  const locale = await resolveLocale();

  return (
    <html lang={locale} dir={localeDir(locale)} className="dark" suppressHydrationWarning>
      <head>
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
        className={`${geistSans.variable} ${geistMono.variable} ${notoArabic.variable} ${notoHebrew.variable} ${vazirmatn.variable} ${notoNastaliq.variable} antialiased`}
      >
        <JsonLd />
        {children}
      </body>
    </html>
  );
}
