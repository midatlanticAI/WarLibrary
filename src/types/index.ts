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
  civilian_impact?: string;  // e.g., "500+ displaced", "hospital damaged", "aid convoy blocked"
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
