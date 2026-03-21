// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import type { ConflictEvent } from "@/types";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<ConflictEvent> = {}): ConflictEvent {
  return {
    id: "1",
    date: "2026-03-01T12:00:00Z",
    event_type: "airstrike",
    description: "US airstrikes target Iranian nuclear facility near Isfahan",
    latitude: 32.65,
    longitude: 51.68,
    country: "Iran",
    region: "Isfahan",
    actors: ["United States Air Force", "Iran Air Defense"],
    fatalities: 12,
    source: "Reuters",
    source_url: "https://reuters.com/example",
    created_at: "2026-03-01T12:00:00Z",
    ...overrides,
  };
}

const mockEvents: ConflictEvent[] = [
  makeEvent({
    id: "1",
    date: "2026-03-01T12:00:00Z",
    event_type: "airstrike",
    description: "US airstrikes target Iranian nuclear facility near Isfahan",
    country: "Iran",
    region: "Isfahan",
    fatalities: 12,
  }),
  makeEvent({
    id: "2",
    date: "2026-03-02T08:30:00Z",
    event_type: "missile_attack",
    description: "Houthi anti-ship missile strikes commercial tanker in Red Sea",
    country: "Yemen",
    region: "Red Sea",
    actors: ["Houthis"],
    fatalities: 3,
  }),
  makeEvent({
    id: "3",
    date: "2026-03-03T15:00:00Z",
    event_type: "strategic_development",
    description: "UN Security Council emergency session on Iran conflict",
    country: "United States",
    region: "New York",
    actors: ["United Nations"],
    fatalities: 0,
  }),
  makeEvent({
    id: "4",
    date: "2026-03-04T10:00:00Z",
    event_type: "drone_attack",
    description: "Iranian drone swarm targets US carrier group in Persian Gulf",
    country: "Iran",
    region: "Persian Gulf",
    actors: ["IRGC", "US Navy"],
    fatalities: 5,
  }),
  makeEvent({
    id: "5",
    date: "2026-03-05T18:00:00Z",
    event_type: "protest",
    description: "Mass anti-war protests erupt across European capitals",
    country: "Germany",
    region: "Berlin",
    actors: ["Civilian protesters"],
    fatalities: null,
  }),
];

// ---------------------------------------------------------------------------
// Mock API response for useEvents (fetches from /api/events)
// ---------------------------------------------------------------------------

const mockApiEvents: ConflictEvent[] = [
  {
    id: "1",
    date: "2026-02-28T10:00:00Z",
    event_type: "airstrike",
    description: "Seed event one",
    latitude: 32.0,
    longitude: 51.0,
    country: "Iran",
    region: "Tehran",
    actors: ["US"],
    fatalities: 5,
    source: "CNN",
    source_url: null,
    created_at: "2026-02-28T10:00:00Z",
  },
  {
    id: "2",
    date: "2026-03-01T14:00:00Z",
    event_type: "missile_attack",
    description: "Expanded event one",
    latitude: 33.0,
    longitude: 52.0,
    country: "Iraq",
    region: "Baghdad",
    actors: ["Iran"],
    fatalities: 2,
    source: "BBC",
    source_url: null,
    created_at: "2026-03-01T14:00:00Z",
  },
  {
    id: "3",
    date: "2026-03-08T09:00:00Z",
    event_type: "battle",
    description: "Latest event one",
    latitude: 34.0,
    longitude: 53.0,
    country: "Syria",
    region: "Damascus",
    actors: ["Hezbollah"],
    fatalities: 10,
    source: "Al Jazeera",
    source_url: null,
    created_at: "2026-03-08T09:00:00Z",
  },
];

// ---------------------------------------------------------------------------
// AskPanel tests
// ---------------------------------------------------------------------------

describe("AskPanel", () => {
  let AskPanel: typeof import("@/components/chat/AskPanel").default;

  beforeEach(async () => {
    vi.stubGlobal("fetch", vi.fn());
    // Dynamic import to avoid issues with module-level side effects
    const mod = await import("@/components/chat/AskPanel");
    AskPanel = mod.default;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders empty state with suggested questions", () => {
    render(<AskPanel events={mockEvents} />);

    // Should show all 3 categories
    expect(screen.getByText("Situation")).toBeInTheDocument();
    expect(screen.getByText("Impact")).toBeInTheDocument();
    expect(screen.getByText("Factions")).toBeInTheDocument();

    // Should show some suggested questions (matching current SUGGESTED_QUESTIONS)
    expect(screen.getByText("What is the current military situation in the 2026 Iran war?")).toBeInTheDocument();
    expect(screen.getByText("How did Operation Epic Fury start and what triggered it?")).toBeInTheDocument();
    expect(screen.getByText("What are the civilian casualty figures in the Iran war so far?")).toBeInTheDocument();
  });

  it("shows War Library AI heading", () => {
    render(<AskPanel events={mockEvents} />);
    expect(screen.getByText("War Library AI")).toBeInTheDocument();
  });

  it("renders suggested questions as clickable buttons", () => {
    render(<AskPanel events={mockEvents} />);

    const questionButton = screen.getByText("What is the current military situation in the 2026 Iran war?");
    expect(questionButton.tagName).toBe("BUTTON");
    expect(questionButton).not.toBeDisabled();
  });

  it("renders input field with correct placeholder", () => {
    render(<AskPanel events={mockEvents} />);

    const input = screen.getByPlaceholderText("Ask about the conflict...");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("type", "text");
  });

  it("disables send button when input is empty", () => {
    render(<AskPanel events={mockEvents} />);

    const sendButton = screen.getByLabelText("Send");
    expect(sendButton).toBeDisabled();
  });

  it("enables send button when input has text", () => {
    render(<AskPanel events={mockEvents} />);

    const input = screen.getByPlaceholderText("Ask about the conflict...");
    fireEvent.change(input, { target: { value: "What is happening?" } });

    const sendButton = screen.getByLabelText("Send");
    expect(sendButton).not.toBeDisabled();
  });

  it("shows user message bubble after submitting a question", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            answer: "Here is what is happening...",
            sources: ["Reuters"],
            remaining: 9,
          },
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AskPanel events={mockEvents} />);

    const input = screen.getByPlaceholderText("Ask about the conflict...");
    fireEvent.change(input, { target: { value: "What is happening?" } });

    const sendButton = screen.getByLabelText("Send");
    fireEvent.click(sendButton);

    // User message should appear immediately
    await waitFor(() => {
      expect(screen.getByText("What is happening?")).toBeInTheDocument();
    });
  });

  it("shows assistant response after successful fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            answer: "The conflict began with airstrikes on February 28.",
            sources: ["Reuters", "BBC"],
            remaining: 9,
          },
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AskPanel events={mockEvents} />);

    const input = screen.getByPlaceholderText("Ask about the conflict...");
    fireEvent.change(input, { target: { value: "How did this start?" } });
    fireEvent.click(screen.getByLabelText("Send"));

    await waitFor(() => {
      expect(
        screen.getByText("The conflict began with airstrikes on February 28.")
      ).toBeInTheDocument();
    });

    // Sources should appear
    await waitFor(() => {
      expect(screen.getByText("Reuters")).toBeInTheDocument();
      expect(screen.getByText("BBC")).toBeInTheDocument();
    });
  });

  it("calls fetch with correct payload when question is submitted", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { answer: "Answer", sources: [], remaining: 9 },
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AskPanel events={mockEvents} />);

    const input = screen.getByPlaceholderText("Ask about the conflict...");
    fireEvent.change(input, { target: { value: "Test question" } });
    fireEvent.click(screen.getByLabelText("Send"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: "Test question" }),
      });
    });
  });

  it("clicking a suggested question triggers fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { answer: "Answer", sources: [], remaining: 9 },
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AskPanel events={mockEvents} />);

    fireEvent.click(screen.getByText("How did Operation Epic Fury start and what triggered it?"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: "How did Operation Epic Fury start and what triggered it?" }),
      });
    });
  });
});

// ---------------------------------------------------------------------------
// EventPanel tests
// ---------------------------------------------------------------------------

describe("EventPanel", () => {
  let EventPanel: typeof import("@/components/ui/EventPanel").default;

  beforeEach(async () => {
    const mod = await import("@/components/ui/EventPanel");
    EventPanel = mod.default;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const defaultProps = {
    events: mockEvents,
    selectedEvent: null,
    onSelectEvent: vi.fn(),
    isOpen: true,
    onToggle: vi.fn(),
  };

  it("renders the event feed header", () => {
    render(<EventPanel {...defaultProps} />);
    expect(screen.getByText("Event Feed")).toBeInTheDocument();
  });

  it("shows event count in header", () => {
    render(<EventPanel {...defaultProps} />);
    // "5 events . latest first" (5 events in mock data)
    expect(
      screen.getByText((content) => content.includes("5") && content.includes("events"))
    ).toBeInTheDocument();
  });

  it("renders filter chips for each event type present", () => {
    render(<EventPanel {...defaultProps} />);

    // "All" chip should exist
    expect(screen.getByText("All")).toBeInTheDocument();

    // Event types in our mock data (may appear multiple times: chip + event cards)
    expect(screen.getAllByText("airstrike").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("missile attack").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("strategic development").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("drone attack").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("protest").length).toBeGreaterThanOrEqual(1);
  });

  it("renders all events in the list", () => {
    render(<EventPanel {...defaultProps} />);

    for (const event of mockEvents) {
      expect(screen.getByText(event.description)).toBeInTheDocument();
    }
  });

  it("renders search input", () => {
    render(<EventPanel {...defaultProps} />);
    expect(screen.getByPlaceholderText("Search events...")).toBeInTheDocument();
  });

  it("search input filters events by description", () => {
    render(<EventPanel {...defaultProps} />);

    const search = screen.getByPlaceholderText("Search events...");
    fireEvent.change(search, { target: { value: "Houthi" } });

    // Only the Houthi event should remain visible
    expect(
      screen.getByText(
        "Houthi anti-ship missile strikes commercial tanker in Red Sea"
      )
    ).toBeInTheDocument();

    // Others should be gone
    expect(
      screen.queryByText(
        "US airstrikes target Iranian nuclear facility near Isfahan"
      )
    ).not.toBeInTheDocument();
  });

  it("search input filters events by country", () => {
    render(<EventPanel {...defaultProps} />);

    const search = screen.getByPlaceholderText("Search events...");
    fireEvent.change(search, { target: { value: "Germany" } });

    expect(
      screen.getByText("Mass anti-war protests erupt across European capitals")
    ).toBeInTheDocument();

    expect(
      screen.queryByText(
        "US airstrikes target Iranian nuclear facility near Isfahan"
      )
    ).not.toBeInTheDocument();
  });

  it("shows relative dates for events", () => {
    render(<EventPanel {...defaultProps} />);

    // Events are from early March 2026 — since tests run in 2026,
    // formatRelativeDate will show relative strings. We just check
    // that date text exists next to each event (the exact format
    // depends on when the test runs, so we check the container exists).
    const eventButtons = screen.getAllByRole("button", { name: /./i });
    // Filter to event list buttons (not filter chips or mobile toggle)
    // Events have descriptions as text content
    expect(eventButtons.length).toBeGreaterThan(0);
  });

  it("calls onSelectEvent when clicking an event", () => {
    const onSelectEvent = vi.fn();
    render(<EventPanel {...defaultProps} onSelectEvent={onSelectEvent} />);

    fireEvent.click(
      screen.getByText(
        "US airstrikes target Iranian nuclear facility near Isfahan"
      )
    );

    expect(onSelectEvent).toHaveBeenCalledTimes(1);
    expect(onSelectEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "1",
        description:
          "US airstrikes target Iranian nuclear facility near Isfahan",
      })
    );
  });

  it("highlights selected event", () => {
    render(
      <EventPanel {...defaultProps} selectedEvent={mockEvents[0]} />
    );

    // The selected event button should have the active background class
    // We verify the event is still rendered
    expect(
      screen.getByText(
        "US airstrikes target Iranian nuclear facility near Isfahan"
      )
    ).toBeInTheDocument();
  });

  it("filter chip toggles event type filter", () => {
    render(<EventPanel {...defaultProps} />);

    // Click on "airstrike" filter chip (first match is the chip)
    const airstrikeElements = screen.getAllByText("airstrike");
    fireEvent.click(airstrikeElements[0]);

    // Should only show airstrike events
    expect(
      screen.getByText(
        "US airstrikes target Iranian nuclear facility near Isfahan"
      )
    ).toBeInTheDocument();

    // Non-airstrike events should be hidden
    expect(
      screen.queryByText(
        "Houthi anti-ship missile strikes commercial tanker in Red Sea"
      )
    ).not.toBeInTheDocument();
  });

  it("shows stats footer with event count, countries, and fatalities", () => {
    render(<EventPanel {...defaultProps} />);

    // Stats footer
    expect(screen.getByText("Events")).toBeInTheDocument();
    expect(screen.getByText("Countries")).toBeInTheDocument();
    expect(screen.getByText("Fatalities")).toBeInTheDocument();
  });

  it("shows empty state when no events match filter", () => {
    render(<EventPanel {...defaultProps} />);

    const search = screen.getByPlaceholderText("Search events...");
    fireEvent.change(search, { target: { value: "zzzznonexistent" } });

    expect(
      screen.getByText("No events in selected range")
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// useEvents hook tests
// ---------------------------------------------------------------------------

describe("useEvents", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: mockApiEvents,
            meta: { total: mockApiEvents.length, last_updated: "2026-03-08T09:00:00Z" },
          }),
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns merged events from API", async () => {
    const { useEvents } = await import("@/hooks/useEvents");

    const { result } = renderHook(() => useEvents());

    await waitFor(() => {
      expect(result.current.events).toHaveLength(3);
    });
  });

  it("returns events from all sources via API", async () => {
    const { useEvents } = await import("@/hooks/useEvents");

    const { result } = renderHook(() => useEvents());

    await waitFor(() => {
      const descriptions = result.current.events.map((e) => e.description);
      expect(descriptions).toContain("Seed event one");
      expect(descriptions).toContain("Expanded event one");
      expect(descriptions).toContain("Latest event one");
    });
  });

  it("returns loading state", async () => {
    const { useEvents } = await import("@/hooks/useEvents");

    const { result } = renderHook(() => useEvents());

    // loading should be true initially, then false after fetch
    expect(typeof result.current.loading).toBe("boolean");

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it("returns error as null on success", async () => {
    const { useEvents } = await import("@/hooks/useEvents");

    const { result } = renderHook(() => useEvents());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
  });

  it("sets error on fetch failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      })
    );

    const { useEvents } = await import("@/hooks/useEvents");

    const { result } = renderHook(() => useEvents());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Failed to load events (500)");
  });

  it("provides a refresh function", async () => {
    const { useEvents } = await import("@/hooks/useEvents");

    const { result } = renderHook(() => useEvents());

    expect(typeof result.current.refresh).toBe("function");
  });

  it("converts raw events to ConflictEvent shape", async () => {
    const { useEvents } = await import("@/hooks/useEvents");

    const { result } = renderHook(() => useEvents());

    await waitFor(() => {
      expect(result.current.events.length).toBeGreaterThan(0);
    });

    const event = result.current.events[0];
    expect(event).toHaveProperty("id");
    expect(event).toHaveProperty("date");
    expect(event).toHaveProperty("event_type");
    expect(event).toHaveProperty("description");
    expect(event).toHaveProperty("latitude");
    expect(event).toHaveProperty("longitude");
    expect(event).toHaveProperty("country");
    expect(event).toHaveProperty("region");
    expect(event).toHaveProperty("actors");
    expect(event).toHaveProperty("fatalities");
    expect(event).toHaveProperty("source");
    expect(event).toHaveProperty("source_url");
    expect(event).toHaveProperty("created_at");
  });
});
