"use client";

import { useI18n } from "@/i18n";

// Outlet names are proper nouns — they read the same in every locale, so the
// list itself is data rather than copy.
const SOURCES = [
  "ACLED",
  "GDELT",
  "Al Jazeera",
  "CNN",
  "BBC",
  "Reuters",
  "NPR",
  "PBS",
  "Times of Israel",
  "Washington Post",
  "Naval News",
  "Stars and Stripes",
  "Gulf News",
  "CENTCOM",
  "UNIFIL",
  "SIPRI",
];

interface SourceFooterProps {
  lastUpdated: string | null;
  onSourcesClick: () => void;
  onAboutClick: () => void;
}

export default function SourceFooter({
  lastUpdated,
  onSourcesClick,
  onAboutClick,
}: SourceFooterProps) {
  const { t } = useI18n();

  return (
    <footer className="flex items-center justify-between border-t border-zinc-800 bg-[#0e0e0e] px-4 py-1.5">
      <div className="min-w-0 flex-1 overflow-hidden">
        <span className="text-[10px] text-zinc-600">
          {t("footer.sourcesLabel")}{" "}
          <span className="text-zinc-500">
            {SOURCES.join(" · ")}
          </span>
        </span>
      </div>
      <div className="flex flex-shrink-0 items-center gap-3">
        {lastUpdated && (
          <span className="text-[10px] text-zinc-600">
            {/* Interpolated rather than concatenated — the label does not
                always precede the timestamp outside English. */}
            {t("footer.updated", { time: lastUpdated })}
          </span>
        )}
        <button
          onClick={onSourcesClick}
          className="text-[10px] text-zinc-500 hover:text-zinc-300"
        >
          {t("sources.title")}
        </button>
        <button
          onClick={onAboutClick}
          className="text-[10px] text-zinc-500 hover:text-zinc-300"
        >
          {t("nav.about")}
        </button>
      </div>
    </footer>
  );
}
