"use client";

import { useRouter } from "next/navigation";
import AboutPage from "@/components/ui/AboutPage";

export default function AboutClient() {
  const router = useRouter();
  return <AboutPage onBack={() => router.push("/")} />;
}
