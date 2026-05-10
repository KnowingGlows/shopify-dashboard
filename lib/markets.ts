// International expansion markets registry.
// Source of truth for the country/language dropdowns on the Funnels page,
// the International Ads tracker, and any future market-scoped surface.
// Country names are stored in long form per user preference.

export type Phase = 1 | 2 | 3 | 4;

export interface Market {
  country: string;
  languages: string[];   // funnel languages (not necessarily official country languages)
  phase: Phase;
}

export const MARKETS: Market[] = [
  // Phase 1 — base launch
  { country: 'Netherlands',     languages: ['Dutch'],                                 phase: 1 },
  { country: 'Belgium',         languages: ['Dutch'],                                 phase: 1 },
  { country: 'Germany',         languages: ['German'],                                phase: 1 },
  { country: 'Austria',         languages: ['German'],                                phase: 1 },
  { country: 'Ireland',         languages: ['English'],                               phase: 1 },

  // Phase 2
  { country: 'France',          languages: ['French'],                                phase: 2 },
  { country: 'Italy',           languages: ['Italian'],                               phase: 2 },
  { country: 'New Zealand',     languages: ['English'],                               phase: 2 },
  { country: 'Sweden',          languages: ['Swedish'],                               phase: 2 },
  { country: 'Spain',           languages: ['Spanish'],                               phase: 2 },
  { country: 'Norway',          languages: ['Norwegian'],                             phase: 2 },
  { country: 'Finland',         languages: ['Finnish'],                               phase: 2 },
  { country: 'Denmark',         languages: ['Danish'],                                phase: 2 },
  { country: 'Singapore',       languages: ['English'],                               phase: 2 },
  { country: 'Turkey',          languages: ['Turkish'],                               phase: 2 },
  { country: 'United Kingdom',  languages: ['English'],                               phase: 2 },
  { country: 'Mexico',          languages: ['Spanish (Mexico)'],                      phase: 2 },
  { country: 'Luxembourg',      languages: ['Luxembourgish', 'French', 'German'],     phase: 2 },
  { country: 'UAE',             languages: ['English'],                               phase: 2 },

  // Phase 3
  { country: 'Japan',           languages: ['Japanese'],                              phase: 3 },
  { country: 'Greece',          languages: ['Greek'],                                 phase: 3 },
  { country: 'Czech Republic',  languages: ['Czech'],                                 phase: 3 },
  { country: 'Poland',          languages: ['Polish'],                                phase: 3 },
  { country: 'Portugal',        languages: ['Portuguese'],                            phase: 3 },
  { country: 'Hungary',         languages: ['Hungarian'],                             phase: 3 },
  { country: 'Brazil',          languages: ['Portuguese'],                            phase: 3 },

  // Phase 4
  { country: 'Canada',          languages: ['English'],                               phase: 4 },
  { country: 'Australia',       languages: ['English'],                               phase: 4 },
  { country: 'Saudi Arabia',    languages: ['English'],                               phase: 4 },
  { country: 'South Korea',     languages: ['Korean'],                                phase: 4 },
];

export function getCountries(): string[] {
  return MARKETS.map((m) => m.country);
}

export function getLanguagesForCountry(country: string): string[] {
  return MARKETS.find((m) => m.country === country)?.languages ?? [];
}

export function getPhaseForCountry(country: string): Phase | null {
  return MARKETS.find((m) => m.country === country)?.phase ?? null;
}
