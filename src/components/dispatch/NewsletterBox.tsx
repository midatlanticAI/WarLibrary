/**
 * Email signup. Dispatches are delivered by an RSS-to-email provider that
 * reads /dispatch/feed.xml, so there is no sending code here: the box links
 * to the provider's hosted signup page, set with NEXT_PUBLIC_NEWSLETTER_URL.
 * Rendered only when that is configured, so the page never shows a dead form.
 */
export default function NewsletterBox() {
  const href = process.env.NEXT_PUBLIC_NEWSLETTER_URL;
  if (!href) return null;
  return (
    <aside className="mt-10 rounded-xl border border-zinc-800 bg-[#111] p-4 sm:flex sm:items-center sm:justify-between sm:gap-6">
      <div>
        <h2 className="text-sm font-semibold text-zinc-100">Get the dispatch by email</h2>
        <p className="mt-1 text-xs text-zinc-400">The daily digest in your inbox each morning. No tracking beyond delivery; unsubscribe in one click.</p>
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-black hover:bg-white sm:mt-0"
      >
        Subscribe
      </a>
    </aside>
  );
}
