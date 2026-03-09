"use client";

type Tab = "map" | "ask" | "donate" | "sources" | "about";

interface HeaderProps {
  lastUpdated: string | null;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  eventCount: number;
  dayCount: number;
}

export default function Header({
  lastUpdated,
  activeTab,
  onTabChange,
  eventCount,
  dayCount,
}: HeaderProps) {
  return (
    <header className="flex h-12 items-center justify-between border-b border-zinc-800 bg-[#0e0e0e]/95 px-4 backdrop-blur-md">
      <div className="flex items-center gap-4">
        {/* Logo */}
        <button
          onClick={() => onTabChange("map")}
          className="flex items-center gap-1.5"
        >
          <span className="text-base font-bold tracking-tight text-zinc-100">
            WAR LIBRARY
          </span>
          <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            Live
          </span>
        </button>

        {/* Nav tabs — hidden on small mobile */}
        <nav className="hidden items-center gap-1 sm:flex">
          <NavTab
            label="Overview"
            active={activeTab === "map"}
            onClick={() => onTabChange("map")}
          />
          <NavTab
            label="Ask AI"
            active={activeTab === "ask"}
            onClick={() => onTabChange("ask")}
          />
          <NavTab
            label="Donate"
            active={activeTab === "donate"}
            onClick={() => onTabChange("donate")}
          />
          <NavTab
            label="Sources"
            active={activeTab === "sources"}
            onClick={() => onTabChange("sources")}
          />
          <NavTab
            label="About"
            active={activeTab === "about"}
            onClick={() => onTabChange("about")}
          />
        </nav>
      </div>

      <div className="flex items-center gap-3">
        {/* Summary */}
        <span className="hidden text-xs text-zinc-600 md:inline">
          Day {dayCount} · {eventCount} events
        </span>

        {lastUpdated && (
          <span className="hidden text-xs text-zinc-600 lg:inline">
            Updated {lastUpdated}
          </span>
        )}

        {/* Live indicator */}
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          <span className="text-xs text-zinc-500">Tracking</span>
        </div>
      </div>
    </header>
  );
}

function NavTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-zinc-800 text-zinc-200"
          : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
      }`}
    >
      {label}
    </button>
  );
}
