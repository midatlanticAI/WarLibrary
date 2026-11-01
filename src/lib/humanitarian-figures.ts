/**
 * Human cost of the conflict, as shown on /support.
 *
 * A dated snapshot, not live data: each figure is the one its source
 * reported on `asOf`. Every value below was matched verbatim against the
 * linked source on CHECKED_ON. When one is updated, check the new source
 * the same way, update `asOf` and CHECKED_ON, and never combine figures
 * from different sources into one number.
 *
 * Labels and notes are i18n keys under `donate.`; values are numbers so
 * each language formats them with its own digits.
 */

export const FIGURES_CHECKED_ON = "2026-10-31";

export interface FigureSource {
  /** Organization that published the figure. */
  org: string;
  url: string;
  /** Outlet the figure was read from, when it is secondhand. */
  via?: string;
  /** The publisher is a party to the conflict. */
  party?: boolean;
}

export interface Figure {
  /** i18n key under donate., with any values it takes (ISO dates format as dates). */
  label: string;
  labelVars?: Record<string, number | string>;
  value: number;
  /** The source says "more than" or "at least". */
  plus?: boolean;
  /** Show as 3.2M rather than 3,200,000. */
  compact?: boolean;
  /** ISO date the figure refers to. */
  asOf: string;
  source: FigureSource;
  /** Optional i18n key under donate. for a detail line, with its numbers. */
  detail?: { key: string; vars: Record<string, number | string> };
}

export interface CountrySection {
  /** i18n key under donate. for the section title. */
  title: string;
  flag: string;
  figures: Figure[];
  /** i18n keys under donate. for notes shown under the figures. */
  notes?: { key: string; vars?: Record<string, number | string> }[];
}

const S = {
  ffm: {
    org: "UN Independent International Fact-Finding Mission on Iran",
    url: "https://www.ohchr.org/sites/default/files/documents/hrbodies/hrcouncil/sessions-regular/session63/a-hrc-63-61-aev.pdf",
  },
  ffmIranGov: {
    org: "Iran forensic medicine organization",
    via: "UN Fact-Finding Mission on Iran",
    url: "https://www.ohchr.org/sites/default/files/documents/hrbodies/hrcouncil/sessions-regular/session63/a-hrc-63-61-aev.pdf",
    party: true,
  },
  whoIranGov: {
    org: "Iranian national authorities",
    via: "WHO situation report 11",
    url: "https://cdn.who.int/media/docs/default-source/middle-east-situation-report/middle-east-conflict-global-situation-report-15-september-2026.pdf",
    party: true,
  },
  who: {
    org: "WHO situation report 11",
    url: "https://cdn.who.int/media/docs/default-source/middle-east-situation-report/middle-east-conflict-global-situation-report-15-september-2026.pdf",
  },
  hrana: {
    org: "HRANA",
    url: "https://www.en-hrana.org/wp-content/uploads/2026/05/US-Israeli-Military-Operations-in-Iran-EN.pdf",
  },
  hengaw: { org: "Hengaw", url: "https://hengaw.org/en/content/article-40331" },
  unicefIran: { org: "UNICEF", url: "https://www.unicef.org/mena/press-releases/casualties-Iran-exceed-2500-war" },
  unhcr: { org: "UNHCR", url: "https://data.unhcr.org/en/situations/middle_eastern" },
  mophLb: {
    org: "Lebanese Ministry of Public Health",
    url: "https://www.moph.gov.lb/en/Pages/0/87327/update-toll-of-the-aggression-12-10-2026",
  },
  unicefLb: {
    org: "UNICEF",
    url: "https://www.unicef.org/mena/press-releases/four-five-households-lebanon-struggle-afford-basic-needs-conflict-deepens",
  },
  ochaLb: {
    org: "UN OCHA",
    via: "Arab News",
    url: "https://www.arabnews.com/middle-east/israeli-military-activity-is-blocking-lebanons-recovery-as-300000-remain-displaced-un-says-3009054",
  },
  toi: {
    org: "Times of Israel",
    url: "https://www.timesofisrael.com/650-iranian-missiles-fired-24-killed-and-10800-israeli-strikes-the-war-in-numbers/",
  },
  dod: {
    org: "US Department of Defense casualty database",
    url: "https://dcas.dmdc.osd.mil/dcas/conflictCasualties/oefu/deaths",
    party: true,
  },
  uae: {
    org: "UAE government",
    via: "The National",
    url: "https://www.thenationalnews.com/news/uae/2026/05/10/uae-intercepts-two-drones-from-iran-on-sunday/",
    party: true,
  },
  unicefRegion: { org: "UNICEF", url: "https://www.unicef.org/mena/press-releases/casualties-Iran-exceed-2500-war" },
  lloyds: {
    org: "Lloyd's List Intelligence",
    url: "https://www.lloydslistintelligence.com/resources/blog/strait-of-hormuz-brief-22-october-2026",
  },
  wfp: {
    org: "WFP",
    url: "https://www.wfp.org/news/wfp-projects-food-insecurity-could-reach-record-levels-result-middle-east-escalation",
  },
  aawsat: {
    org: "Reuters and AFP",
    via: "Asharq Al-Awsat",
    url: "https://english.aawsat.com/world/5336063-rubio-says-us-yet-decide-new-iran-strikes",
  },
} satisfies Record<string, FigureSource>;

/** The six headline cards. */
export const HEADLINE: Figure[] = [
  { label: "hcIranKilledGov", value: 3519, asOf: "2026-08-09", source: S.ffmIranGov },
  { label: "hcLebanonKilled", labelVars: { date: "2026-03-02" }, value: 4389, asOf: "2026-10-12", source: S.mophLb },
  { label: "hcChildrenRegion", value: 4000, plus: true, asOf: "2026-07-31", source: S.unicefRegion },
  { label: "hcLebanonStillDisplaced", value: 300000, plus: true, asOf: "2026-10-28", source: S.ochaLb },
  { label: "hcUsKilled", value: 23, asOf: "2026-10-30", source: S.dod },
  { label: "hcIsraelKilled", value: 26, asOf: "2026-09-14", source: S.who },
];

export const COUNTRIES: CountrySection[] = [
  {
    title: "hcIran",
    flag: "🇮🇷",
    figures: [
      { label: "hcKilledGov", value: 3519, asOf: "2026-08-09", source: S.ffmIranGov },
      { label: "hcInjuredGov", value: 33806, asOf: "2026-09-14", source: S.whoIranGov },
      {
        label: "hcKilledHrana",
        labelVars: { date: "2026-04-08" },
        value: 3636,
        asOf: "2026-04-08",
        source: S.hrana,
        detail: { key: "hcHranaSplit", vars: { civ: 1701, mil: 1221, unk: 714 } },
      },
      {
        label: "hcKilledHengaw",
        labelVars: { date: "2026-04-08" },
        value: 7650,
        plus: true,
        asOf: "2026-04-08",
        source: S.hengaw,
        detail: { key: "hcHengawSplit", vars: { civ: 1030, mil: 6620 } },
      },
      { label: "hcChildrenKilled", value: 386, asOf: "2026-07-31", source: S.unicefIran },
      { label: "hcChildrenInjured", value: 2117, asOf: "2026-07-31", source: S.unicefIran },
      { label: "hcDisplacedPeak", value: 3_200_000, plus: true, compact: true, asOf: "2026-04-07", source: S.ffm },
    ],
    notes: [{ key: "hcIranReturned", vars: { date: "2026-07-07" } }, { key: "hcIranNote", vars: { date: "2026-04-08" } }],
  },
  {
    title: "hcLebanon",
    flag: "🇱🇧",
    figures: [
      { label: "hcKilledSince", value: 4389, asOf: "2026-10-12", source: S.mophLb, detail: { key: "hcSince", vars: { date: "2026-03-02" } } },
      { label: "hcInjuredSince", value: 12424, asOf: "2026-10-12", source: S.mophLb, detail: { key: "hcSince", vars: { date: "2026-03-02" } } },
      { label: "hcChildrenKilled", value: 261, plus: true, asOf: "2026-09-30", source: S.unicefLb },
      { label: "hcChildrenInjured", value: 1056, asOf: "2026-09-30", source: S.unicefLb },
      {
        label: "hcStillDisplaced",
        value: 300000,
        plus: true,
        asOf: "2026-10-28",
        source: S.ochaLb,
        detail: { key: "hcReturned", vars: { n: 970000 } },
      },
    ],
    notes: [{ key: "hcLebanonNote", vars: { date: "2026-03-02", baseline: "2023-10-08" } }],
  },
  {
    title: "hcIsrael",
    flag: "🇮🇱",
    figures: [
      { label: "hcKilled", value: 26, asOf: "2026-09-14", source: S.who },
      { label: "hcInjured", value: 9067, asOf: "2026-09-14", source: S.who },
      { label: "hcKilledByMissiles", labelVars: { date: "2026-04-08" }, value: 20, asOf: "2026-04-08", source: S.toi },
    ],
    notes: [{ key: "hcIsraelNote" }],
  },
  {
    title: "hcUnitedStates",
    flag: "🇺🇸",
    figures: [
      { label: "hcServiceKilled", value: 23, asOf: "2026-10-30", source: S.dod },
      { label: "hcServiceWounded", value: 865, asOf: "2026-10-30", source: S.dod },
    ],
    notes: [{ key: "hcUsNote", vars: { a: 15, b: 417, c: 8, d: 448, date: "2026-07-07" } }],
  },
  {
    title: "hcIraqGulf",
    flag: "🌍",
    figures: [
      { label: "hcIraqKilled", value: 109, asOf: "2026-09-14", source: S.who },
      { label: "hcIraqInjured", value: 300, asOf: "2026-09-14", source: S.who },
      { label: "hcUaeCiviliansKilled", value: 10, asOf: "2026-05-10", source: S.uae },
      { label: "hcUaeInjured", value: 230, asOf: "2026-05-10", source: S.uae },
    ],
    notes: [{ key: "hcGulfNote" }],
  },
];

/** The Minab school strike: one named event, from the UN mission's report. */
export const MINAB = { source: S.ffm, asOf: "2026-04-09" };

/** Shipping and food. */
export const SHIPPING = {
  hormuz: { source: S.lloyds, asOf: "2026-10-11", vars: { n: 104, attacks: 28 } },
  hunger: { source: S.wfp, asOf: "2026-03-17", vars: { n: 45_000_000, price: 100 } },
};

/** Where the conflict stands, for the note at the top of the section. */
export const STATUS = { source: S.aawsat, asOf: "2026-10-31", lebanonSource: S.ochaLb };

/** Every distinct source on the page, for the source list. */
export function allSources(): (FigureSource & { asOf: string })[] {
  const seen = new Map<string, FigureSource & { asOf: string }>();
  const add = (source: FigureSource, asOf: string) => {
    const key = `${source.org}|${source.url}`;
    const prev = seen.get(key);
    if (!prev || prev.asOf < asOf) seen.set(key, { ...source, asOf });
  };
  for (const f of HEADLINE) add(f.source, f.asOf);
  for (const c of COUNTRIES) for (const f of c.figures) add(f.source, f.asOf);
  add(MINAB.source, MINAB.asOf);
  add(SHIPPING.hormuz.source, SHIPPING.hormuz.asOf);
  add(SHIPPING.hunger.source, SHIPPING.hunger.asOf);
  add(STATUS.source, STATUS.asOf);
  return [...seen.values()];
}
