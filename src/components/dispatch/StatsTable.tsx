import type { DispatchStats, StatsDiff } from "@/lib/dispatch-core.cjs";
import type { Translate } from "@/i18n/server";
import { formatNumberFor } from "@/i18n/server";
import type { Locale } from "@/i18n/locale";

function Delta({ value, pct, locale, t }: { value: number; pct: number | null; locale: Locale; t: Translate }) {
  if (value === 0) return <span className="text-zinc-600">{t("pages.noChange")}</span>;
  const sign = value > 0 ? "+" : "−";
  const cls = value > 0 ? "text-red-300/80" : "text-emerald-300/80";
  return (
    <span className={cls} dir="ltr">
      {sign}
      {formatNumberFor(locale, Math.abs(value))}
      {pct !== null && <span className="text-zinc-500"> ({sign}{formatNumberFor(locale, Math.abs(pct))}%)</span>}
    </span>
  );
}

/**
 * "By the numbers": every figure here is computed in code from the dataset
 * (see dispatch-core.computeStats). The change column is against the
 * immediately preceding period of the same length.
 */
export default function StatsTable({ stats, diff, priorLabel, locale, t }: { stats: DispatchStats; diff: StatsDiff; priorLabel: string; locale: Locale; t: Translate }) {
  const n = (v: number) => formatNumberFor(locale, v);
  const verification = Object.entries(stats.by_verification).sort((a, b) => b[1] - a[1]);
  const types = Object.entries(stats.by_type).slice(0, 8);
  const rows: { label: string; value: number; delta?: { value: number; pct: number | null } }[] = [
    { label: t("pages.eventsRecorded"), value: stats.events, delta: { value: diff.events, pct: diff.events_pct } },
    { label: t("pages.kineticLong"), value: stats.kinetic, delta: { value: diff.kinetic, pct: diff.kinetic_pct } },
    { label: t("pages.developmentsLong"), value: stats.developments },
    { label: t("pages.fatalitiesLong"), value: stats.fatalities, delta: { value: diff.fatalities, pct: diff.fatalities_pct } },
    { label: t("pages.civilianNoteEvents"), value: stats.civilian_impact_events },
    { label: t("pages.countriesWithEvents"), value: stats.countries },
    { label: t("pages.outletsCited"), value: stats.outlets },
  ];
  return (
    <div className="space-y-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-start text-xs uppercase tracking-wider text-zinc-500">
            <th className="py-1 text-start font-medium">{t("pages.measure")}</th>
            <th className="py-1 text-end font-medium">{t("pages.thisPeriod")}</th>
            <th className="py-1 text-end font-medium">{t("pages.vs", { prior: priorLabel })}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/60">
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="py-1.5 text-zinc-300">{row.label}</td>
              <td className="py-1.5 text-end font-semibold text-zinc-100">{n(row.value)}</td>
              <td className="py-1.5 text-end text-xs">
                {row.delta ? <Delta value={row.delta.value} pct={row.delta.pct} locale={locale} t={t} /> : <span className="text-zinc-600">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">{t("pages.byType")}</h3>
          <ul className="text-sm">
            {types.map(([type, count]) => (
              <li key={type} className="flex justify-between border-b border-zinc-800/60 py-1">
                <span className="text-zinc-300">{t(`eventTypes.${type}`)}</span>
                <span className="text-zinc-100">{n(count)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">{t("pages.byVerification")}</h3>
          <ul className="text-sm">
            {verification.map(([status, count]) => (
              <li key={status} className="flex justify-between border-b border-zinc-800/60 py-1">
                <span className="text-zinc-300">{t(`eventPanel.${status}`)}</span>
                <span className="text-zinc-100">{n(count)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
