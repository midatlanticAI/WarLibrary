"use client";

import { useEffect } from "react";
import type { PageName } from "@/lib/analytics-store";

/**
 * Fire-and-forget page-view beacon for the routed pages (about, sources,
 * support, event, country). The map app posts its own tab changes.
 */
export default function PageView({ page }: { page: Exclude<PageName, "landing" | "map" | "feed" | "ask"> }) {
  useEffect(() => {
    fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page }),
      keepalive: true,
    }).catch(() => {});
  }, [page]);
  return null;
}
