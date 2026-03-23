import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://warlibrary.midatlantic.ai";
  const now = new Date();

  // Hash fragments are not crawlable — only the base URL has SEO value.
  // Additional "pages" are client-side tabs rendered under the same URL.
  return [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 1.0,
    },
  ];
}
