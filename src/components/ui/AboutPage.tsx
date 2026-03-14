"use client";

interface AboutPageProps {
  onBack: () => void;
}

export default function AboutPage({ onBack }: AboutPageProps) {
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
        <h1 className="text-lg font-bold text-zinc-100">About War Library</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-2xl space-y-6">
          <section>
            <h2 className="text-sm font-semibold text-zinc-200">
              What is War Library?
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              War Library is an interactive, living record of the ongoing armed
              conflict across the Middle East. It is designed to help people
              understand what is happening — the who, what, where, when, and
              why — in a way that is more immediate and contextual than
              traditional news reporting.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-zinc-200">
              Why does this exist?
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              When conflict spreads across multiple countries and involves dozens
              of actors, it becomes nearly impossible to follow through
              individual news articles. War Library aggregates, maps, and
              contextualizes events from verified sources so that anyone — not
              just analysts or journalists — can understand the full picture.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-zinc-200">
              How is data collected?
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              Events are sourced from academic conflict databases (ACLED, UCDP),
              real-time news monitoring (GDELT), and direct reporting from
              international news organizations (Al Jazeera, CNN, BBC, Reuters,
              NPR, and others). Military and official sources (CENTCOM, UNIFIL,
              SIPRI) supplement the data. Each event is attributed to its
              original source.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-zinc-200">
              Limitations
            </h2>
            <ul className="mt-2 space-y-1.5 text-xs text-zinc-400">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-zinc-600">•</span>
                <span>
                  Casualty figures are based on reported numbers and may be
                  incomplete or revised. Fog of war is real.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-zinc-600">•</span>
                <span>
                  Coordinates are approximate (city/site level), not precise
                  strike locations.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-zinc-600">•</span>
                <span>
                  Source perspectives vary. We include reporting from all sides
                  but label state-affiliated media accordingly.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-zinc-600">•</span>
                <span>
                  This is not a military intelligence tool. It is an educational
                  resource built from open-source information.
                </span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-zinc-200">
              Editorial policy
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              War Library presents factual data without editorial commentary.
              Event descriptions are written in neutral, factual language. Where
              claims conflict between parties, both perspectives are noted.
              Source attribution is mandatory — no event is displayed without a
              traceable source.
            </p>
          </section>

          <section className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
            <h2 className="text-sm font-semibold text-zinc-200">
              Open source
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              War Library is an open-source project. The code, data pipeline
              configuration, and methodology are publicly available for review,
              contribution, and accountability.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-zinc-200">
              Contact
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              To report an error, suggest a correction, or provide feedback,
              contact us at{" "}
              <span className="text-zinc-300">warlibrary@midatlantic.ai</span>.
              We take data accuracy seriously and will investigate all reports.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-zinc-200">
              Privacy Policy
            </h2>
            <div className="mt-2 space-y-2 text-xs leading-relaxed text-zinc-400">
              <p>
                War Library respects your privacy. Here is exactly what we
                collect and why:
              </p>
              <ul className="space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-zinc-600">•</span>
                  <span>
                    <strong className="text-zinc-300">IP addresses</strong> are
                    used temporarily for rate limiting AI questions (10/hour).
                    They are stored in server memory only and are lost on
                    restart. We do not log or persist IP addresses.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-zinc-600">•</span>
                  <span>
                    <strong className="text-zinc-300">Questions you ask</strong>{" "}
                    are sent to Anthropic&apos;s Claude AI for processing. They are
                    not stored by War Library. Anthropic&apos;s privacy policy
                    applies to AI processing.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-zinc-600">•</span>
                  <span>
                    <strong className="text-zinc-300">Local storage</strong> is
                    used in your browser to remember your last visit date and
                    briefing preferences. No cookies are set for tracking.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-zinc-600">•</span>
                  <span>
                    <strong className="text-zinc-300">Push notifications</strong>{" "}
                    — if you enable breaking event alerts, your browser generates
                    an anonymous push subscription token. We store only this token
                    (no name, email, IP, or device info) to deliver alerts. You
                    can unsubscribe at any time through your browser settings.
                    Expired tokens are automatically removed.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-zinc-600">•</span>
                  <span>
                    <strong className="text-zinc-300">No analytics trackers</strong>{" "}
                    are used. No Google Analytics, no Facebook Pixel, no ad
                    networks. Cloudflare provides anonymous traffic statistics.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-zinc-600">•</span>
                  <span>
                    <strong className="text-zinc-300">No data is sold</strong>{" "}
                    or shared with third parties. War Library has no commercial
                    interest in your data.
                  </span>
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-zinc-200">
              Terms of Use
            </h2>
            <div className="mt-2 space-y-2 text-xs leading-relaxed text-zinc-400">
              <p>
                War Library is provided as-is for informational and educational
                purposes. By using this site you agree to the following:
              </p>
              <ul className="space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-zinc-600">•</span>
                  <span>
                    This is not a military intelligence tool. Do not use it
                    for operational military decisions.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-zinc-600">•</span>
                  <span>
                    Casualty figures and event details are based on open-source
                    reporting and may contain errors. Always verify critical
                    information against primary sources.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-zinc-600">•</span>
                  <span>
                    AI-generated answers may contain inaccuracies. They are
                    analytical summaries, not authoritative statements.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-zinc-600">•</span>
                  <span>
                    Abuse of the AI system (prompt injection, off-topic use,
                    excessive requests) may result in your access being
                    temporarily restricted.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-zinc-600">•</span>
                  <span>
                    Donation links direct to independent humanitarian
                    organizations. War Library does not collect, process, or
                    handle any donations.
                  </span>
                </li>
              </ul>
            </div>
          </section>

          <div className="pb-4 text-center text-xs text-zinc-700">
            Last updated: March 2026
          </div>
        </div>
      </div>
    </div>
  );
}
