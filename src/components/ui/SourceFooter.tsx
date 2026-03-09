"use client";

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
  return (
    <footer className="flex items-center justify-between border-t border-zinc-800 bg-[#0e0e0e] px-4 py-1.5">
      <div className="min-w-0 flex-1 overflow-hidden">
        <span className="text-[10px] text-zinc-600">
          Sources:{" "}
          <span className="text-zinc-500">
            {SOURCES.join(" · ")}
          </span>
        </span>
      </div>
      <div className="flex flex-shrink-0 items-center gap-3">
        {lastUpdated && (
          <span className="text-[10px] text-zinc-600">
            Updated: {lastUpdated}
          </span>
        )}
        <button
          onClick={onSourcesClick}
          className="text-[10px] text-zinc-500 hover:text-zinc-300"
        >
          Data Sources
        </button>
        <button
          onClick={onAboutClick}
          className="text-[10px] text-zinc-500 hover:text-zinc-300"
        >
          About
        </button>
      </div>
    </footer>
  );
}
