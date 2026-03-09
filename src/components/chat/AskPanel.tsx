"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConflictEvent } from "@/types";

interface AskPanelProps {
  events: ConflictEvent[];
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  timestamp: Date;
}

const SUGGESTED_QUESTIONS = [
  {
    category: "Situation",
    questions: [
      "What is happening right now?",
      "How did this war start?",
      "Which countries are involved and why?",
      "What is the Strait of Hormuz crisis?",
    ],
  },
  {
    category: "Impact",
    questions: [
      "How many civilians have been killed?",
      "How is this affecting oil prices?",
      "What is happening in Lebanon?",
      "Why was Cyprus attacked?",
    ],
  },
  {
    category: "Factions",
    questions: [
      "Who is Hezbollah and why are they involved?",
      "What are the Houthis doing?",
      "What is Russia's role in this war?",
      "What is Iran's military capability now?",
    ],
  },
];

const API_BASE = "/api";

export default function AskPanel({ events }: AskPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [remaining, setRemaining] = useState(10);
  const MAX_QUESTIONS_PER_HOUR = 10;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleAsk = useCallback(
    async (question: string) => {
      if (!question.trim() || loading) return;

      const userMsg: ChatMessage = {
        role: "user",
        content: question.trim(),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);

      try {
        const res = await fetch(`${API_BASE}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: question.trim() }),
        });
        if (res.ok) {
          const json = await res.json();
          const data = json.data;
          if (typeof data.remaining === "number") {
            setRemaining(data.remaining);
          }
          const assistantMsg: ChatMessage = {
            role: "assistant",
            content: data.answer,
            sources: data.sources,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, assistantMsg]);
        } else if (res.status === 429) {
          setRemaining(0);
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content:
                "Rate limit reached. You can ask up to 10 questions per hour. Please wait a bit before asking again.",
              timestamp: new Date(),
            },
          ]);
        } else if (res.status === 503) {
          const localAnswer = generateLocalAnswer(question.trim(), events);
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: localAnswer,
              sources: ["Local event data"],
              timestamp: new Date(),
            },
          ]);
        } else {
          const json = await res.json().catch(() => ({}));
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: json.error || "Something went wrong. Try again.",
              timestamp: new Date(),
            },
          ]);
        }
      } catch {
        const localAnswer = generateLocalAnswer(question.trim(), events);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: localAnswer,
            sources: ["Local event data"],
            timestamp: new Date(),
          },
        ]);
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [events, loading]
  );

  const questionsUsed = MAX_QUESTIONS_PER_HOUR - remaining;

  return (
    <div className="flex h-full flex-col bg-[#0a0a0a]">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto" role="log" aria-live="polite" aria-label="Chat messages">
        {messages.length === 0 ? (
          /* Empty state — show welcome + suggested questions */
          <div className="p-4">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <h2 className="text-sm font-semibold text-zinc-200">
                War Library AI
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                Ask anything about the conflict. Powered by AI with{" "}
                {events.length}+ verified events.
              </p>
            </div>

            <div className="space-y-4">
              {SUGGESTED_QUESTIONS.map((group) => (
                <div key={group.category}>
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                    {group.category}
                  </div>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {group.questions.map((q) => (
                      <button
                        key={q}
                        onClick={() => handleAsk(q)}
                        disabled={loading}
                        className="rounded-lg border border-zinc-800/50 bg-zinc-900/30 p-2.5 text-left text-xs text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800/50 disabled:opacity-50"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-4 text-center text-[10px] text-zinc-600">
              {MAX_QUESTIONS_PER_HOUR} questions/hour &middot; answers may take a few seconds
            </p>
          </div>
        ) : (
          /* Chat messages */
          <div className="space-y-1 p-4">
            {messages.map((msg, i) => (
              <div key={i}>
                {msg.role === "user" ? (
                  /* User message */
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-zinc-700 px-3.5 py-2.5 text-sm text-zinc-100">
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  /* Assistant message */
                  <div className="flex gap-2.5">
                    <div className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-zinc-800">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-500">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    </div>
                    <div className="min-w-0 max-w-[90%]">
                      <div className="prose-chat text-sm leading-relaxed text-zinc-300">
                        <FormattedAnswer text={msg.content} />
                      </div>
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {msg.sources.map((s) => (
                            <span
                              key={s}
                              className="rounded-full bg-zinc-800/80 px-2 py-0.5 text-[10px] text-zinc-500"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className="flex gap-2.5">
                <div className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-zinc-800">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-500">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div className="rounded-2xl rounded-bl-sm bg-zinc-900/50 px-4 py-3">
                  <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}

            {/* Quick follow-up suggestions */}
            {!loading && messages.length > 0 && messages.length < 12 && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {SUGGESTED_QUESTIONS.flatMap((g) => g.questions)
                  .filter(
                    (q) =>
                      !messages.some(
                        (m) => m.role === "user" && m.content === q
                      )
                  )
                  .slice(0, 4)
                  .map((q) => (
                    <button
                      key={q}
                      onClick={() => handleAsk(q)}
                      className="rounded-full border border-zinc-800/50 px-3 py-1.5 text-xs text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-300"
                    >
                      {q}
                    </button>
                  ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="border-t border-zinc-800 bg-[#0a0a0a] p-3">
        {questionsUsed > 0 && remaining <= 5 && (
          <div className="mb-2 text-center text-[10px] text-zinc-600">
            {remaining} question{remaining !== 1 ? "s" : ""} remaining this hour
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAsk(input);
          }}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about the conflict..."
            aria-label="Ask a question about the conflict"
            maxLength={500}
            disabled={loading}
            className="flex-1 rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-zinc-600 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-zinc-700 text-zinc-200 transition-colors hover:bg-zinc-600 disabled:opacity-30"
            aria-label="Send"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Markdown-lite renderer — handles headers, bold, bullets, tables, line breaks
// ---------------------------------------------------------------------------
function FormattedAnswer({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Table detection — | col | col |
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      elements.push(<MarkdownTable key={i} lines={tableLines} />);
      continue;
    }

    // H1: # Header
    if (line.startsWith("# ")) {
      elements.push(
        <h3 key={i} className="mb-1 mt-3 text-sm font-bold text-zinc-100 first:mt-0">
          <InlineFormat text={line.slice(2)} />
        </h3>
      );
      i++;
      continue;
    }

    // H2: ## Header
    if (line.startsWith("## ")) {
      elements.push(
        <h4 key={i} className="mb-1 mt-3 text-sm font-semibold text-zinc-200 first:mt-0">
          <InlineFormat text={line.slice(3)} />
        </h4>
      );
      i++;
      continue;
    }

    // H3: ### Header
    if (line.startsWith("### ")) {
      elements.push(
        <h5 key={i} className="mb-0.5 mt-2 text-xs font-semibold uppercase tracking-wide text-zinc-400 first:mt-0">
          <InlineFormat text={line.slice(4)} />
        </h5>
      );
      i++;
      continue;
    }

    // Bullet list: - item or * item
    if (/^[-*]\s/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s/, ""));
        i++;
      }
      elements.push(
        <ul key={i} className="my-1 space-y-0.5 pl-3">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-1.5 text-sm">
              <span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-zinc-600" />
              <span><InlineFormat text={item} /></span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list: 1. item
    if (/^\d+\.\s/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s/, ""));
        i++;
      }
      elements.push(
        <ol key={i} className="my-1 space-y-0.5 pl-3">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-1.5 text-sm">
              <span className="mt-0.5 flex-shrink-0 text-xs text-zinc-500">{j + 1}.</span>
              <span><InlineFormat text={item} /></span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={i} className="my-1 text-sm">
        <InlineFormat text={line} />
      </p>
    );
    i++;
  }

  return <>{elements}</>;
}

// Inline formatting: **bold**, *italic*
function InlineFormat({ text }: { text: string }): React.ReactNode {
  // Split on **bold** and *italic* patterns
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold text-zinc-100">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
          return (
            <em key={i} className="italic text-zinc-400">
              {part.slice(1, -1)}
            </em>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// Simple table renderer
function MarkdownTable({ lines }: { lines: string[] }) {
  const parseRow = (line: string): string[] =>
    line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());

  // Filter out separator rows (|---|---|)
  const dataLines = lines.filter(
    (l) => l.replace(/[|\s-:]/g, "").length > 0
  );

  if (dataLines.length === 0) return null;

  const header = parseRow(dataLines[0]);
  const rows = dataLines.slice(1).map(parseRow);

  return (
    <div className="my-2 overflow-x-auto rounded-lg border border-zinc-800/50">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900/50">
            {header.map((cell, i) => (
              <th key={i} className="px-2.5 py-1.5 font-semibold text-zinc-300">
                <InlineFormat text={cell} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-zinc-800/30 last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="px-2.5 py-1.5 text-zinc-400">
                  <InlineFormat text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function generateLocalAnswer(
  question: string,
  events: ConflictEvent[]
): string {
  const q = question.toLowerCase();
  const totalKilled = events.reduce(
    (sum, e) => sum + (e.fatalities || 0),
    0
  );
  const countries = [...new Set(events.map((e) => e.country))];
  const latestEvents = [...events]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  if (q.includes("casualt") || q.includes("kill") || q.includes("dead") || q.includes("death")) {
    return `Based on tracked events, at least **${totalKilled.toLocaleString()} fatalities** have been reported across ${countries.length} countries.\n\n*Note: actual figures are likely higher due to fog of war and incomplete reporting.*`;
  }

  if (q.includes("country") || q.includes("countries") || q.includes("involved")) {
    return `**${countries.length} countries** have been directly affected:\n\n${countries.map(c => `- ${c}`).join("\n")}\n\nThe conflict spans from Cyprus in the eastern Mediterranean to the Indian Ocean.`;
  }

  if (q.includes("latest") || q.includes("recent") || q.includes("now") || q.includes("today")) {
    const summary = latestEvents
      .map(
        (e) =>
          `- **${e.event_type.replace(/_/g, " ")}** in ${e.region}, ${e.country}: ${e.description} *(${e.source})*`
      )
      .join("\n");
    return `## Most Recent Events\n\n${summary}`;
  }

  return `I have **${events.length} tracked events** across ${countries.length} countries. The AI service is temporarily unavailable — please try again in a moment.`;
}
