import type { Metadata } from "next";
import { Suspense } from "react";
import HomeClient from "@/components/home/HomeClient";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/**
 * The map. All of the interactive app lives in HomeClient; this server
 * wrapper exists so the homepage can carry its own metadata and so
 * `useSearchParams` (which reads ?tab, ?e, ?from, ?to for deep links) has
 * the Suspense boundary Next requires.
 */
export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh w-screen items-center justify-center bg-[#0a0a0a]">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-amber-500" />
        </div>
      }
    >
      <HomeClient />
    </Suspense>
  );
}
