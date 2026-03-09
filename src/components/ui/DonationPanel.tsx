"use client";

/**
 * DonationPanel — Humanitarian Aid Directory
 *
 * All donation URLs were verified via web search on 2026-03-08.
 * War Library does NOT collect or process donations. Every link opens
 * the organisation's own, official donation page.
 */

interface Organisation {
  name: string;
  abbr: string;
  donateUrl: string;
  website: string;
  mission: string;
  activeStatus: string;
  verification: string;
  charityNavigator: string;
  ein: string;
}

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
      "Mobilizing across the Middle East as over 330,000 people have been forcibly displaced. Present in Iran since 1984 — the largest UN agency there — with offices in Tehran and five field locations, currently assisting 1.65 million refugees and newly displaced populations.",
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
      "Mobilizing emergency supplies to families across the Middle East. Reported approximately 180 children killed in airstrikes while in school in Iran. Providing emergency education, water and sanitation, and child protection services in affected areas.",
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
      "Responding to displacement across the Middle East. Providing emergency relief, cash assistance, and protection services. 87 cents of every dollar spent goes directly to helping refugees and others in need.",
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
      "Activated contingency plans in Lebanon to support displaced people — providing hot meals, ready-to-eat rations, and bread. Establishing emergency cash safety net reaching up to 100,000 people. Estimates USD 200 million needed for Lebanon alone over the next three months. 874,000 people currently lacking food.",
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
    verification: "501(c)(3)",
    charityNavigator: "4/4 Stars",
    ein: "06-0726487",
  },
];

interface DonationPanelProps {
  onBack: () => void;
}

export default function DonationPanel({ onBack }: DonationPanelProps) {
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
          <h1 className="text-lg font-bold text-zinc-100">
            Humanitarian Aid
          </h1>
          <p className="text-xs text-zinc-500">
            Verified organizations responding to the Middle East crisis
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
                All links go directly to each organization's official donation
                page. We receive no commission, referral fees, or financial
                benefit of any kind. Verify the URL in your browser before
                submitting payment information.
              </p>
            </div>
          </div>

          {/* Humanitarian impact summary */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
            <h2 className="text-sm font-semibold text-zinc-200">
              Humanitarian Impact — March 2026
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              Following the escalation of hostilities on February 28, 2026,
              the humanitarian situation across the Middle East has deteriorated
              rapidly. Armed attacks involving airstrikes on Iran, retaliatory
              strikes on Israel and Arab Gulf states, and regional military
              operations have created an acute crisis.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "Displaced", value: "330,000+" },
                { label: "Lacking food (Lebanon)", value: "874,000" },
                { label: "In shelters (Lebanon)", value: "100,000+" },
                { label: "Children killed in schools (Iran)", value: "~180" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-md border border-zinc-800 bg-zinc-900/60 p-2 text-center"
                >
                  <div className="text-sm font-bold text-red-400">
                    {stat.value}
                  </div>
                  <div className="mt-0.5 text-[10px] text-zinc-500">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[10px] italic text-zinc-600">
              Figures from UNHCR, WFP, UNICEF and UN OCHA briefings as of early
              March 2026. Numbers are preliminary and expected to rise.
            </p>
          </div>

          {/* Organisation cards */}
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
                      {/* Logo placeholder */}
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
                          {/* Verification badge */}
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
                          {/* Charity rating badge */}
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

                    {/* Donate button */}
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

                  {/* Mission */}
                  <p className="mt-3 text-xs leading-relaxed text-zinc-400">
                    {org.mission}
                  </p>

                  {/* Active status */}
                  <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950/50 p-2.5">
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-green-400">
                        Active in current conflict
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-zinc-500">
                      {org.activeStatus}
                    </p>
                  </div>

                  {/* Footer details */}
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

          {/* Bottom disclaimer */}
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
              Donation URLs were verified on March 8, 2026. If you believe any
              information on this page is outdated or incorrect, please contact
              us.
            </p>
            <p className="mt-2 text-[10px] italic text-zinc-600">
              Inclusion on this page does not constitute an endorsement of any
              organization's political positions. These organizations were chosen
              for their humanitarian mandate, operational presence, and financial
              transparency.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
