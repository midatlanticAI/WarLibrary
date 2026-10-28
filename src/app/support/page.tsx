import type { Metadata } from "next";
import PageShell from "@/components/home/PageShell";
import SupportClient from "./SupportClient";

export const metadata: Metadata = {
  title: "Support humanitarian aid",
  description:
    "Vetted humanitarian organizations working in the affected countries. War Library takes nothing: every donation goes directly to the organization you choose.",
  alternates: { canonical: "/support" },
  openGraph: {
    title: "Support humanitarian aid | War Library",
    description:
      "Vetted humanitarian organizations working in the affected countries. 100% goes to the organization you choose.",
    url: "https://warlibrary.midatlantic.ai/support",
    type: "website",
  },
};

export default function SupportRoute() {
  return (
    <PageShell tab="donate">
      <SupportClient />
    </PageShell>
  );
}
