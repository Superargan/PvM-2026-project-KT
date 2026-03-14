import { QueryClient } from "@tanstack/react-query";

/**
 * All client-related query keys share the ["clients"] prefix.
 * This allows invalidateAllClientQueries to invalidate them all at once.
 */
export const clientKeys = {
  all: ["clients"] as const,
  list: (search?: string) => ["clients", "list", search] as const,
  detail: (id: string) => ["clients", "detail", id] as const,
  aanmeldingen: (search?: string) => ["clients", "aanmeldingen", search] as const,
  waitlist: (...args: string[]) => ["clients", "waitlist", ...args] as const,
  dashboard: (...args: string[]) => ["clients", "dashboard", ...args] as const,
  planning: ["clients", "planning"] as const,
  planningIntakes: (start: string, end: string) => ["clients", "planning-intakes", start, end] as const,
  planningAvailPanel: (area: string, age: string) => ["clients", "avail-panel", area, age] as const,
  planningAvailPanelData: (ids: string[]) => ["clients", "avail-panel-data", ids] as const,
  bySchool: ["clients", "by-school"] as const,
  rapportages: ["clients", "rapportages"] as const,
  groupComposer: ["clients", "group-composer"] as const,
  waitlistOverview: ["clients", "waitlist-overview"] as const,
  avail: ["clients", "avail"] as const,
  forProgram: ["clients", "for-program"] as const,
  /** Per-client area preferences (edit view) */
  areaPreferences: (clientId?: string) => ["clients", "area-preferences", clientId] as const,
  /** All area preferences system-wide — single source of truth, shared across components */
  allAreaPreferences: ["clients", "all-area-preferences"] as const,
  /** Override logs — single source of truth, shared across components */
  overrideLogs: ["clients", "override-logs"] as const,
  /** All client availability (unpaginated) — single source of truth */
  allAvailability: ["clients", "all-availability"] as const,
};

/** Shared area query key — use everywhere */
export const areaKeys = {
  all: ["areas"] as const,
};

/** Scenario query keys — separate prefix from clients */
export const scenarioKeys = {
  all: ["scenarios"] as const,
  detail: (id: string) => ["scenarios", id] as const,
};

/** School query keys — SSOT for all school-related queries */
export const schoolKeys = {
  all: ["schools"] as const,
  list: (search?: string) => ["schools", "list", search] as const,
  dropdown: ["schools", "dropdown"] as const,
  dashboard: ["schools", "dashboard"] as const,
  rapportages: ["schools", "rapportages"] as const,
};

/**
 * Invalidate ALL school-related queries in one call.
 * All keys start with ["schools"], so this matches everything.
 */
export function invalidateAllSchoolQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: schoolKeys.all });
}

/**
 * Invalidate ALL client-related queries in one call.
 * Because all keys start with ["clients"], this matches everything.
 */
export function invalidateAllClientQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ["clients"] });
}
