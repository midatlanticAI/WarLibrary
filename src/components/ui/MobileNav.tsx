"use client";

type MobileTab = "map" | "feed" | "ask" | "donate" | "sources" | "about";

interface MobileNavProps {
  active: MobileTab;
  onChange: (tab: MobileTab) => void;
  newEventCount?: number;
}

export default function MobileNav({
  active,
  onChange,
  newEventCount,
}: MobileNavProps) {
  return (
    <nav className="flex border-t border-zinc-800 bg-[#0e0e0e] sm:hidden">
      <TabButton
        label="Map"
        icon={
          <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M8.157 2.175a1.5 1.5 0 00-1.147 0l-4.084 1.69A1.5 1.5 0 002 5.251v10.877a.75.75 0 001.009.704l3.9-1.462 4.125 1.588a1.5 1.5 0 001.072-.013l4.051-1.684A1.5 1.5 0 0017 13.88V3.09a.75.75 0 00-1.003-.708l-3.895 1.38-4.126-1.588z"
            />
          </svg>
        }
        active={active === "map"}
        onClick={() => onChange("map")}
      />
      <TabButton
        label="Feed"
        icon={
          <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M2 3.5A1.5 1.5 0 013.5 2h9A1.5 1.5 0 0114 3.5v11.75A2.75 2.75 0 0016.75 18h-12A2.75 2.75 0 012 15.25V3.5zm3.75 7a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-4.5zm0 3a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-4.5zM5 5.75A.75.75 0 015.75 5h4.5a.75.75 0 01.75.75v2.5a.75.75 0 01-.75.75h-4.5A.75.75 0 015 8.25v-2.5z"
            />
          </svg>
        }
        active={active === "feed"}
        onClick={() => onChange("feed")}
        badge={newEventCount}
      />
      <TabButton
        label="Ask"
        icon={
          <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zm-5 0H8v2h2V9z"
            />
          </svg>
        }
        active={active === "ask"}
        onClick={() => onChange("ask")}
      />
      <TabButton
        label="Donate"
        icon={
          <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"
              clipRule="evenodd"
            />
          </svg>
        }
        active={active === "donate"}
        onClick={() => onChange("donate")}
      />
      <TabButton
        label="Sources"
        icon={
          <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
            <path d="M7 3.5A1.5 1.5 0 018.5 2h3A1.5 1.5 0 0113 3.5v.206l3.243 2.834A2.5 2.5 0 0117 8.282V15.5a2.5 2.5 0 01-2.5 2.5h-9A2.5 2.5 0 013 15.5V8.282a2.5 2.5 0 01.757-1.742L7 3.706V3.5z" />
          </svg>
        }
        active={active === "sources"}
        onClick={() => onChange("sources")}
      />
      <TabButton
        label="About"
        icon={
          <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
            />
          </svg>
        }
        active={active === "about"}
        onClick={() => onChange("about")}
      />
    </nav>
  );
}

function TabButton({
  label,
  icon,
  active,
  onClick,
  badge,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 transition-colors ${
        active ? "text-zinc-100" : "text-zinc-600"
      }`}
    >
      {icon}
      <span className="text-[10px]">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="absolute right-1/4 top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}
