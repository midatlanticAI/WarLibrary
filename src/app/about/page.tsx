import type { Metadata } from "next";
import PageShell from "@/components/home/PageShell";
import AboutClient from "./AboutClient";

export const metadata: Metadata = {
  title: "About",
  description:
    "What War Library is, how events are collected and verified, who runs it, and how to reach us. An open-source, source-attributed conflict tracker.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About War Library",
    description:
      "What War Library is, how events are collected and verified, and who runs it.",
    url: "https://warlibrary.midatlantic.ai/about",
    type: "website",
  },
};

export default function AboutRoute() {
  return (
    <PageShell tab="about">
      <AboutClient />
    </PageShell>
  );
}
