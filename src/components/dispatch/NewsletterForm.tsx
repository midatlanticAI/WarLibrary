"use client";

import { useState, type FormEvent } from "react";
import type { Locale } from "@/i18n/locale";

/**
 * The subscribe form. Posts to /api/newsletter, which sends a confirmation
 * email; nothing is subscribed until the reader opens that link. All
 * strings arrive from the server component so this stays free of the
 * i18n provider (the dispatch pages have none).
 */
export default function NewsletterForm({
  locale,
  labels,
}: {
  locale: Locale;
  labels: { email: string; placeholder: string; subscribe: string; sending: string; sent: string; error: string; invalid: string };
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error" | "invalid">("idle");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === "sending") return;
    const form = e.currentTarget;
    const website = (form.elements.namedItem("website") as HTMLInputElement | null)?.value ?? "";
    setState("sending");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, lang: locale, website }),
      });
      if (res.ok) {
        setState("sent");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setState(body.error === "invalid_email" ? "invalid" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "sent") {
    return <p className="mt-3 text-sm text-emerald-300 sm:mt-0" role="status">{labels.sent}</p>;
  }

  return (
    <form onSubmit={submit} className="mt-3 flex w-full flex-col gap-2 sm:mt-0 sm:w-auto sm:flex-row sm:items-center" noValidate>
      <label className="sr-only" htmlFor="newsletter-email">{labels.email}</label>
      <input
        id="newsletter-email"
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        required
        value={email}
        onChange={(ev) => setEmail(ev.target.value)}
        placeholder={labels.placeholder}
        dir="ltr"
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-zinc-500 sm:w-64"
      />
      {/* Honeypot: hidden from people, filled by bots. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      <button
        type="submit"
        disabled={state === "sending"}
        className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-black hover:bg-white disabled:opacity-60"
      >
        {state === "sending" ? labels.sending : labels.subscribe}
      </button>
      {(state === "error" || state === "invalid") && (
        <p className="text-xs text-red-300 sm:basis-full" role="alert">{state === "invalid" ? labels.invalid : labels.error}</p>
      )}
    </form>
  );
}
