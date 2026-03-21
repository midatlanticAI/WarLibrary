"use client";

/**
 * DonationPanel — Humanitarian Aid & Human Cost
 *
 * All donation URLs verified via web search on 2026-03-08.
 * Humanitarian data verified from authoritative sources as of mid-March 2026.
 * War Library does NOT collect or process donations.
 */

import { useState } from "react";

/* ─── Icons (inline SVGs to avoid deps) ─── */

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

function SourceTag({ text }: { text: string }) {
  return (
    <span className="inline-block rounded bg-zinc-800/60 px-1.5 py-0.5 text-[9px] text-zinc-500">
      {text}
    </span>
  );
}

/* ─── Types ─── */

interface Organisation {
  name: string;
  abbr: string;
  donateUrl: string;
  website: string;
  mission: string;
  activeStatus: string;
  currentResponse: string;
  verification: string;
  charityNavigator: string;
  ein: string;
}

/* ─── Organisation Data ─── */

const ORGANISATIONS: Organisation[] = [
  {
    name: "International Committee of the Red Cross",
    abbr: "ICRC",
    donateUrl: "https://www.icrc.org/en/donate",
    website: "https://www.icrc.org",
    mission:
      "The ICRC is an impartial, neutral and independent organization whose exclusively humanitarian mission is to protect the lives and dignity of victims of armed conflict and other situations of violence.",
    activeStatus:
      "Operating on the ground in Iran, Israel, Lebanon and across the Gulf region. Delivered 170+ tons of humanitarian supplies. Working with the Iranian Red Crescent Society to provide medical services, search and rescue, and essential aid to displaced populations.",
    currentResponse:
      "Delivering 170+ tons of humanitarian supplies across the region. Coordinating with Iranian Red Crescent for medical services, search and rescue, and essential aid to displaced populations in Iran.",
    verification: "International humanitarian organization · 501(c)(3) in the US",
    charityNavigator: "3/4 Stars",
    ein: "98-6001029",
  },
  {
    name: "UNHCR — UN Refugee Agency",
    abbr: "UNHCR",
    donateUrl: "https://donate.unhcr.org/int/en/general",
    website: "https://www.unhcr.org",
    mission:
      "UNHCR leads international action to protect people forced to flee their homes because of conflict and persecution. It delivers life-saving assistance, safeguards fundamental human rights, and helps people find a safe place to call home.",
    activeStatus:
      "Mobilizing across the Middle East as over 4 million people have been forcibly displaced. Present in Iran since 1984 — the largest UN agency there — with offices in Tehran and five field locations, currently assisting displaced populations.",
    currentResponse:
      "Managing the displacement of up to 3.2 million people inside Iran. Operating logistics hub in Termez, Uzbekistan. Coordinating regional response for 4+ million displaced across the Middle East.",
    verification: "United Nations agency · US arm (USA for UNHCR) is a 501(c)(3)",
    charityNavigator: "3/4 Stars (USA for UNHCR)",
    ein: "52-1662800",
  },
  {
    name: "Médecins Sans Frontières / Doctors Without Borders",
    abbr: "MSF",
    donateUrl: "https://www.msf.org/donate",
    website: "https://www.msf.org",
    mission:
      "MSF provides independent, impartial medical humanitarian assistance to people affected by conflict, epidemics, disasters, or exclusion from health care in over 75 countries.",
    activeStatus:
      "Adapting and scaling up activities amid escalating Middle East conflict. Teams in Lebanon responding to emerging needs of displaced people. Providing emergency medical care, surgical services, and mental health support across the region.",
    currentResponse:
      "Scaling up emergency medical care and surgical services across the region. Teams in Lebanon responding to needs of displaced people. Providing mental health support to conflict-affected populations.",
    verification: "International NGO · US arm is a 501(c)(3)",
    charityNavigator: "4/4 Stars · 97/100 Score",
    ein: "13-3433452",
  },
  {
    name: "UNICEF — United Nations Children's Fund",
    abbr: "UNICEF",
    donateUrl: "https://help.unicef.org/en",
    website: "https://www.unicef.org",
    mission:
      "UNICEF works in over 190 countries and territories to save children's lives, defend their rights, and help them fulfill their potential — from early childhood through adolescence.",
    activeStatus:
      "Mobilizing emergency supplies to families across the Middle East. Reported 1,100+ children killed or injured across the region. Providing emergency education, water and sanitation, and child protection services in affected areas.",
    currentResponse:
      "Monitoring child casualties across the region (1,100+ killed or injured). Calling for protection of schools and children. Providing emergency education, water, sanitation, and child protection in Iran and Lebanon.",
    verification: "United Nations agency · US arm (UNICEF USA) is a 501(c)(3)",
    charityNavigator: "4/4 Stars (UNICEF USA)",
    ein: "13-1760110",
  },
  {
    name: "International Rescue Committee",
    abbr: "IRC",
    donateUrl: "https://help.rescue.org/donate",
    website: "https://www.rescue.org",
    mission:
      "The IRC responds to the world's worst humanitarian crises, helping people whose lives and livelihoods are shattered by conflict and disaster to survive, recover, and regain control of their future.",
    activeStatus:
      "Responding to displacement across the Middle East. Providing emergency relief, cash assistance, and protection services. Tracking 1 million displaced in Lebanon. Estimates war cost at ~$2 billion/day.",
    currentResponse:
      "Operating in Lebanon, tracking 1 million+ displaced. Providing emergency relief, cash assistance, and protection services. Reporting ~140,000 people crossing from Lebanon into Syria. 87 cents of every dollar goes directly to aid.",
    verification: "501(c)(3) · Candid Platinum Seal of Transparency",
    charityNavigator: "4/4 Stars · 96/100 Score",
    ein: "13-5660870",
  },
  {
    name: "Direct Relief",
    abbr: "Direct Relief",
    donateUrl: "https://www.directrelief.org/donate",
    website: "https://www.directrelief.org",
    mission:
      "Direct Relief improves the health and lives of people affected by poverty and emergencies — without regard to politics, religion, or ability to pay — by providing essential medical resources to locally-run health facilities.",
    activeStatus:
      "Delivering vital medical supplies to health facilities in conflict-affected areas. Coordinating with local health providers in the Middle East to replenish depleted medical stocks and provide emergency pharmaceuticals.",
    currentResponse:
      "Delivering vital medical supplies to health facilities across the conflict zone. Coordinating with local providers to replenish depleted medical stocks and provide emergency pharmaceuticals where 25+ hospitals have been damaged.",
    verification: "501(c)(3) · 100% Charity Navigator Impact Rating",
    charityNavigator: "4/4 Stars · 100/100 Score",
    ein: "95-1831116",
  },
  {
    name: "World Food Programme",
    abbr: "WFP",
    donateUrl: "https://wfpusa.org/give/",
    website: "https://www.wfp.org",
    mission:
      "WFP is the world's largest humanitarian organization, saving lives in emergencies and using food assistance to build a pathway to peace, stability, and prosperity for people recovering from conflict, disasters, and the impact of climate change.",
    activeStatus:
      "Activated contingency plans in Lebanon to support displaced people. Served 500,000+ hot meals since March 2. Reached 230,000 people in first two weeks. Estimates 45 million more people globally at risk of acute hunger due to Hormuz disruption.",
    currentResponse:
      "Served 500,000+ hot meals in Lebanon since March 2. Reached 230,000 people in first two weeks. Establishing emergency cash safety net. Warning that 45 million more people face acute hunger globally due to Strait of Hormuz disruption.",
    verification: "United Nations agency · US arm (WFP USA) is a 501(c)(3)",
    charityNavigator: "4/4 Stars (WFP USA)",
    ein: "13-3843435",
  },
  {
    name: "Save the Children",
    abbr: "Save the Children",
    donateUrl: "https://www.savethechildren.org/savekids",
    website: "https://www.savethechildren.org",
    mission:
      "Save the Children believes every child deserves a future. In the United States and around the world, it gives children a healthy start in life, the opportunity to learn, and protection from harm.",
    activeStatus:
      "Providing emergency assistance to children and families affected by the conflict across the Middle East. 84% of every dollar goes directly to the organization's mission. Delivering child protection, education in emergencies, and life-saving supplies.",
    currentResponse:
      "Delivering child protection, education in emergencies, and life-saving supplies across the region. 84% of every dollar goes directly to mission. Responding to needs of 200,000+ displaced children in Lebanon.",
    verification: "501(c)(3)",
    charityNavigator: "4/4 Stars",
    ein: "06-0726487",
  },
];

/* ─── Source Data ─── */

const SOURCES = [
  { org: "UNHCR", desc: "Iran displacement figures — up to 3.2 million internally displaced", date: "March 12, 2026" },
  { org: "CARE", desc: "Lebanon displacement — 1 million+ displaced", date: "March 17, 2026" },
  { org: "IRC", desc: "Lebanon-to-Syria border crossings — ~140,000; war cost estimate ~$2B/day", date: "March 19, 2026" },
  { org: "Iran Ministry of Health", desc: "Iran casualties — 1,444 killed, 18,551 injured (government figures)", date: "Mid-March 2026" },
  { org: "Hengaw Human Rights Org", desc: "Iran casualties — 5,300 killed (511 civilian, 4,789 military); 160+ women killed", date: "March 17, 2026" },
  { org: "UNICEF", desc: "Regional child casualties — 1,100+ killed or injured; 200+ children killed in Iran; 91 in Lebanon; 4 in Israel; 1 in Kuwait", date: "March 11, 2026" },
  { org: "Lebanon Health Ministry", desc: "Lebanon casualties — 900+ killed, 2,200+ injured", date: "Mid-March 2026" },
  { org: "Alma Research Center", desc: "Israel casualties — 18 civilians killed, 4,002+ injured", date: "March 20, 2026" },
  { org: "US CENTCOM", desc: "US military casualties — 13 killed (7 by enemy fire), ~200 wounded; 7,000+ strikes on Iran; 19 ships + 1 submarine destroyed", date: "Mid-March 2026" },
  { org: "Iranian Red Crescent Society", desc: "Infrastructure damage — 65+ schools, 32+ medical facilities, 10,000+ residential units, 20,000+ civilian sites", date: "Mid-March 2026" },
  { org: "Iranian Health Officials (via NPR)", desc: "Hospitals — 25 damaged, 9 out of service", date: "Mid-March 2026" },
  { org: "UNESCO", desc: "World Heritage sites damaged — Golestan Palace, Naqsh-e Jahan Square, Chehel Sotoun, Ali Qapu, Shah Mosque, Falak-ol-Aflak", date: "Mid-March 2026" },
  { org: "NetBlocks", desc: "Iran internet shutdown — 4% connectivity, 92M+ affected", date: "Mid-March 2026" },
  { org: "WFP", desc: "Food security — 500,000+ hot meals in Lebanon; 230,000 reached; 45M more people at risk of hunger globally; shipping costs up 18%", date: "March 12–18, 2026" },
  { org: "Mercy Corps", desc: "200,000+ children among Lebanon's displaced", date: "Mid-March 2026" },
  { org: "Iraqi Health Authorities", desc: "Iraq casualties — 61+ killed", date: "Mid-March 2026" },
  { org: "Various State Media (via NPR, AJ)", desc: "Gulf States casualties — UAE, Kuwait, Saudi Arabia, Bahrain, Oman combined 16+", date: "Mid-March 2026" },
  { org: "Jordanian Authorities", desc: "Jordan — 0 killed, 28 injured", date: "Mid-March 2026" },
  { org: "French Ministry of Defence", desc: "1 French service member killed in Iraq", date: "Mid-March 2026" },
  { org: "TIME", desc: "US military wounded breakdown — 180+ returned to duty", date: "March 17, 2026" },
  { org: "Common Dreams / Iranian Red Crescent", desc: "Civilian building damage — 10,000+ residential units, 20,000+ civilian sites", date: "Mid-March 2026" },
  { org: "OHCHR", desc: "Regional human rights monitoring and civilian protection reporting", date: "Ongoing" },
  { org: "Al Jazeera", desc: "Conflict tracker and casualty monitoring", date: "Ongoing" },
  { org: "CFR (Council on Foreign Relations)", desc: "Conflict background and analysis", date: "Ongoing" },
];

/* ─── Collapsible Section Component ─── */

function CollapsibleSection({
  title,
  icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-zinc-800/50 bg-zinc-900/30">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-semibold text-zinc-200">{title}</span>
        </div>
        <ChevronDown open={open} />
      </button>
      {open && <div className="border-t border-zinc-800/50 p-4 pt-3">{children}</div>}
    </div>
  );
}

/* ─── Stat Line (for country breakdowns) ─── */

function StatLine({
  label,
  value,
  source,
}: {
  label: string;
  value: string;
  source: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1">
      <span className="text-xs text-zinc-400">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-semibold text-zinc-200">{value}</span>
        <SourceTag text={source} />
      </div>
    </div>
  );
}

/* ─── Main Component ─── */

interface DonationPanelProps {
  onBack: () => void;
}

export default function DonationPanel({ onBack }: DonationPanelProps) {
  const [showSources, setShowSources] = useState(false);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#0a0a0a]">
      {/* Header */}
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
          <h1 className="text-lg font-bold text-zinc-100">Humanitarian Aid</h1>
          <p className="text-xs text-zinc-500">
            Human cost of the conflict · Verified organizations
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Disclaimer */}
          <div className="rounded-lg border border-red-500/30 bg-red-950/20 p-4">
            <div className="flex items-start gap-2">
              <svg
                className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                />
              </svg>
              <p className="text-xs leading-relaxed text-red-300/90">
                <span className="font-semibold text-red-300">
                  War Library does not collect or process donations.
                </span>{" "}
                All links go directly to each organization&apos;s official donation
                page. We receive no commission, referral fees, or financial
                benefit of any kind. Verify the URL in your browser before
                submitting payment information.
              </p>
            </div>
          </div>

          {/* ───────────────────────────────────────────────────── */}
          {/* SECTION 1: Human Cost Summary                        */}
          {/* ───────────────────────────────────────────────────── */}

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
            <h2 className="text-sm font-semibold text-zinc-200">
              Human Cost — March 2026
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              Following the escalation of hostilities on February 28, 2026,
              the humanitarian situation across the Middle East has deteriorated
              rapidly. Armed attacks involving airstrikes on Iran, retaliatory
              strikes on Israel and Arab Gulf states, and regional military
              operations have created an acute, multi-country crisis.
            </p>

            {/* 6-card stat grid */}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                {
                  value: "3.2M+",
                  label: "Displaced in Iran",
                  source: "UNHCR, March 12",
                },
                {
                  value: "1M+",
                  label: "Displaced in Lebanon",
                  source: "CARE, March 17",
                },
                {
                  value: "1,444+",
                  label: "Killed in Iran*",
                  source: "Iran Min. of Health",
                },
                {
                  value: "900+",
                  label: "Killed in Lebanon",
                  source: "Lebanon Health Min.",
                },
                {
                  value: "200+",
                  label: "Children killed (Iran)",
                  source: "UNICEF, March 11",
                },
                {
                  value: "1,100+",
                  label: "Children killed/injured (region)",
                  source: "UNICEF, March 11",
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-md border border-zinc-800 bg-zinc-900/60 p-2.5 text-center"
                >
                  <div className="text-base font-bold text-red-400">
                    {stat.value}
                  </div>
                  <div className="mt-0.5 text-[10px] leading-tight text-zinc-400">
                    {stat.label}
                  </div>
                  <div className="mt-1">
                    <SourceTag text={stat.source} />
                  </div>
                </div>
              ))}
            </div>

            {/* Iran casualty discrepancy note */}
            <div className="mt-3 rounded-md border border-amber-900/40 bg-amber-950/20 p-2.5">
              <p className="text-[11px] leading-relaxed text-amber-300/80">
                <span className="font-semibold text-amber-300">* Casualty figures vary by source.</span>{" "}
                The Iranian government reports 1,444 killed and 18,551 injured.
                Independent monitor Hengaw reports 5,300 killed (511 civilian,
                4,789 military) as of March 17. Both figures are presented; the
                discrepancy reflects differing methodologies and access.
              </p>
            </div>

            <p className="mt-3 text-[10px] italic text-zinc-600">
              Figures are from official and independent sources as cited. Numbers
              are preliminary and expected to change as the conflict continues.
              Last verified: mid-March 2026.
            </p>
          </div>

          {/* ───────────────────────────────────────────────────── */}
          {/* SECTION 2: Country-by-Country Breakdown               */}
          {/* ───────────────────────────────────────────────────── */}

          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Country-by-Country Breakdown
            </h2>
            <div className="space-y-2">
              {/* IRAN */}
              <CollapsibleSection
                title="Iran"
                defaultOpen
                icon={<span className="text-xs">🇮🇷</span>}
              >
                <div className="space-y-0.5 divide-y divide-zinc-800/30">
                  <StatLine label="Killed (govt figure)" value="1,444" source="Iran Min. of Health" />
                  <StatLine label="Injured (govt figure)" value="18,551" source="Iran Min. of Health" />
                  <StatLine label="Killed (independent)" value="5,300 total" source="Hengaw, March 17" />
                  <StatLine label="  — Civilian" value="511" source="Hengaw" />
                  <StatLine label="  — Military" value="4,789" source="Hengaw" />
                  <StatLine label="Women killed" value="160+" source="Hengaw, March 17" />
                  <StatLine label="Children killed" value="200+" source="UNICEF, March 11" />
                  <StatLine label="Children killed in schools" value="~180" source="UNICEF, March 5" />
                  <StatLine label="Internally displaced" value="Up to 3.2M" source="UNHCR, March 12" />
                </div>
                <div className="mt-3 border-t border-zinc-800/30 pt-3">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Infrastructure
                  </p>
                  <div className="space-y-0.5 divide-y divide-zinc-800/30">
                    <StatLine label="Hospitals damaged" value="25 (9 out of service)" source="Iranian health officials via NPR" />
                    <StatLine label="Medical facilities targeted" value="32+" source="Iranian Red Crescent" />
                    <StatLine label="Schools damaged" value="65+" source="Iranian Red Crescent" />
                    <StatLine label="Residential units damaged" value="10,000+" source="Iranian Red Crescent via Common Dreams" />
                    <StatLine label="Civilian sites damaged" value="20,000+" source="Iranian Red Crescent via Common Dreams" />
                    <StatLine label="UNESCO Heritage sites" value="6 damaged" source="UNESCO" />
                    <StatLine label="Internet connectivity" value="4% (92M+ affected)" source="NetBlocks" />
                  </div>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
                  UNESCO World Heritage sites damaged include Golestan Palace,
                  Naqsh-e Jahan Square, Chehel Sotoun, Ali Qapu, Shah Mosque,
                  and Falak-ol-Aflak Castle.
                </p>
              </CollapsibleSection>

              {/* LEBANON */}
              <CollapsibleSection
                title="Lebanon"
                icon={<span className="text-xs">🇱🇧</span>}
              >
                <div className="space-y-0.5 divide-y divide-zinc-800/30">
                  <StatLine label="Killed" value="900+" source="Lebanon Health Min." />
                  <StatLine label="Injured" value="2,200+" source="Lebanon Health Min." />
                  <StatLine label="Children killed" value="91" source="UNICEF, March 11" />
                  <StatLine label="Displaced" value="1M+" source="CARE, March 17" />
                  <StatLine label="Children displaced" value="200,000+" source="Mercy Corps" />
                  <StatLine label="Fled to Syria" value="~140,000" source="IRC, March 19" />
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
                  Shelters at capacity across the country. Syrian refugees are
                  fleeing back into Syria — a reversal of a decade of displacement.
                  WFP has reached 230,000 people and served 500,000+ hot meals
                  since March 2.
                </p>
              </CollapsibleSection>

              {/* ISRAEL */}
              <CollapsibleSection
                title="Israel"
                icon={<span className="text-xs">🇮🇱</span>}
              >
                <div className="space-y-0.5 divide-y divide-zinc-800/30">
                  <StatLine label="Civilians killed" value="18" source="Alma Research Center, March 20" />
                  <StatLine label="Injured" value="4,002+" source="Alma Research Center, March 20" />
                  <StatLine label="Children killed" value="4" source="UNICEF, March 11" />
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
                  300+ Iranian attack waves reported. State of emergency declared.
                </p>
              </CollapsibleSection>

              {/* US MILITARY */}
              <CollapsibleSection
                title="United States (Military)"
                icon={<span className="text-xs">🇺🇸</span>}
              >
                <div className="space-y-0.5 divide-y divide-zinc-800/30">
                  <StatLine label="Service members killed" value="13" source="US CENTCOM" />
                  <StatLine label="  — By enemy fire" value="7" source="US CENTCOM" />
                  <StatLine label="Service members wounded" value="~200" source="US CENTCOM via TIME, March 17" />
                  <StatLine label="  — Returned to duty" value="180+" source="TIME, March 17" />
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
                  US bases attacked across 4+ countries. CENTCOM reports 7,000+
                  strikes on Iranian targets, 19 ships and 1 submarine destroyed.
                </p>
              </CollapsibleSection>

              {/* GULF STATES & OTHER */}
              <CollapsibleSection
                title="Gulf States, Iraq & Other"
                icon={<span className="text-xs">🌍</span>}
              >
                <div className="space-y-0.5 divide-y divide-zinc-800/30">
                  <StatLine label="Iraq — killed" value="61+" source="Iraqi health authorities" />
                  <StatLine label="Gulf States combined — killed" value="16+" source="State media via NPR" />
                  <StatLine label="Kuwait" value="2 officers + 1 child killed" source="State media, UNICEF" />
                  <StatLine label="Bahrain" value="1 worker + 1 woman killed" source="State media via AJ" />
                  <StatLine label="Oman" value="2 killed, 5 injured" source="Oman state media" />
                  <StatLine label="Jordan" value="0 killed, 28 injured" source="Jordanian authorities" />
                  <StatLine label="France (in Iraq)" value="1 killed, several injured" source="French MoD" />
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
                  PMF strikes in Iraq, oil terminal operations suspended.
                  Infrastructure damage across Gulf states includes AWS data
                  centers, airports, and oil facilities.
                </p>
              </CollapsibleSection>
            </div>
          </div>

          {/* ───────────────────────────────────────────────────── */}
          {/* SECTION 3: Children & Education                       */}
          {/* ───────────────────────────────────────────────────── */}

          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Children &amp; Education
            </h2>

            {/* Highlight card */}
            <div className="rounded-lg border border-red-900/40 bg-red-950/15 p-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-red-400">1,100+</div>
                <div className="mt-1 text-xs text-zinc-300">
                  Children killed or injured across the region
                </div>
                <div className="mt-1">
                  <SourceTag text="UNICEF, March 11, 2026" />
                </div>
              </div>
            </div>

            {/* Breakdown */}
            <div className="mt-3 rounded-lg border border-zinc-800/50 bg-zinc-900/30 p-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                By country
              </p>
              <div className="space-y-0.5 divide-y divide-zinc-800/30">
                <StatLine label="Iran — children killed" value="200+" source="UNICEF" />
                <StatLine label="Lebanon — children killed" value="91" source="UNICEF" />
                <StatLine label="Israel — children killed" value="4" source="UNICEF" />
                <StatLine label="Kuwait — children killed" value="1" source="UNICEF" />
                <StatLine label="Lebanon — children displaced" value="200,000+" source="Mercy Corps" />
              </div>
            </div>

            {/* Minab school attack */}
            <div className="mt-3 rounded-lg border border-zinc-800/50 bg-zinc-900/30 p-4">
              <div className="mb-1.5 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400">
                  Named event
                </span>
              </div>
              <h3 className="text-sm font-semibold text-zinc-200">
                Minab School Attack
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                168 girls aged 7–12 were killed when their school in Minab, Iran
                was struck. This single event accounts for the majority of
                school-related child fatalities in the conflict.
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <SourceTag text="UNICEF, March 5" />
                <SourceTag text="BBC" />
              </div>
            </div>

            {/* Education impact */}
            <div className="mt-3 rounded-lg border border-zinc-800/50 bg-zinc-900/30 p-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Education impact
              </p>
              <ul className="space-y-1.5 text-xs leading-relaxed text-zinc-400">
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-zinc-600" />
                  65+ schools damaged across Iran
                  <SourceTag text="Iranian Red Crescent" />
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-zinc-600" />
                  ~180 children killed while in school in Iran
                  <SourceTag text="UNICEF" />
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-zinc-600" />
                  Schools converted to displacement shelters in Lebanon
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-zinc-600" />
                  Millions of children out of school regionally
                </li>
              </ul>
            </div>
          </div>

          {/* ───────────────────────────────────────────────────── */}
          {/* SECTION 4: Economic & Food Security Impact            */}
          {/* ───────────────────────────────────────────────────── */}

          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Economic &amp; Food Security Impact
            </h2>
            <div className="rounded-lg border border-zinc-800/50 bg-zinc-900/30 p-4">
              <div className="space-y-0.5 divide-y divide-zinc-800/30">
                <StatLine label="Oil prices" value="Above $100/barrel" source="Multiple outlets" />
                <StatLine label="Strait of Hormuz" value="Virtual standstill" source="WFP" />
                <StatLine label="Shipping costs" value="Up 18%" source="WFP, March 12" />
                <StatLine label="War cost estimate" value="~$2 billion/day" source="IRC" />
                <StatLine label="Additional people at risk of hunger" value="45 million" source="WFP/UN News, March 18" />
                <StatLine label="World fertilizer through Hormuz" value="25% — disrupted" source="WFP" />
              </div>
              <div className="mt-3 border-t border-zinc-800/30 pt-3">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Lebanon food response
                </p>
                <div className="space-y-0.5 divide-y divide-zinc-800/30">
                  <StatLine label="People reached by WFP" value="230,000" source="WFP" />
                  <StatLine label="Hot meals served since March 2" value="500,000+" source="WFP" />
                </div>
              </div>
            </div>
          </div>

          {/* ───────────────────────────────────────────────────── */}
          {/* SECTION 5: Humanitarian Response (Org Cards)          */}
          {/* ───────────────────────────────────────────────────── */}

          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Verified Organizations
            </h2>
            <div className="space-y-3">
              {ORGANISATIONS.map((org) => (
                <div
                  key={org.abbr}
                  className="rounded-lg border border-zinc-800/50 bg-zinc-900/30 p-4"
                >
                  {/* Org header */}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-[10px] font-bold text-zinc-400">
                        {org.abbr.length <= 5
                          ? org.abbr
                          : org.abbr
                              .split(" ")
                              .map((w) => w[0])
                              .join("")}
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-zinc-200">
                          {org.name}
                        </h3>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-950/40 px-2 py-0.5 text-[10px] text-green-400">
                            <svg
                              className="h-2.5 w-2.5"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.403 12.652a3 3 0 010-5.304 3 3 0 00-3.75-3.751 3 3 0 00-5.305 0 3 3 0 00-3.751 3.75 3 3 0 000 5.305 3 3 0 003.75 3.751 3 3 0 005.305 0 3 3 0 003.751-3.75zm-2.546-4.46a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                                clipRule="evenodd"
                              />
                            </svg>
                            Verified
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-950/40 px-2 py-0.5 text-[10px] text-amber-400">
                            <svg
                              className="h-2.5 w-2.5"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z"
                                clipRule="evenodd"
                              />
                            </svg>
                            {org.charityNavigator}
                          </span>
                        </div>
                      </div>
                    </div>

                    <a
                      href={org.donateUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-[#0a0a0a]"
                    >
                      Donate
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2.5}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                        />
                      </svg>
                    </a>
                  </div>

                  <p className="mt-3 text-xs leading-relaxed text-zinc-400">
                    {org.mission}
                  </p>

                  {/* Current response — NEW */}
                  <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950/50 p-2.5">
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-green-400">
                        What they&apos;re doing now
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-zinc-500">
                      {org.currentResponse}
                    </p>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-zinc-600">
                    <span>{org.verification}</span>
                    <span>EIN: {org.ein}</span>
                    <a
                      href={org.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-zinc-500 underline decoration-zinc-700 hover:text-zinc-400"
                    >
                      {org.website.replace("https://", "")}
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ───────────────────────────────────────────────────── */}
          {/* SECTION 6: Source Attribution                          */}
          {/* ───────────────────────────────────────────────────── */}

          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Sources
            </h2>
            <div className="rounded-lg border border-zinc-800/50 bg-zinc-900/30 p-4">
              <p className="text-xs leading-relaxed text-zinc-400">
                All humanitarian data on this page is sourced from the
                organizations and agencies listed below. Every figure includes
                its source and reporting date. Where figures conflict between
                sources, both are presented with attribution.
              </p>
              <button
                onClick={() => setShowSources(!showSources)}
                className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:text-zinc-100"
              >
                {showSources ? "Hide" : "View"} all {SOURCES.length} sources
                <ChevronDown open={showSources} />
              </button>

              {showSources && (
                <div className="mt-3 space-y-2 border-t border-zinc-800/50 pt-3">
                  {SOURCES.map((s, i) => (
                    <div
                      key={i}
                      className="flex flex-col gap-0.5 rounded-md border border-zinc-800/30 bg-zinc-950/40 p-2.5 sm:flex-row sm:items-baseline sm:justify-between"
                    >
                      <div className="flex-1">
                        <span className="text-[11px] font-semibold text-zinc-300">
                          {s.org}
                        </span>
                        <p className="text-[10px] leading-relaxed text-zinc-500">
                          {s.desc}
                        </p>
                      </div>
                      <span className="flex-shrink-0 text-[10px] text-zinc-600">
                        {s.date}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ───────────────────────────────────────────────────── */}
          {/* Bottom disclaimer                                      */}
          {/* ───────────────────────────────────────────────────── */}

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
            <h3 className="text-xs font-semibold text-zinc-300">
              About this page
            </h3>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
              War Library is a neutral conflict-tracking resource. 100% of any
              monetization proceeds from this site are directed toward
              humanitarian aid. The organizations listed above were selected
              because they are internationally recognized, independently rated,
              and have verified active operations in the current conflict zone.
              Donation URLs were verified on March 8, 2026. Humanitarian data
              last verified mid-March 2026.
            </p>
            <p className="mt-2 text-[10px] italic text-zinc-600">
              Inclusion on this page does not constitute an endorsement of any
              organization&apos;s political positions. These organizations were chosen
              for their humanitarian mandate, operational presence, and financial
              transparency. If you believe any information on this page is
              outdated or incorrect, reach out at john@midatlantic.ai.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
