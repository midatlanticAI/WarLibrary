"use client";

import { useRouter } from "next/navigation";
import DonationPanel from "@/components/ui/DonationPanel";

export default function SupportClient() {
  const router = useRouter();
  return <DonationPanel onBack={() => router.push("/")} />;
}
