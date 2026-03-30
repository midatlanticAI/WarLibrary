"use client";

import { useI18n } from "@/i18n";

interface AboutPageProps {
  onBack: () => void;
}

export default function AboutPage({ onBack }: AboutPageProps) {
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
        <h1 className="text-lg font-bold text-zinc-100">{t("about.title")}</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-2xl space-y-6">
          <section>
            <h2 className="text-sm font-semibold text-zinc-200">
              {t("about.whatIs")}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              {t("about.whatIsText")}
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-zinc-200">
              {t("about.whyExists")}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              {t("about.whyExistsText")}
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-zinc-200">
              {t("about.howData")}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              {t("about.howDataText")}
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-zinc-200">
              {t("about.limitations")}
            </h2>
            <ul className="mt-2 space-y-1.5 text-xs text-zinc-400">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-zinc-600">•</span>
                <span>{t("about.limit1")}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-zinc-600">•</span>
                <span>{t("about.limit2")}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-zinc-600">•</span>
                <span>{t("about.limit3")}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-zinc-600">•</span>
                <span>{t("about.limit4")}</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-zinc-200">
              {t("about.editorialPolicy")}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              {t("about.editorialPolicyText")}
            </p>
          </section>

          <section className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
            <h2 className="text-sm font-semibold text-zinc-200">
              {t("about.openSource")}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              {t("about.openSourceText")}
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-zinc-200">
              {t("about.contact")}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              {t("about.contactText")}
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-zinc-200">
              {t("about.privacyPolicy")}
            </h2>
            <div className="mt-2 space-y-2 text-xs leading-relaxed text-zinc-400">
              <p>{t("about.privacyIntro")}</p>
              <ul className="space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-zinc-600">•</span>
                  <span>{t("about.privacyIp")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-zinc-600">•</span>
                  <span>{t("about.privacyAi")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-zinc-600">•</span>
                  <span>{t("about.privacyStorage")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-zinc-600">•</span>
                  <span>{t("about.privacyPush")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-zinc-600">•</span>
                  <span>{t("about.privacyAnalytics")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-zinc-600">•</span>
                  <span>{t("about.privacyNoSale")}</span>
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-zinc-200">
              {t("about.termsOfUse")}
            </h2>
            <div className="mt-2 space-y-2 text-xs leading-relaxed text-zinc-400">
              <p>{t("about.termsIntro")}</p>
              <ul className="space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-zinc-600">•</span>
                  <span>{t("about.term1")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-zinc-600">•</span>
                  <span>{t("about.term2")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-zinc-600">•</span>
                  <span>{t("about.term3")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-zinc-600">•</span>
                  <span>{t("about.term4")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-zinc-600">•</span>
                  <span>{t("about.term5")}</span>
                </li>
              </ul>
            </div>
          </section>

          <div className="pb-4 text-center text-xs text-zinc-700">
            {t("about.lastUpdated")}
          </div>
        </div>
      </div>
    </div>
  );
}
