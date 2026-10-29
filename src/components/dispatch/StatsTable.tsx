import type { DispatchStats, StatsDiff } from "@/lib/dispatch-core.cjs";
import { formatNumber, eventTypeLabel } from "@/lib/site";

function Delta({ value, pct }: { value: number; pct: number | null }) {
  if (value === 0) return <span className="text-zinc-600">no change</span>;
  const sign = value > 0 ? "+" : "−";
  const cls = value > 0 ? "text-red-300/80" : "text-emerald-300/80";
  return (
    <span className={cls}>
      {sign}
      {formatNumber(Math.abs(value))}
      {pct !== null && <span className="text-zinc-500"> ({sign}{Math.abs(pct)}%)</span>}
    </span>
  );
}

/**
 * "By the numbers": every figure here is computed in code from the dataset
 * (see dispatch-core.computeStats). The change column is against the
 * immediately preceding period of the same length.
 */
export default function StatsTable({ stats, diff, priorLabel }: { stats: DispatchStats; diff: StatsDiff; priorLabel: string }) {
  const verification = Object.entries(stats.by_verification).sort((a, b) => b[1] - a[1]);
  const types = Object.entries(stats.by_type).slice(0, 8);
  return (
    <div className="space-y-4">
      <table className="w-full text-sm">
        <caption className="sr-only">Headline numbers for the period with change against {priorLabel}</caption>
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-zinc-500">
            <th className="py-1 font-medium">Measure</th>
            <th className="py-1 text-right font-medium">This period</th>
            <th className="py-1 text-right font-medium">vs {priorLabel}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/60">
          <tr>
            <td className="py-1.5 text-zinc-300">Events recorded</td>
            <td className="py-1.5 text-right font-semibold text-zinc-100">{formatNumber(stats.events)}</td>
            <td className="py-1.5 text-right text-xs"><Delta value={diff.events} pct={diff.events_pct} /></td>
          </tr>
          <tr>
            <td className="py-1.5 text-zinc-300">Kinetic events (strikes, attacks, battles)</td>
            <td className="py-1.5 text-right font-semibold text-zinc-100">{formatNumber(stats.kinetic)}</td>
            <td className="py-1.5 text-right text-xs"><Delta value={diff.kinetic} pct={diff.kinetic_pct} /></td>
          </tr>
          <tr>
            <td className="py-1.5 text-zinc-300">Developments (statements, diplomacy, deployments)</td>
            <td className="py-1.5 text-right font-semibold text-zinc-100">{formatNumber(stats.developments)}</td>
            <td className="py-1.5 text-right text-xs text-zinc-600">—</td>
          </tr>
          <tr>
            <td className="py-1.5 text-zinc-300">Fatalities, per-event figures as reported</td>
            <td className="py-1.5 text-right font-semibold text-zinc-100">{formatNumber(stats.fatalities)}</td>
            <td className="py-1.5 text-right text-xs"><Delta value={diff.fatalities} pct={diff.fatalities_pct} /></td>
          </tr>
          <tr>
            <td className="py-1.5 text-zinc-300">Events with a civilian-impact note</td>
            <td className="py-1.5 text-right font-semibold text-zinc-100">{formatNumber(stats.civilian_impact_events)}</td>
            <td className="py-1.5 text-right text-xs text-zinc-600">—</td>
          </tr>
          <tr>
            <td className="py-1.5 text-zinc-300">Countries with events</td>
            <td className="py-1.5 text-right font-semibold text-zinc-100">{formatNumber(stats.countries)}</td>
            <td className="py-1.5 text-right text-xs text-zinc-600">—</td>
          </tr>
          <tr>
            <td className="py-1.5 text-zinc-300">Distinct outlets cited</td>
            <td className="py-1.5 text-right font-semibold text-zinc-100">{formatNumber(stats.outlets)}</td>
            <td className="py-1.5 text-right text-xs text-zinc-600">—</td>
          </tr>
        </tbody>
      </table>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">By type</h3>
          <ul className="text-sm">
            {types.map(([type, n]) => (
              <li key={type} className="flex justify-between border-b border-zinc-800/60 py-1">
                <span className="text-zinc-300">{eventTypeLabel(type)}</span>
                <span className="text-zinc-100">{formatNumber(n)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">By verification</h3>
          <ul className="text-sm">
            {verification.map(([status, n]) => (
              <li key={status} className="flex justify-between border-b border-zinc-800/60 py-1">
                <span className="text-zinc-300">{status}</span>
                <span className="text-zinc-100">{formatNumber(n)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
