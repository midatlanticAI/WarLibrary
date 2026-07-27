"use client";

import { useI18n } from "@/i18n";

/**
 * A source entry holds keys, not copy. Only `name` is literal — outlet names
 * are proper nouns and stay as printed on the masthead in every locale; the
 * description, cadence and type are prose and go through t().
 */
interface SourceEntry {
  name: string;
  descKey: string;
  freqKey: string;
  typeKey: string;
}

interface SourceGroup {
  categoryKey: string;
  sources: SourceEntry[];
}

const SOURCE_GROUPS: SourceGroup[] = [
  {
    categoryKey: "sources.catAcademic",
    sources: [
      {
        name: "ACLED",
        descKey: "sources.desc.acled",
        freqKey: "sources.freq.weekly",
        typeKey: "sources.type.academicPeerReviewed",
      },
      {
        name: "UCDP",
        descKey: "sources.desc.ucdp",
        freqKey: "sources.freq.annualPlusUpdates",
        typeKey: "sources.type.academic",
      },
      {
        name: "GDELT",
        descKey: "sources.desc.gdelt",
        freqKey: "sources.freq.every15Min",
        typeKey: "sources.type.automated",
      },
    ],
  },
  {
    categoryKey: "sources.catNews",
    sources: [
      { name: "Al Jazeera", descKey: "sources.desc.alJazeera", freqKey: "sources.freq.continuous", typeKey: "sources.type.journalism" },
      { name: "CNN", descKey: "sources.desc.cnn", freqKey: "sources.freq.continuous", typeKey: "sources.type.journalism" },
      { name: "BBC", descKey: "sources.desc.bbc", freqKey: "sources.freq.continuous", typeKey: "sources.type.journalism" },
      { name: "Reuters", descKey: "sources.desc.reuters", freqKey: "sources.freq.continuous", typeKey: "sources.type.wireService" },
      { name: "NPR", descKey: "sources.desc.npr", freqKey: "sources.freq.continuous", typeKey: "sources.type.journalism" },
      { name: "PBS", descKey: "sources.desc.pbs", freqKey: "sources.freq.continuous", typeKey: "sources.type.journalism" },
    ],
  },
  {
    categoryKey: "sources.catRegional",
    sources: [
      { name: "Times of Israel", descKey: "sources.desc.timesOfIsrael", freqKey: "sources.freq.continuous", typeKey: "sources.type.regionalJournalism" },
      { name: "Washington Post", descKey: "sources.desc.washingtonPost", freqKey: "sources.freq.continuous", typeKey: "sources.type.investigativeJournalism" },
      { name: "Naval News", descKey: "sources.desc.navalNews", freqKey: "sources.freq.eventDriven", typeKey: "sources.type.defenseJournalism" },
      { name: "Stars and Stripes", descKey: "sources.desc.starsAndStripes", freqKey: "sources.freq.continuous", typeKey: "sources.type.militaryJournalism" },
      { name: "Gulf News", descKey: "sources.desc.gulfNews", freqKey: "sources.freq.continuous", typeKey: "sources.type.regionalJournalism" },
      { name: "The National", descKey: "sources.desc.theNational", freqKey: "sources.freq.continuous", typeKey: "sources.type.regionalJournalism" },
    ],
  },
  {
    categoryKey: "sources.catMilitary",
    sources: [
      { name: "CENTCOM", descKey: "sources.desc.centcom", freqKey: "sources.freq.eventDriven", typeKey: "sources.type.official" },
      { name: "UNIFIL", descKey: "sources.desc.unifil", freqKey: "sources.freq.daily", typeKey: "sources.type.internationalOrg" },
      { name: "SIPRI", descKey: "sources.desc.sipri", freqKey: "sources.freq.annual", typeKey: "sources.type.researchInstitute" },
      { name: "Fars News Agency", descKey: "sources.desc.farsNews", freqKey: "sources.freq.continuous", typeKey: "sources.type.stateAffiliated" },
    ],
  },
  {
    categoryKey: "sources.catThinkTank",
    sources: [
      { name: "FDD", descKey: "sources.desc.fdd", freqKey: "sources.freq.eventDriven", typeKey: "sources.type.thinkTank" },
      { name: "CSIS", descKey: "sources.desc.csis", freqKey: "sources.freq.eventDriven", typeKey: "sources.type.thinkTank" },
      { name: "Critical Threats", descKey: "sources.desc.criticalThreats", freqKey: "sources.freq.daily", typeKey: "sources.type.thinkTank" },
      { name: "International Crisis Group", descKey: "sources.desc.crisisGroup", freqKey: "sources.freq.eventDriven", typeKey: "sources.type.ngo" },
    ],
  },
];

interface SourcesPageProps {
  onBack: () => void;
}

export default function SourcesPage({ onBack }: SourcesPageProps) {
  const { t } = useI18n();

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
          <h1 className="text-lg font-bold text-zinc-100">{t("sources.title")}</h1>
          <p className="text-xs text-zinc-500">
            {t("sources.subtitle")}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Methodology note */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
            <h3 className="text-sm font-semibold text-zinc-200">
              {t("sources.howWeSource")}
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              {t("sources.methodology")}{" "}
              <span className="text-green-400">{t("sources.verified")}</span>{" "}
              {t("sources.verifiedDesc")}{" "}
              <span className="text-yellow-400">{t("sources.reported")}</span>{" "}
              {t("sources.reportedDesc")}{" "}
              <span className="text-zinc-400">{t("sources.unconfirmed")}</span>{" "}
              {t("sources.unconfirmedDesc")}
            </p>
          </div>

          {/* Source groups */}
          {SOURCE_GROUPS.map((group) => (
            <div key={group.categoryKey}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                {t(group.categoryKey)}
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
                        {t(source.freqKey)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      {t(source.descKey)}
                    </p>
                    <span className="mt-1 inline-block text-[10px] text-zinc-600">
                      {t(source.typeKey)}
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
