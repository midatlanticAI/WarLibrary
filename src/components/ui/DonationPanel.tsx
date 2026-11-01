"use client";

/**
 * DonationPanel — Humanitarian Aid & Human Cost
 *
 * Charity facts were checked on CHECKED_ON (below); the human-cost figures
 * live in src/lib/humanitarian-figures.ts with their own sources and dates.
 * War Library does NOT collect or process donations.
 */

import { useState } from "react";
import { useI18n } from "@/i18n";
import { LOCALE_TAG } from "@/i18n/locale";
import {
  COUNTRIES,
  FIGURES_CHECKED_ON,
  HEADLINE,
  MINAB,
  SHIPPING,
  STATUS,
  allSources,
  type Figure,
  type FigureSource,
} from "@/lib/humanitarian-figures";

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

/** A source as a link, with who relayed it and whether it is a party to the conflict. */
function SourceLink({ source }: { source: FigureSource }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        lang="en"
        className="inline-block rounded bg-zinc-800/60 px-1.5 py-0.5 text-[9px] text-zinc-400 underline decoration-zinc-700 hover:text-zinc-200"
      >
        {source.org}
        {source.via ? ` · ${source.via}` : ""}
      </a>
      {source.party && (
        <span className="rounded bg-amber-950/40 px-1.5 py-0.5 text-[9px] text-amber-400/90">
          {t("donate.hcParty")}
        </span>
      )}
    </span>
  );
}

/** Wrap Latin text for use inside a translated sentence (LRI … PDI). */
const ltr = (text: string) => `\u2066${text}\u2069`;

/* ─── Types ─── */

interface Organisation {
  name: string;
  abbr: string;
  /** i18n key (under donate.) for the one-line description. */
  descKey: string;
  donateUrl: string;
  website: string;
  /** The organization's own page on its response to this conflict. */
  responseUrl: string;
  /** The US legal entity the EIN belongs to (IRS records via ProPublica). */
  taxEntity: string;
  ein: string;
  /** Charity Navigator stars out of 4, for the entity that holds the EIN. */
  stars: number;
  /** Program expenses as a share of total expenses, per Charity Navigator. */
  programShare: number;
}

/* ─── Organisation Data ─── */

/**
 * Checked 2026-10-31: every donate and website URL resolves to the
 * organization; every EIN matches the named entity in IRS records
 * (ProPublica Nonprofit Explorer, all 501(c)(3)); stars and program
 * shares are from each entity's Charity Navigator page. Bump
 * CHECKED_ON when they are checked again.
 */
const CHECKED_ON = "2026-10-31";

const ORGANISATIONS: Organisation[] = [
  {
    name: "International Committee of the Red Cross",
    abbr: "ICRC",
    descKey: "orgICRC",
    donateUrl: "https://www.icrc.org/en/donate/middle-east",
    website: "https://www.icrc.org",
    responseUrl: "https://www.icrc.org/en/where-we-work/iran",
    taxEntity: "International Committee of the Red Cross",
    ein: "98-6001029",
    stars: 3,
    programShare: 0.9111,
  },
  {
    name: "UNHCR — UN Refugee Agency",
    abbr: "UNHCR",
    descKey: "orgUNHCR",
    donateUrl: "https://donate.unhcr.org/int/en/general",
    website: "https://www.unhcr.org",
    responseUrl: "https://www.unhcr.org/emergencies/middle-east-emergency",
    taxEntity: "USA for UNHCR",
    ein: "52-1662800",
    stars: 4,
    programShare: 0.802,
  },
  {
    name: "Médecins Sans Frontières / Doctors Without Borders",
    abbr: "MSF",
    descKey: "orgMSF",
    donateUrl: "https://www.msf.org/donate",
    website: "https://www.msf.org",
    responseUrl: "https://www.doctorswithoutborders.org/latest/msf-response-escalating-conflict-middle-east",
    taxEntity: "Doctors Without Borders, USA",
    ein: "13-3433452",
    stars: 4,
    programShare: 0.8471,
  },
  {
    name: "UNICEF — United Nations Children's Fund",
    abbr: "UNICEF",
    descKey: "orgUNICEF",
    donateUrl: "https://help.unicef.org/en",
    website: "https://www.unicef.org",
    responseUrl: "https://www.unicef.org/appeals/lebanon",
    taxEntity: "UNICEF USA",
    ein: "13-1760110",
    stars: 4,
    programShare: 0.8566,
  },
  {
    name: "International Rescue Committee",
    abbr: "IRC",
    descKey: "orgIRC",
    donateUrl: "https://help.rescue.org/donate",
    website: "https://www.rescue.org",
    responseUrl: "https://www.rescue.org/article/lebanon-crisis-what-happening-and-how-help",
    taxEntity: "International Rescue Committee",
    ein: "13-5660870",
    stars: 4,
    programShare: 0.8735,
  },
  {
    name: "Direct Relief",
    abbr: "Direct Relief",
    descKey: "orgDirectRelief",
    donateUrl: "https://www.directrelief.org/donate",
    website: "https://www.directrelief.org",
    responseUrl: "https://www.directrelief.org/place/lebanon/",
    taxEntity: "Direct Relief",
    ein: "95-1831116",
    stars: 4,
    programShare: 0.9943,
  },
  {
    name: "World Food Programme",
    abbr: "WFP",
    descKey: "orgWFP",
    donateUrl: "https://wfpusa.org/give/",
    website: "https://www.wfp.org",
    responseUrl: "https://www.wfp.org/emergencies/middle-east-conflict",
    taxEntity: "World Food Program USA",
    ein: "13-3843435",
    stars: 4,
    programShare: 0.897,
  },
  {
    name: "Save the Children",
    abbr: "Save the Children",
    descKey: "orgSaveTheChildren",
    donateUrl: "https://www.savethechildren.org/savekids",
    website: "https://www.savethechildren.org",
    responseUrl: "https://www.savethechildren.org/us/what-we-do/emergency-response/middle-east-regional-crisis",
    taxEntity: "Save the Children Federation",
    ein: "06-0726487",
    stars: 4,
    programShare: 0.8494,
  },
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
        aria-expanded={open}
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

/* ─── Main Component ─── */

interface DonationPanelProps {
  onBack: () => void;
}

export default function DonationPanel({ onBack }: DonationPanelProps) {
  const { t, locale } = useI18n();
  const tag = LOCALE_TAG[locale];
  const fmtNumber = new Intl.NumberFormat(tag);
  const fmtPercent = new Intl.NumberFormat(tag, { style: "percent", maximumFractionDigits: 0 });
  const fmtCompact = new Intl.NumberFormat(tag, { notation: "compact", maximumFractionDigits: 1 });
  const fmtDate = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(tag, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  const fmtValue = (f: Figure) => `${(f.compact ? fmtCompact : fmtNumber).format(f.value)}${f.plus ? "+" : ""}`;
  const fmtUsd = new Intl.NumberFormat(tag, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  // Numbers and ISO dates in sentences use the reader's digits and calendar
  // wording, so no translation carries a hand-typed digit.
  const fmtVars = (vars?: Record<string, number | string>) =>
    Object.fromEntries(
      Object.entries(vars ?? {}).map(([k, v]) => [
        k,
        typeof v === "number" ? fmtNumber.format(v) : /^\d{4}-\d{2}-\d{2}$/.test(v) ? fmtDate(v) : v,
      ])
    );
  const checkedOn = new Date(`${CHECKED_ON}T12:00:00Z`).toLocaleDateString(tag, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  const sources = allSources();
  const [showSources, setShowSources] = useState(false);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#0a0a0a]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-zinc-800 p-4">
        <button
          onClick={onBack}
          aria-label={t("eventPanel.backToMap")}
          className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
            />
          </svg>
        </button>
        <div>
          <h1 className="text-lg font-bold text-zinc-100">{t("donate.title")}</h1>
          <p className="text-xs text-zinc-500">
            {t("donate.subtitle")}
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
                  {t("donate.disclaimer")}
                </span>{" "}
                {t("donate.disclaimerText")}
              </p>
            </div>
          </div>

          {/* ───────────────────────────────────────────────────── */}
          {/* SECTION 1: Human cost — dated figures, each linked     */}
          {/* ───────────────────────────────────────────────────── */}

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
            <h2 className="text-sm font-semibold text-zinc-200">
              {t("donate.humanCost")}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              {t("donate.humanCostIntro")}
            </p>

            {/*
              A dated snapshot, not live data. On a page badged LIVE,
              present-tense humanitarian numbers read as current unless
              something says otherwise, so this says otherwise.
            */}
            <p
              role="note"
              className="mt-3 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200"
            >
              {t("donate.snapshotNotice", { date: fmtDate(FIGURES_CHECKED_ON) })}
            </p>

            <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                {t("donate.hcStatusTitle", { date: fmtDate(STATUS.asOf) })}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-300">
                {t("donate.hcStatusIran", { date: fmtDate("2026-08-30") })}{" "}
                {t("donate.hcStatusLebanon", { date: fmtDate("2026-04-16") })}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <SourceLink source={STATUS.source} />
                <SourceLink source={STATUS.lebanonSource} />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {HEADLINE.map((f) => (
                <div
                  key={f.label}
                  className="rounded-md border border-zinc-800 bg-zinc-900/60 p-2.5 text-center"
                >
                  <div className="text-base font-bold text-red-400">{fmtValue(f)}</div>
                  <div className="mt-0.5 text-[10px] leading-tight text-zinc-400">
                    {t(`donate.${f.label}`, fmtVars(f.labelVars))}
                  </div>
                  <div className="mt-1 text-[9px] text-zinc-500">{fmtDate(f.asOf)}</div>
                  <div className="mt-1">
                    <SourceLink source={f.source} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ───────────────────────────────────────────────────── */}
          {/* SECTION 2: Country-by-Country Breakdown               */}
          {/* ───────────────────────────────────────────────────── */}

          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              {t("donate.countryBreakdown")}
            </h2>
            <div className="space-y-2">
              {COUNTRIES.map((c, i) => (
                <CollapsibleSection
                  key={c.title}
                  title={t(`donate.${c.title}`)}
                  defaultOpen={i === 0}
                  icon={<span className="text-xs" aria-hidden="true">{c.flag}</span>}
                >
                  <div className="space-y-0.5 divide-y divide-zinc-800/30">
                    {c.figures.map((f) => (
                      <div
                        key={`${f.label}-${f.asOf}-${f.value}`}
                        className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2"
                      >
                        <div className="min-w-0">
                          <span className="text-xs text-zinc-400">{t(`donate.${f.label}`, fmtVars(f.labelVars))}</span>
                          {f.detail && (
                            <span className="block text-[10px] text-zinc-500">
                              {t(`donate.${f.detail.key}`, fmtVars(f.detail.vars))}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-baseline gap-1.5 sm:justify-end">
                          <span className="text-xs font-semibold text-zinc-200">{fmtValue(f)}</span>
                          <span className="text-[9px] text-zinc-500">{fmtDate(f.asOf)}</span>
                          <SourceLink source={f.source} />
                        </div>
                      </div>
                    ))}
                  </div>
                  {c.notes?.map((n) => (
                    <p key={n.key} className="mt-2 text-[10px] leading-relaxed text-zinc-500">
                      {t(`donate.${n.key}`, fmtVars(n.vars))}
                    </p>
                  ))}
                </CollapsibleSection>
              ))}
            </div>
          </div>

          {/* ───────────────────────────────────────────────────── */}
          {/* SECTION 3: Named event                                 */}
          {/* ───────────────────────────────────────────────────── */}

          <div className="rounded-lg border border-zinc-800/50 bg-zinc-900/30 p-4">
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400">
                {t("donate.namedEvent")}
              </span>
            </div>
            <h3 className="text-sm font-semibold text-zinc-200">
              {t("donate.hcMinabTitle", { date: fmtDate("2026-02-28") })}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              {t(
                "donate.hcMinabText",
                fmtVars({ total: 156, children: 120, boys: 73, girls: 47, educators: 26, parents: 7, independent: 157, independentChildren: 123 })
              )}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[9px] text-zinc-500">{fmtDate(MINAB.asOf)}</span>
              <SourceLink source={MINAB.source} />
            </div>
          </div>

          {/* ───────────────────────────────────────────────────── */}
          {/* SECTION 4: Shipping and food                           */}
          {/* ───────────────────────────────────────────────────── */}

          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              {t("donate.economicImpact")}
            </h2>
            <div className="space-y-3 rounded-lg border border-zinc-800/50 bg-zinc-900/30 p-4">
              <div>
                <p className="text-xs font-semibold text-zinc-300">{t("donate.straitOfHormuz")}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
                  {t("donate.hcHormuzText", fmtVars({ ...SHIPPING.hormuz.vars, date: SHIPPING.hormuz.asOf }))}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-[9px] text-zinc-500">{fmtDate(SHIPPING.hormuz.asOf)}</span>
                  <SourceLink source={SHIPPING.hormuz.source} />
                </div>
              </div>
              <div className="border-t border-zinc-800/30 pt-3">
                <p className="text-xs font-semibold text-zinc-300">{t("donate.hungerRisk")}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
                  {t("donate.hcHungerText", { n: fmtCompact.format(SHIPPING.hunger.vars.n), price: fmtUsd.format(SHIPPING.hunger.vars.price) })}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-[9px] text-zinc-500">{fmtDate(SHIPPING.hunger.asOf)}</span>
                  <SourceLink source={SHIPPING.hunger.source} />
                </div>
              </div>
            </div>
          </div>

          {/* ───────────────────────────────────────────────────── */}
          {/* SECTION 5: Humanitarian Response (Org Cards)          */}
          {/* ───────────────────────────────────────────────────── */}

          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              {t("donate.verifiedOrgs")}
            </h2>
            <p className="mb-3 text-[10px] text-zinc-500">{t("donate.checkedOn", { date: checkedOn })}</p>
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
                            {t("donate.registeredCharity")}
                          </span>
                          <a
                            href={`https://www.charitynavigator.org/ein/${org.ein.replace("-", "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full bg-amber-950/40 px-2 py-0.5 text-[10px] text-amber-400 hover:text-amber-300"
                          >
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
                            {t("donate.ratingStars", { n: fmtNumber.format(org.stars), max: fmtNumber.format(4) })}
                          </a>
                        </div>
                      </div>
                    </div>

                    <a
                      href={org.donateUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-[#0a0a0a]"
                    >
                      {t("donate.donateButton")}
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
                    {t(`donate.${org.descKey}`)}
                  </p>

                  {/*
                    The organization's own page on this conflict, rather than
                    a summary of it here: a summary goes stale within weeks
                    (the March one did), their page does not.
                  */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-950/50 p-2.5">
                    <a
                      href={org.responseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-semibold text-green-400 underline decoration-green-900 hover:text-green-300"
                    >
                      {t("donate.responseLink")} →
                    </a>
                    <span className="text-[10px] text-zinc-500">
                      {t("donate.programShare", { pct: fmtPercent.format(org.programShare) })}
                    </span>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-zinc-600">
                    {/* LTR isolates and a non-breaking hyphen: in RTL text "98-6001029" otherwise wraps and reorders. */}
                    <span>{t("donate.taxId", { entity: ltr(org.taxEntity), ein: ltr(org.ein.replace("-", "\u2011")) })}</span>
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
              {t("donate.sourcesTitle")}
            </h2>
            <div className="rounded-lg border border-zinc-800/50 bg-zinc-900/30 p-4">
              <p className="text-xs leading-relaxed text-zinc-400">
                {t("donate.sourcesIntro")}
              </p>
              <button
                onClick={() => setShowSources(!showSources)}
                aria-expanded={showSources}
                className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:text-zinc-100"
              >
                {showSources ? t("donate.hideAll") : t("donate.viewAll")} {t("donate.allSources", { n: fmtNumber.format(sources.length) })}
                <ChevronDown open={showSources} />
              </button>

              {showSources && (
                <ul className="mt-3 space-y-2 border-t border-zinc-800/50 pt-3">
                  {sources.map((s) => (
                    <li
                      key={`${s.org}|${s.url}`}
                      className="flex flex-col gap-0.5 rounded-md border border-zinc-800/30 bg-zinc-950/40 p-2.5 sm:flex-row sm:items-baseline sm:justify-between"
                    >
                      <SourceLink source={s} />
                      <span className="flex-shrink-0 text-[10px] text-zinc-600">
                        {fmtDate(s.asOf)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* ───────────────────────────────────────────────────── */}
          {/* Bottom disclaimer                                      */}
          {/* ───────────────────────────────────────────────────── */}

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
            <h3 className="text-xs font-semibold text-zinc-300">
              {t("donate.aboutPage")}
            </h3>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
              {t("donate.aboutPageText1")}
            </p>
            <p className="mt-2 text-[10px] italic text-zinc-600">
              {t("donate.aboutPageText2")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
