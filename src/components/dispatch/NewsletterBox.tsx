import type { Translate } from "@/i18n/server";
import { ENDONYM, type Locale } from "@/i18n/locale";
import { isConfigured } from "@/lib/newsletter-resend.cjs";
import NewsletterForm from "./NewsletterForm";

/**
 * Email signup. With Resend configured (RESEND_API_KEY + NEWSLETTER_FROM)
 * it renders the double-opt-in form, in the reader's language, subscribing
 * them to that language's dispatch. Without it, a hosted signup page can
 * be linked with NEXT_PUBLIC_NEWSLETTER_URL. With neither, nothing renders:
 * the page never shows a dead form.
 *
 * `notice` is the outcome of a confirmation link ("ok" / "expired" /
 * "error"), passed by the dispatch index from its query string.
 */
export default function NewsletterBox({ t, locale, notice }: { t: Translate; locale: Locale; notice?: string | null }) {
  const configured = isConfigured();
  const href = process.env.NEXT_PUBLIC_NEWSLETTER_URL;
  if (!configured && !href) return null;

  const noticeText =
    notice === "ok" ? t("pages.subscribed") : notice === "expired" ? t("pages.confirmExpired") : notice === "error" ? t("pages.subscribeError") : null;

  return (
    <aside className="mt-10 rounded-xl border border-zinc-800 bg-[#111] p-4">
      {noticeText && (
        <p className={`mb-3 rounded-lg px-3 py-2 text-sm ${notice === "ok" ? "bg-emerald-950/40 text-emerald-200" : "bg-amber-950/40 text-amber-200"}`} role="status">
          {noticeText}
        </p>
      )}
      <div className="sm:flex sm:items-center sm:justify-between sm:gap-6">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">{t("pages.newsletterTitle")}</h2>
          <p className="mt-1 text-xs text-zinc-400">{t("pages.newsletterBody")}</p>
          {configured && locale !== "en" && (
            <p className="mt-1 text-xs text-zinc-500">{t("pages.newsletterLang", { language: ENDONYM[locale] })}</p>
          )}
        </div>
        {configured ? (
          <NewsletterForm
            locale={locale}
            labels={{
              email: t("pages.emailLabel"),
              placeholder: t("pages.emailPlaceholder"),
              subscribe: t("pages.subscribe"),
              sending: t("pages.subscribing"),
              sent: t("pages.checkInbox"),
              error: t("pages.subscribeError"),
              invalid: t("pages.invalidEmail"),
            }}
          />
        ) : (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-black hover:bg-white sm:mt-0"
          >
            {t("pages.subscribe")}
          </a>
        )}
      </div>
    </aside>
  );
}
