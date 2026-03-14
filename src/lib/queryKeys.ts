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
  /** Programs linked to a specific client */
  programs: (clientId: string) => ["clients", "programs", clientId] as const,
  /** Generated docs for a specific client */
  generatedDocs: (clientId: string) => ["clients", "generated-docs", clientId] as const,
  /** Assignments for a specific client */
  assignments: (clientId?: string) => ["clients", "assignments", clientId] as const,
  /** All assignments (overview) */
  allAssignments: ["clients", "all-assignments"] as const,
  /** Duplicate check */
  duplicateCheck: ["clients", "duplicate-check"] as const,
};

/** Shared area query key — use everywhere */
export const areaKeys = {
  all: ["areas"] as const,
  withNeighborhoods: ["areas", "with-neighborhoods"] as const,
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

/** Staff / medewerkers query keys */
export const staffKeys = {
  all: ["staff"] as const,
  medewerkers: ["staff", "medewerkers"] as const,
  trainers: ["staff", "trainers"] as const,
  trainerPrograms: (trainerId?: string) => ["staff", "trainer-programs", trainerId] as const,
  trainerDocs: (trainerId?: string) => ["staff", "trainer-docs", trainerId] as const,
  /** Trainings (programs) linked to a specific trainer */
  trainerTrainings: (staffId: string) => ["staff", "trainer-trainings", staffId] as const,
  /** Programs for invoice dropdown */
  trainerProgramsForInvoice: (staffId?: string) => ["staff", "trainer-programs-invoice", staffId] as const,
};

/** Document query keys */
export const documentKeys = {
  all: ["documents"] as const,
  templates: ["documents", "templates"] as const,
  generated: ["documents", "generated"] as const,
};

/** Program query keys */
export const programKeys = {
  all: ["programs"] as const,
  detail: (id: string) => ["programs", "detail", id] as const,
  bySchool: ["programs", "by-school"] as const,
  clientsActive: ["programs", "clients-active"] as const,
  linkable: ["programs", "linkable"] as const,
  /** Available/active programs for dropdowns */
  available: ["programs", "available"] as const,
  clients: (programId: string) => ["programs", "clients", programId] as const,
  sessions: (programId: string) => ["programs", "sessions", programId] as const,
  staff: (programId: string) => ["programs", "staff", programId] as const,
  sessionDocs: (sessionId: string) => ["programs", "session-docs", sessionId] as const,
  /** Staff for document generation context */
  staffForDocs: (programId: string) => ["programs", "staff-for-docs", programId] as const,
};

/** Training location query keys */
export const locationKeys = {
  all: ["training-locations"] as const,
  list: (search?: string) => ["training-locations", "list", search] as const,
  dropdown: ["training-locations", "dropdown"] as const,
};

/** Referrer query keys */
export const referrerKeys = {
  all: ["referrers"] as const,
  list: ["referrers", "list"] as const,
  dropdown: ["referrers", "dropdown"] as const,
};

/** Attendance query keys */
export const attendanceKeys = {
  all: ["attendance"] as const,
  rapportages: ["attendance", "rapportages"] as const,
};

/** Audit log query keys */
export const auditKeys = {
  all: ["audit"] as const,
  forClient: (clientId: string) => ["audit", "client", clientId] as const,
};

/** Rapportages-specific composite query keys */
export const rapportageKeys = {
  programClients: ["rapportages", "program-clients"] as const,
  programs: ["rapportages", "programs"] as const,
  sessions: ["rapportages", "sessions"] as const,
  attendance: ["rapportages", "attendance"] as const,
  programStaff: ["rapportages", "program-staff"] as const,
  generatedDocs: ["rapportages", "generated-docs"] as const,
  docTemplates: ["rapportages", "doc-templates"] as const,
};

/** Invoice query keys */
export const invoiceKeys = {
  all: ["invoices"] as const,
};

/** Planning query keys */
export const planningKeys = {
  availability: ["planning", "availability"] as const,
  clientAvailability: ["planning", "client-availability"] as const,
};

/** Availability validation query keys */
export const availabilityValidationKeys = {
  clients: ["availability-validation", "clients"] as const,
  data: (count: number) => ["availability-validation", "data", count] as const,
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

/**
 * Invalidate ALL staff-related queries in one call.
 */
export function invalidateAllStaffQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: staffKeys.all });
}

/**
 * Invalidate ALL document-related queries in one call.
 */
export function invalidateAllDocumentQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: documentKeys.all });
}
