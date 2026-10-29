import Link from "next/link";
import { resolveLocale, makeT } from "@/i18n/server";
import LocaleSwitcher from "@/components/site/LocaleSwitcher";

/**
 * Lightweight top bar for the server-rendered pages. The map's Header is a
 * client component with push-notification and language state; these pages
 * are mostly text and should not pay for that on first paint. Labels come
 * from the same translation files as the app; the switcher reloads the page
 * in the chosen language.
 */
export default async function SiteNav() {
  const locale = await resolveLocale();
  const t = makeT(locale);
  return (
    <header className="sticky top-0 z-40 flex h-12 items-center justify-between border-b border-zinc-800 bg-[#0e0e0e]/95 px-4 backdrop-blur-md">
      <Link href="/" className="flex items-center gap-2 text-sm font-bold tracking-tight text-zinc-100">
        {t("app.title")}
        <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          {t("app.live")}
        </span>
      </Link>
      <nav aria-label="Site" className="flex items-center gap-1 text-xs font-medium text-zinc-400">
        <Link href="/" className="rounded-md px-2.5 py-1 hover:bg-zinc-900 hover:text-zinc-200">{t("nav.map")}</Link>
        <Link href="/dispatch" className="rounded-md px-2.5 py-1 hover:bg-zinc-900 hover:text-zinc-200">{t("nav.dispatches")}</Link>
        <Link href="/country" className="rounded-md px-2.5 py-1 hover:bg-zinc-900 hover:text-zinc-200">{t("pages.countries")}</Link>
        <Link href="/sources" className="hidden rounded-md px-2.5 py-1 hover:bg-zinc-900 hover:text-zinc-200 sm:inline">{t("nav.sources")}</Link>
        <Link href="/codebook" className="hidden rounded-md px-2.5 py-1 hover:bg-zinc-900 hover:text-zinc-200 md:inline">{t("pages.codebook")}</Link>
        <Link href="/about" className="hidden rounded-md px-2.5 py-1 hover:bg-zinc-900 hover:text-zinc-200 sm:inline">{t("nav.about")}</Link>
        <Link href="/support" className="rounded-md px-2.5 py-1 text-red-300 hover:bg-zinc-900">{t("pages.supportAid")}</Link>
        <LocaleSwitcher locale={locale} label={t("language.label")} />
      </nav>
    </header>
  );
}
