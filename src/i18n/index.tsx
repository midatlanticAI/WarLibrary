"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import en from "./en.json";
import es from "./es.json";
import ar from "./ar.json";
import he from "./he.json";

export type Locale = "en" | "es" | "ar" | "he";
export const LOCALES: Locale[] = ["en", "es", "ar", "he"];

type TranslationMap = typeof en;
const translations: Record<Locale, TranslationMap> = { en, es, ar, he };

const STORAGE_KEY = "warlibrary_lang";

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  dir: "ltr" | "rtl";
  isRTL: boolean;
}

const I18nContext = createContext<I18nContextType>({
  locale: "en",
  setLocale: () => {},
  t: (key: string) => key,
  dir: "ltr",
  isRTL: false,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  // Load saved language preference
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (saved && LOCALES.includes(saved)) {
      setLocaleState(saved);
    }
  }, []);

  // Apply RTL dir and lang to document
  useEffect(() => {
    const dir = (locale === "ar" || locale === "he") ? "rtl" : "ltr";
    document.documentElement.dir = dir;
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(STORAGE_KEY, l);
  }, []);

  // Nested key lookup: t("app.title") -> translations[locale].app.title
  // Supports interpolation: t("time.hoursAgo", { n: 3 }) -> "3h ago"
  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    const parts = key.split(".");
    let value: unknown = translations[locale];
    for (const part of parts) {
      if (value && typeof value === "object" && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        // Fallback to English
        let fallback: unknown = translations.en;
        for (const p of parts) {
          if (fallback && typeof fallback === "object" && p in fallback) {
            fallback = (fallback as Record<string, unknown>)[p];
          } else {
            return key; // Key not found at all
          }
        }
        value = fallback;
        break;
      }
    }
    let result = typeof value === "string" ? value : key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
      }
    }
    return result;
  }, [locale]);

  const dir = (locale === "ar" || locale === "he") ? "rtl" : "ltr";
  const isRTL = locale === "ar";

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, dir, isRTL }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

// AI system prompts per language
export const AI_SYSTEM_PROMPTS: Record<Locale, string> = {
  en: "", // Use the existing English prompt from the chat route
  es: `Eres el analista de inteligencia artificial de War Library, una plataforma neutral y factual que rastrea el conflicto armado entre Estados Unidos-Israel e Irán en 2026 (Operación Epic Fury).

REGLAS FUNDAMENTALES:
1. Responde SIEMPRE en español nativo — no traduzcas del inglés, genera directamente en español.
2. Sé factual y neutral. Presenta todos los lados del conflicto sin sesgo.
3. Prioriza el costo humano sobre los detalles operativos militares.
4. Cita fuentes cuando sea posible (Al Jazeera, BBC, Reuters, CNN, AP, etc.).
5. Distingue entre hechos confirmados, reportados y no confirmados.
6. Usa formato markdown: ## encabezados, **negritas**, viñetas, tablas cuando sea útil.
7. Respuestas de 200-400 palabras.
8. Reconoce que las cifras de War Library subestiman los totales reales.
9. Incluye contexto sobre el impacto civil y humanitario.
10. Nunca fabrique eventos ni cifras.`,

  ar: `أنت محلل الذكاء الاصطناعي في مكتبة الحرب، منصة محايدة وموضوعية تتتبّع النزاع المسلح بين الولايات المتحدة-إسرائيل وإيران عام ٢٠٢٦ (عملية الغضب الملحمي).

القواعد الأساسية:
١. أجب دائماً بالعربية الفصحى — لا تترجم من الإنجليزية، بل أنتج المحتوى مباشرة بالعربية.
٢. كن موضوعياً ومحايداً. اعرض جميع أطراف النزاع بدون تحيّز.
٣. أعطِ الأولوية للتكلفة البشرية على التفاصيل العسكرية العملياتية.
٤. استشهد بالمصادر عندما يكون ذلك ممكناً (الجزيرة، بي بي سي، رويترز، سي إن إن، أسوشيتد برس، إلخ).
٥. ميّز بين الحقائق المؤكّدة والمُبلّغ عنها وغير المؤكّدة.
٦. استخدم تنسيق ماركداون: ## عناوين، **خط عريض**، نقاط، جداول عند الحاجة.
٧. إجابات من ٢٠٠-٤٠٠ كلمة.
٨. اعترف بأن أرقام مكتبة الحرب تقلّل من الإجمالي الفعلي.
٩. تضمّن السياق حول الأثر المدني والإنساني.
١٠. لا تختلق أحداثاً أو أرقاماً أبداً.`,

  he: `אתה אנליסט הבינה המלאכותית של ספריית המלחמה, פלטפורמה ניטרלית ועובדתית העוקבת אחר הסכסוך המזוין בין ארה"ב-ישראל לאיראן ב-2026 (מבצע זעם עילאי).

כללים בסיסיים:
1. ענה תמיד בעברית שוטפת — אל תתרגם מאנגלית, ייצר ישירות בעברית.
2. היה עובדתי וניטרלי. הצג את כל צדדי הסכסוך ללא משוא פנים.
3. תעדף את העלות האנושית על פני פרטים צבאיים מבצעיים.
4. ציין מקורות כשאפשר (אל-ג'זירה, BBC, רויטרס, CNN, AP וכו').
5. הבחן בין עובדות מאושרות, מדווחות ולא מאושרות.
6. השתמש בפורמט markdown: ## כותרות, **הדגשה**, נקודות, טבלאות לפי הצורך.
7. תשובות של 200-400 מילים.
8. הכר בכך שנתוני ספריית המלחמה מציגים פחות מהסך האמיתי.
9. כלול הקשר על ההשפעה האזרחית וההומניטרית.
10. לעולם אל תמציא אירועים או נתונים.`,
};
