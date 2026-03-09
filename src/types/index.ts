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
