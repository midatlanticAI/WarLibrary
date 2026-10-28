"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import Header from "@/components/ui/Header";
import MobileNav from "@/components/ui/MobileNav";
import BreakingTicker from "@/components/home/BreakingTicker";
import PageView from "@/components/analytics/PageView";
import { I18nProvider } from "@/i18n";
import { useSummary } from "@/hooks/useSummary";
import { CONFLICT_START, pathForTab, type Tab, type MobileTab } from "@/lib/navigation";

/**
 * Chrome for the content pages (/about, /sources, /support): the same header,
 * breaking-news ticker and mobile nav as the map, with navigation going
 * through real URLs. These used to be client-side tabs under "/" —
 * unlinkable and invisible to search.
 */
export default function PageShell({
  tab,
  children,
}: {
  tab: Exclude<Tab, "map" | "ask">;
  children: ReactNode;
}) {
  return (
    <I18nProvider>
      <ShellContent tab={tab}>{children}</ShellContent>
    </I18nProvider>
  );
}

function ShellContent({
  tab,
  children,
}: {
  tab: Exclude<Tab, "map" | "ask">;
  children: ReactNode;
}) {
  const router = useRouter();
  const summary = useSummary();
  const dayCount = Math.ceil(
    (Date.now() - new Date(CONFLICT_START).getTime()) / 86_400_000
  );

  function go(next: Tab | MobileTab) {
    router.push(pathForTab(next));
  }

  return (
    <div className="relative flex h-dvh flex-col">
      <PageView page={tab} />
      <Header
        lastUpdated={null}
        activeTab={tab}
        onTabChange={go}
        eventCount={summary?.total ?? 0}
        dayCount={dayCount}
      />
      <BreakingTicker />
      {children}
      <MobileNav active={tab} onChange={go} />
    </div>
  );
}
