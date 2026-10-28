import Link from "next/link";

/**
 * Lightweight top bar for the server-rendered pages. The map's Header is a
 * client component with push-notification and language state; these pages
 * are mostly text and should not pay for that on first paint.
 */
export default function SiteNav() {
  return (
    <header className="sticky top-0 z-40 flex h-12 items-center justify-between border-b border-zinc-800 bg-[#0e0e0e]/95 px-4 backdrop-blur-md">
      <Link href="/" className="flex items-center gap-2 text-sm font-bold tracking-tight text-zinc-100">
        WAR LIBRARY
        <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          Live
        </span>
      </Link>
      <nav aria-label="Site" className="flex items-center gap-1 text-xs font-medium text-zinc-400">
        <Link href="/" className="rounded-md px-2.5 py-1 hover:bg-zinc-900 hover:text-zinc-200">Map</Link>
        <Link href="/country" className="rounded-md px-2.5 py-1 hover:bg-zinc-900 hover:text-zinc-200">Countries</Link>
        <Link href="/sources" className="hidden rounded-md px-2.5 py-1 hover:bg-zinc-900 hover:text-zinc-200 sm:inline">Sources</Link>
        <Link href="/about" className="hidden rounded-md px-2.5 py-1 hover:bg-zinc-900 hover:text-zinc-200 sm:inline">About</Link>
        <Link href="/support" className="rounded-md px-2.5 py-1 text-red-300 hover:bg-zinc-900">Support aid</Link>
      </nav>
    </header>
  );
}
