export interface ConflictEvent {
  id: string;
  date: string;
  event_type: 'battle' | 'explosion' | 'violence_against_civilians' | 'strategic_development' | 'protest' | 'airstrike' | 'missile_attack' | 'drone_attack';
  description: string;
  latitude: number;
  longitude: number;
  country: string;
  region: string;
  actors: string[];
  fatalities: number | null;
  source: string;
  source_url: string | null;
  created_at: string;
  confidence?: number;           // 0.0 to 1.0
  verification_status?: "confirmed" | "reported" | "claimed" | "disputed" | "unconfirmed";
  location_precision?: "exact" | "city" | "region" | "country";
  civilian_impact?: string | null;  // e.g., "500+ displaced", "hospital damaged", "aid convoy blocked"
  // Grounded fields (2026-10-29, see /codebook). Null on legacy rows.
  conflict_id?: string;
  sub_event_type?: string | null;
  evidence_quote?: string | null;
  fatalities_min?: number | null;
  fatalities_max?: number | null;
  fatalities_attribution?: string | null;
  sources?: { name: string; url: string | null; fetched_at?: string }[];
  source_count?: number;
  actor1?: string | null;
  actor2?: string | null;
  actor1_type?: string | null;
  actor2_type?: string | null;
  geo_source?: "article" | "gazetteer" | "centroid" | "legacy";
  first_reported_at?: string | null;
  revision?: number;
  updated_at?: string | null;
  // Set by /api/events?lang=…: the language `description` is in ("en" when
  // no translation exists) and whether it is a machine translation of the
  // English record. See src/lib/translation-store.ts.
  description_lang?: string;
  translated?: boolean;
  description_en?: string;
  civilian_impact_en?: string | null;
}

export interface Faction {
  id: string;
  name: string;
  type: 'state' | 'non_state' | 'coalition';
  country: string | null;
  allies: string[];
  description: string;
  color: string; // hex color for map rendering
}

export interface MapViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

export interface TimelineRange {
  start: string; // ISO date
  end: string;   // ISO date
}

export interface EventFilter {
  event_types: string[];
  factions: string[];
  countries: string[];
  date_range: TimelineRange;
  min_fatalities: number | null;
}
