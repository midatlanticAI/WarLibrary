import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "War Library Admin",
  description: "Admin dashboard for War Library conflict tracker.",
  robots: { index: false, follow: false },
  other: { "theme-color": "#8b0000" },
  manifest: "/admin/manifest.webmanifest",
  icons: {
    icon: "/icons/admin-icon-192.png",
    apple: "/icons/admin-icon-192.png",
  },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
