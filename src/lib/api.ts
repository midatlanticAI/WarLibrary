import type { ConflictEvent, Faction } from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  return json.data;
}

export async function getEvents(filters?: Record<string, string>): Promise<ConflictEvent[]> {
  const params = new URLSearchParams(filters);
  return fetchAPI<ConflictEvent[]>(`/events?${params}`);
}

export async function getEvent(id: string): Promise<ConflictEvent> {
  return fetchAPI<ConflictEvent>(`/events/${id}`);
}

export async function getFactions(): Promise<Faction[]> {
  return fetchAPI<Faction[]>('/factions');
}

export async function askQuestion(question: string): Promise<{ answer: string; sources: string[]; highlighted_events: string[] }> {
  return fetchAPI('/chat/ask', {
    method: 'POST',
    body: JSON.stringify({ question }),
  });
}
