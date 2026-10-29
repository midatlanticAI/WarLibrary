import type { Dispatch } from "@/lib/dispatch-core.cjs";
import type { DispatchTranslation } from "@/lib/translate-core.cjs";
import type { Locale } from "@/i18n/locale";

/**
 * The narrative of a dispatch in the reader's language, when the translator
 * produced one, else the English record. Statistics, event lists, dates and
 * labels are not part of this: they are computed or translated elsewhere.
 * `translations` is written by scripts/translate-dispatch.js after the
 * writer runs and after an admin edit; a language whose translation failed
 * the checks is simply absent and the English shows.
 */
export interface LocalizedDispatchText {
  title: string;
  lede: string;
  sections: { heading: string; body: string; event_ids: string[] }[];
  civilian_note: string | null;
  /** Language of the text above. */
  lang: Locale;
  /** True when the text is a machine translation of the English record. */
  translated: boolean;
}

export function localizeDispatch(d: Dispatch, locale: Locale, { original = false }: { original?: boolean } = {}): LocalizedDispatchText {
  const tr: DispatchTranslation | undefined = !original && locale !== "en" ? d.translations?.[locale] : undefined;
  if (!tr || tr.sections.length !== d.sections.length) {
    return { title: d.title, lede: d.lede, sections: d.sections, civilian_note: d.civilian_note, lang: "en", translated: false };
  }
  return {
    title: tr.title,
    lede: tr.lede,
    sections: d.sections.map((s, i) => ({ heading: tr.sections[i].heading, body: tr.sections[i].body, event_ids: s.event_ids })),
    civilian_note: d.civilian_note ? tr.civilian_note : null,
    lang: locale,
    translated: true,
  };
}
