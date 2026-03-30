"use client";

import { useMemo } from "react";
import type { ConflictEvent } from "@/types";
import { useI18n } from "@/i18n";

const EVENT_TYPE_CONFIG: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  airstrike: { label: "Airstrike", color: "#ef4444", icon: "💥" },
  missile_attack: { label: "Missile Attack", color: "#f97316", icon: "🚀" },
  drone_attack: { label: "Drone Attack", color: "#eab308", icon: "✈️" },
  battle: { label: "Battle / Clash", color: "#dc2626", icon: "⚔️" },
  explosion: { label: "Explosion", color: "#f59e0b", icon: "💣" },
  violence_against_civilians: {
    label: "Civilian Casualties",
    color: "#a855f7",
    icon: "🔴",
  },
  strategic_development: {
    label: "Strategic Development",
    color: "#3b82f6",
    icon: "📍",
  },
  protest: { label: "Protest / Unrest", color: "#22c55e", icon: "✊" },
};

interface MapLegendProps {
  events: ConflictEvent[];
  hiddenTypes: Set<string>;
  onToggleType: (type: string) => void;
  hiddenCountries: Set<string>;
  onToggleCountry: (country: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export default function MapLegend({
  events,
  hiddenTypes,
  onToggleType,
  hiddenCountries,
  onToggleCountry,
  isOpen,
  onToggle,
}: MapLegendProps) {
  const { t } = useI18n();
  const { typeCounts, countryCounts } = useMemo(() => {
    const types: Record<string, number> = {};
    const countries: Record<string, number> = {};
    for (const e of events) {
      types[e.event_type] = (types[e.event_type] || 0) + 1;
      countries[e.country] = (countries[e.country] || 0) + 1;
    }
    return {
      typeCounts: Object.entries(types).sort((a, b) => b[1] - a[1]),
      countryCounts: Object.entries(countries).sort((a, b) => b[1] - a[1]),
    };
  }, [events]);

  return (
    <div className="absolute right-3 top-3 z-10">
      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="min-h-[44px] min-w-[44px] rounded-lg bg-black/80 px-3 py-2 text-xs font-medium text-zinc-300 backdrop-blur-sm transition-colors hover:bg-black/90 focus:outline-none focus:ring-2 focus:ring-zinc-500"
        aria-expanded={isOpen}
        aria-label={isOpen ? "Hide legend and filters" : "Show legend and filters"}
      >
        {isOpen ? t("map.hide") : t("map.legendFilters")}
      </button>

      {isOpen && (
        <div className="mt-2 max-h-[60vh] w-56 overflow-y-auto rounded-lg border border-zinc-800 bg-black/90 p-3 backdrop-blur-md">
          {/* Event types */}
          <div className="mb-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              {t("map.eventType")}
            </div>
            <div className="space-y-0.5">
              {typeCounts.map(([type, count]) => {
                const config = EVENT_TYPE_CONFIG[type];
                if (!config) return null;
                const hidden = hiddenTypes.has(type);
                return (
                  <button
                    key={type}
                    onClick={() => onToggleType(type)}
                    className={`flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-left transition-opacity ${
                      hidden ? "opacity-30" : "opacity-100"
                    } hover:bg-zinc-800/50 focus:outline-none focus:ring-1 focus:ring-zinc-600`}
                    aria-pressed={!hidden}
                    aria-label={`${hidden ? "Show" : "Hide"} ${t(`eventTypes.${type}`)}`}
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: config.color }}
                    />
                    <span className="flex-1 text-xs text-zinc-300">
                      {t(`eventTypes.${type}`)}
                    </span>
                    <span className="text-[10px] text-zinc-500">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Countries */}
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              {t("map.country")}
            </div>
            <div className="max-h-40 space-y-0.5 overflow-y-auto">
              {countryCounts.map(([country, count]) => {
                const hidden = hiddenCountries.has(country);
                return (
                  <button
                    key={country}
                    onClick={() => onToggleCountry(country)}
                    className={`flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-left transition-opacity ${
                      hidden ? "opacity-30" : "opacity-100"
                    } hover:bg-zinc-800/50 focus:outline-none focus:ring-1 focus:ring-zinc-600`}
                    aria-pressed={!hidden}
                    aria-label={`${hidden ? "Show" : "Hide"} ${country}`}
                  >
                    <span className="flex-1 text-xs text-zinc-300">
                      {country}
                    </span>
                    <span className="text-[10px] text-zinc-500">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick actions */}
          <div className="mt-2 flex gap-1 border-t border-zinc-800 pt-2">
            <button
              onClick={() => {
                // Show all
                hiddenTypes.forEach((t) => onToggleType(t));
                hiddenCountries.forEach((c) => onToggleCountry(c));
              }}
              className="flex-1 rounded bg-zinc-800 py-1 text-[10px] text-zinc-400 hover:bg-zinc-700"
            >
              {t("map.showAll")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
