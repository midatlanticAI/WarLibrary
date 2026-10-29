import type { Translate } from "@/i18n/server";

/**
 * Email signup. Dispatches are delivered by an email provider that reads
 * /dispatch/feed.xml (or a broadcast hook), so there is no sending code
 * here: the box links to the hosted signup page set with
 * NEXT_PUBLIC_NEWSLETTER_URL. Rendered only when that is configured, so the
 * page never shows a dead form.
 */
export default function NewsletterBox({ t }: { t: Translate }) {
  const href = process.env.NEXT_PUBLIC_NEWSLETTER_URL;
  if (!href) return null;
  return (
    <aside className="mt-10 rounded-xl border border-zinc-800 bg-[#111] p-4 sm:flex sm:items-center sm:justify-between sm:gap-6">
      <div>
        <h2 className="text-sm font-semibold text-zinc-100">{t("pages.newsletterTitle")}</h2>
        <p className="mt-1 text-xs text-zinc-400">{t("pages.newsletterBody")}</p>
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-black hover:bg-white sm:mt-0"
      >
        {t("pages.subscribe")}
      </a>
    </aside>
  );
}
