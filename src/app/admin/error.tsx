"use client";

import { useEffect } from "react";

/**
 * Error boundary for the admin dashboard.
 *
 * The dashboard reads JSON off disk and casts it straight to typed shapes,
 * then dereferences without guards — `stats.errors.length`,
 * `Object.keys(stats.source_mix)`, `event.event_type.replace(...)`. The live
 * dataset holds tens of thousands of records that accumulated before schema
 * validation existed, so a single malformed entry could throw during render
 * and take the entire dashboard to a blank screen, including the log tab an
 * operator would use to work out what happened.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin] Dashboard render error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-zinc-100">
      <div className="w-full max-w-lg rounded-lg border border-red-900/50 bg-zinc-900 p-6">
        <h1 className="text-lg font-semibold text-red-400">
          The dashboard failed to render
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          This is usually a malformed record in the pipeline data rather than a
          problem with the server itself. The site and the API are unaffected.
        </p>

        <pre className="mt-4 max-h-48 overflow-auto rounded bg-black/50 p-3 text-xs text-zinc-300">
          {error.message}
        </pre>

        {error.digest && (
          <p className="mt-2 font-mono text-xs text-zinc-500">
            digest: {error.digest}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded bg-red-900/60 px-4 py-2 text-sm font-medium hover:bg-red-900"
          >
            Try again
          </button>
          <a
            href="/api/admin/dashboard"
            className="rounded border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800"
          >
            View raw dashboard JSON
          </a>
        </div>

        <p className="mt-4 text-xs text-zinc-500">
          If this persists, check <code>pipeline-stats.json</code> and{" "}
          <code>pipeline-history.json</code> for entries missing expected
          fields.
        </p>
      </div>
    </div>
  );
}
