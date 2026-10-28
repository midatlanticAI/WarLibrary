import type { Metadata } from "next";
import PageShell from "@/components/home/PageShell";
import SourcesClient from "./SourcesClient";

export const metadata: Metadata = {
  title: "Sources and verification",
  description:
    "The news outlets War Library draws on, how each event is attributed to its source, and what the confidence and verification labels mean.",
  alternates: { canonical: "/sources" },
  openGraph: {
    title: "Sources and verification | War Library",
    description:
      "The outlets War Library draws on and how every event is attributed and verified.",
    url: "https://warlibrary.midatlantic.ai/sources",
    type: "website",
  },
};

export default function SourcesRoute() {
  return (
    <PageShell tab="sources">
      <SourcesClient />
    </PageShell>
  );
}
