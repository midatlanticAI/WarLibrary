"use client";

const SOURCE_GROUPS = [
  {
    category: "Verified Conflict Data",
    sources: [
      {
        name: "ACLED",
        description: "Armed Conflict Location & Event Data Project. Weekly verified political violence events.",
        frequency: "Weekly",
        type: "Academic / Peer-reviewed",
      },
      {
        name: "UCDP",
        description: "Uppsala Conflict Data Program. Longest-running academic conflict dataset (since 1946).",
        frequency: "Annual + updates",
        type: "Academic",
      },
      {
        name: "GDELT",
        description: "Global Database of Events, Language, and Tone. Monitors world news in 100+ languages.",
        frequency: "Every 15 minutes",
        type: "Automated / Machine-coded",
      },
    ],
  },
  {
    category: "International News Organizations",
    sources: [
      { name: "Al Jazeera", description: "Qatar-based international news network with extensive Middle East bureau.", frequency: "Continuous", type: "Journalism" },
      { name: "CNN", description: "US-based international news with dedicated Middle East desk.", frequency: "Continuous", type: "Journalism" },
      { name: "BBC", description: "British public broadcaster with Arabic-language service and regional correspondents.", frequency: "Continuous", type: "Journalism" },
      { name: "Reuters", description: "Global wire service. Primary source for breaking conflict events.", frequency: "Continuous", type: "Wire service" },
      { name: "NPR", description: "US public radio with dedicated international correspondents.", frequency: "Continuous", type: "Journalism" },
      { name: "PBS", description: "US public broadcasting with NewsHour international coverage.", frequency: "Continuous", type: "Journalism" },
    ],
  },
  {
    category: "Regional & Specialist Sources",
    sources: [
      { name: "Times of Israel", description: "Israeli English-language news with real-time conflict reporting.", frequency: "Continuous", type: "Regional journalism" },
      { name: "Washington Post", description: "US newspaper with dedicated national security and Middle East teams.", frequency: "Continuous", type: "Investigative journalism" },
      { name: "Naval News", description: "Specialist naval and maritime defense reporting.", frequency: "Event-driven", type: "Defense journalism" },
      { name: "Stars and Stripes", description: "Independent US military news source.", frequency: "Continuous", type: "Military journalism" },
      { name: "Gulf News", description: "UAE-based English-language daily covering Gulf state perspectives.", frequency: "Continuous", type: "Regional journalism" },
      { name: "The National", description: "Abu Dhabi-based English-language newspaper.", frequency: "Continuous", type: "Regional journalism" },
    ],
  },
  {
    category: "Military & Official Sources",
    sources: [
      { name: "CENTCOM", description: "US Central Command. Official statements on US military operations in the Middle East.", frequency: "Event-driven", type: "Official / Government" },
      { name: "UNIFIL", description: "United Nations Interim Force in Lebanon. Monitors southern Lebanon.", frequency: "Daily", type: "International organization" },
      { name: "SIPRI", description: "Stockholm International Peace Research Institute. Arms transfers and military expenditure data.", frequency: "Annual", type: "Research institute" },
      { name: "Fars News Agency", description: "Iranian semi-official news agency. Used for Iranian government perspective and claims.", frequency: "Continuous", type: "State-affiliated media" },
    ],
  },
  {
    category: "Analysis & Think Tanks",
    sources: [
      { name: "FDD", description: "Foundation for Defense of Democracies. Analysis of strikes and military capabilities.", frequency: "Event-driven", type: "Think tank" },
      { name: "CSIS", description: "Center for Strategic and International Studies. Missile and nuclear program tracking.", frequency: "Event-driven", type: "Think tank" },
      { name: "Critical Threats", description: "AEI project tracking Iran and Middle East military developments.", frequency: "Daily", type: "Think tank" },
      { name: "International Crisis Group", description: "Independent conflict analysis and prevention.", frequency: "Event-driven", type: "NGO" },
    ],
  },
];

interface SourcesPageProps {
  onBack: () => void;
}

export default function SourcesPage({ onBack }: SourcesPageProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#0a0a0a]">
      <div className="flex items-center gap-3 border-b border-zinc-800 p-4">
        <button
          onClick={onBack}
          className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
            />
          </svg>
        </button>
        <div>
          <h1 className="text-lg font-bold text-zinc-100">Data Sources</h1>
          <p className="text-xs text-zinc-500">
            Every data point in War Library is traceable to its source.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Methodology note */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
            <h3 className="text-sm font-semibold text-zinc-200">
              How we source and verify data
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              Events are ingested from multiple independent sources and
              cross-referenced. Each event displays its source, and where
              possible, a direct link to the original reporting. We distinguish
              between <span className="text-green-400">verified</span> events
              (confirmed by ACLED or multiple independent sources),{" "}
              <span className="text-yellow-400">reported</span> events (from a
              single reputable news organization), and{" "}
              <span className="text-zinc-400">unconfirmed</span> events (social
              media or single-source). Casualty figures are reported numbers and
              may be revised.
            </p>
          </div>

          {/* Source groups */}
          {SOURCE_GROUPS.map((group) => (
            <div key={group.category}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                {group.category}
              </h2>
              <div className="space-y-1">
                {group.sources.map((source) => (
                  <div
                    key={source.name}
                    className="rounded-lg border border-zinc-800/50 bg-zinc-900/30 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-zinc-200">
                        {source.name}
                      </span>
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">
                        {source.frequency}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      {source.description}
                    </p>
                    <span className="mt-1 inline-block text-[10px] text-zinc-600">
                      {source.type}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
