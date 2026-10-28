"use client";

import { useRouter } from "next/navigation";
import SourcesPage from "@/components/ui/SourcesPage";

export default function SourcesClient() {
  const router = useRouter();
  return <SourcesPage onBack={() => router.push("/")} />;
}
