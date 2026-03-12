import { differenceInYears, parseISO, addMonths, isAfter } from "date-fns";

export function calculateAge(dob: string | null): number | null {
  if (!dob) return null;
  return differenceInYears(new Date(), parseISO(dob));
}

export type AgeCategory = "5-7 jaar" | "8-12 jaar";
export type MatchType = "Primair" | "Reserve 1" | "Reserve 2" | "Reserve 3" | "Flexibel";

export function getAgeCategoryPlanning(dob: string | null): AgeCategory | null {
  const age = calculateAge(dob);
  if (age === null) return null;
  if (age >= 5 && age <= 7) return "5-7 jaar";
  if (age >= 8 && age <= 12) return "8-12 jaar";
  return null;
}

export function resolveAreaId(client: any): string | null {
  if (client.waitlist_area_id) return client.waitlist_area_id;
  return client.schools?.neighborhoods?.area_id ?? null;
}

export function getMatchType(
  client: any,
  targetAreaId: string,
  prefsByClient: Record<string, Record<string, number>>
): MatchType | null {
  const primaryAreaId = resolveAreaId(client);
  if (primaryAreaId === targetAreaId) return "Primair";

  const prefs = prefsByClient[client.id];
  if (prefs && prefs[targetAreaId]) {
    const order = prefs[targetAreaId];
    if (order === 1) return "Reserve 1";
    if (order === 2) return "Reserve 2";
    if (order === 3) return "Reserve 3";
  }

  if (client.all_areas_flexible) return "Flexibel";
  return null;
}

export const matchSortOrder: Record<MatchType, number> = {
  "Primair": 0,
  "Reserve 1": 1,
  "Reserve 2": 2,
  "Reserve 3": 3,
  "Flexibel": 4,
};

export const matchColors: Record<MatchType, string> = {
  "Primair": "bg-emerald-100 text-emerald-800 border-emerald-300",
  "Reserve 1": "bg-blue-100 text-blue-800 border-blue-300",
  "Reserve 2": "bg-violet-100 text-violet-800 border-violet-300",
  "Reserve 3": "bg-pink-100 text-pink-800 border-pink-300",
  "Flexibel": "bg-amber-100 text-amber-800 border-amber-300",
};

export const statusBadgeStyles: Record<string, { label: string; className: string }> = {
  intake_afgerond: { label: "Intake afgerond", className: "bg-blue-100 text-blue-800 border-blue-300" },
  wachtlijst: { label: "Wachtlijst", className: "bg-orange-100 text-orange-800 border-orange-300" },
};

export function getAgeGroup(dob: string | null): string {
  const age = calculateAge(dob);
  if (age === null) return "—";
  if (age >= 5 && age <= 7) return "5-7 jaar";
  if (age >= 8 && age <= 12) return "8-12 jaar";
  return `${age} jaar`;
}

/** Rapportage-specifieke leeftijdscategorie (fijnmaziger) */
export function getAgeCategoryReport(dob: string | null): string {
  if (!dob) return "Onbekend";
  const age = calculateAge(dob);
  if (age === null) return "Onbekend";
  if (age < 6) return "0-5";
  if (age < 10) return "6-9";
  if (age < 13) return "10-12";
  if (age < 16) return "13-15";
  return "16+";
}

/** Rapportage leeftijdslabel (planning-stijl) */
export function getAgeCategoryReportLabel(dob: string | null): string {
  if (!dob) return "Onbekend";
  const age = calculateAge(dob);
  if (age === null) return "Onbekend";
  if (age <= 7) return "5 - 7 jaar";
  return "8 - 12 jaar";
}

export const statusLabels: Record<string, string> = {
  nieuw: "Aanmelding",
  intake_gepland: "Intake gepland",
  intake_afgerond: "Intake afgerond",
  wachtlijst: "Wachtlijst",
  actief: "Deelnemer",
  training_afgerond: "Training afgerond",
  tussentijds_gestopt: "Tussentijds gestopt",
  niet_deelnemen: "Niet deelnemen",
};

export const statusStyles: Record<string, string> = {
  nieuw: "status-rood",
  intake_gepland: "status-oranje",
  intake_afgerond: "status-groen",
  wachtlijst: "status-oranje",
  actief: "status-groen",
  training_afgerond: "status-groen",
  tussentijds_gestopt: "status-rood",
  niet_deelnemen: "status-rood",
};

export const REQUIRED_CLIENT_CHECKS: { key: string; label: string; check: (c: any) => boolean; onlyStatuses?: string[] }[] = [
  { key: "date_of_birth", label: "Geboortedatum", check: (c) => !c.date_of_birth },
  { key: "school_id", label: "School", check: (c) => !c.school_id },
  { key: "guardian_phone", label: "Telefoon ouder", check: (c) => !c.guardian_phone },
  { key: "guardian_name", label: "Naam ouder", check: (c) => !c.guardian_name },
  { key: "waitlist_area_id", label: "Gebied", check: (c) => !c.waitlist_area_id, onlyStatuses: ["wachtlijst", "intake_afgerond", "actief"] },
  { key: "gender", label: "Geslacht", check: (c) => !c.gender },
  { key: "postal_code", label: "Postcode", check: (c) => !c.postal_code },
  { key: "consent_data_processing", label: "AVG-toestemming", check: (c) => !c.consent_data_processing },
];

export function getMissingFields(client: any): string[] {
  return REQUIRED_CLIENT_CHECKS
    .filter((ch) => {
      if (ch.onlyStatuses && !ch.onlyStatuses.includes(client.intake_status ?? "")) return false;
      return ch.check(client);
    })
    .map((ch) => ch.label);
}

export const allStatuses = Object.keys(statusLabels);

// ===== Centrale helpers (Stap 2) =====

/** Build preference map: clientId → { areaId: preference_order } */
export function buildPrefsByClientMap(
  preferences: { client_id: string; area_id: string; preference_order: number }[]
): Record<string, Record<string, number>> {
  const m: Record<string, Record<string, number>> = {};
  preferences.forEach((p) => {
    if (!m[p.client_id]) m[p.client_id] = {};
    m[p.client_id][p.area_id] = p.preference_order;
  });
  return m;
}

/** Build availability by client — only usable records (start < end, both present) */
export function buildAvailabilityByClient(
  availRecords: { client_id: string; available_date: string; start_time: string | null; end_time: string | null }[]
): Record<string, { dayOfWeek: number; dayName: string; startTime: string; endTime: string; date: string }[]> {
  const m: Record<string, { dayOfWeek: number; dayName: string; startTime: string; endTime: string; date: string }[]> = {};
  const dayNames = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
  availRecords.forEach((a) => {
    if (!a.start_time || !a.end_time || a.start_time >= a.end_time) return;
    if (!m[a.client_id]) m[a.client_id] = [];
    const dow = parseISO(a.available_date).getDay();
    m[a.client_id].push({
      dayOfWeek: dow,
      dayName: dayNames[dow],
      startTime: a.start_time,
      endTime: a.end_time,
      date: a.available_date,
    });
  });
  return m;
}

export interface AvailabilityProposal {
  dayName: string;
  startTime: string;
  endTime: string;
  overlap: number;
  total: number;
}

/** Get best day/time overlap for a set of clients */
export function getAvailabilityOverlap(
  clientIds: string[] | Set<string>,
  availByClient: Record<string, { dayOfWeek: number; dayName: string; startTime: string; endTime: string }[]>
): AvailabilityProposal | null {
  const results = getTopAvailabilityOverlaps(clientIds, availByClient, 1);
  return results.length > 0 ? results[0] : null;
}

/** Get top-N day/time overlap proposals for a set of clients, sorted by overlap score */
export function getTopAvailabilityOverlaps(
  clientIds: string[] | Set<string>,
  availByClient: Record<string, { dayOfWeek: number; dayName: string; startTime: string; endTime: string }[]>,
  maxResults = 3
): AvailabilityProposal[] {
  const ids = clientIds instanceof Set ? clientIds : new Set(clientIds);
  if (ids.size === 0) return [];
  const dayStats: Record<number, { count: number; dayName: string; starts: string[]; ends: string[] }> = {};

  ids.forEach((cid) => {
    const avail = availByClient[cid];
    if (!avail) return;
    const seenDays = new Set<number>();
    avail.forEach((a) => {
      if (seenDays.has(a.dayOfWeek)) return;
      seenDays.add(a.dayOfWeek);
      if (!dayStats[a.dayOfWeek]) {
        dayStats[a.dayOfWeek] = { count: 0, dayName: a.dayName, starts: [], ends: [] };
      }
      dayStats[a.dayOfWeek].count++;
      dayStats[a.dayOfWeek].starts.push(a.startTime);
      dayStats[a.dayOfWeek].ends.push(a.endTime);
    });
  });

  const entries = Object.values(dayStats).filter((d) => d.count >= 2);
  if (entries.length === 0) return [];
  entries.sort((a, b) => b.count - a.count);

  return entries.slice(0, maxResults).map((entry) => {
    const latestStart = entry.starts.sort().reverse()[0];
    const earliestEnd = entry.ends.sort()[0];
    return {
      dayName: entry.dayName,
      startTime: latestStart <= earliestEnd ? latestStart : entry.starts.sort()[0],
      endTime: latestStart <= earliestEnd ? earliestEnd : entry.ends.sort().reverse()[0],
      overlap: entry.count,
      total: ids.size,
    };
  });
}

/** Check if client has availability coverage for N months ahead */
export function hasAvailabilityCoverage(
  clientAvail: { date: string }[] | undefined,
  monthsAhead = 3
): boolean {
  if (!clientAvail || clientAvail.length === 0) return false;
  const now = new Date();
  const threshold = addMonths(now, monthsAhead);
  // Must have at least one future record AND at least one record beyond the threshold
  const hasFuture = clientAvail.some((a) => isAfter(parseISO(a.date), now));
  const hasLongTermCoverage = clientAvail.some((a) => isAfter(parseISO(a.date), threshold));
  return hasFuture && hasLongTermCoverage;
}

export type PlannabilityStatus =
  | "volledig_planbaar"
  | "planbaar_via_override"
  | "planbaar_via_reserve"
  | "incompleet"
  | "niet_planbaar";

export interface ClientDataCompleteness {
  hasAvailability: boolean;
  hasUsableAvailability: boolean;
  requiresAvailability: boolean;
  hasArea: boolean;
  hasReserveArea: boolean;
  hasNeighborhood: boolean;
  isOverridden: boolean;
}

/** Determine data completeness for a client */
export function getClientDataCompleteness(
  client: any,
  availByClient: Record<string, any[]>,
  prefsByClient: Record<string, Record<string, number>>,
  overriddenClientIds?: Set<string>
): ClientDataCompleteness {
  const status = client.intake_status ?? "nieuw";
  const requiresAvailability = status === "intake_afgerond" || status === "wachtlijst";
  const allAvail = availByClient[client.id];
  const hasAvailability = !!allAvail && allAvail.length > 0;
  const hasUsableAvailability = hasAvailability; // already filtered by buildAvailabilityByClient
  const hasArea = !!resolveAreaId(client);
  const prefs = prefsByClient[client.id];
  const hasReserveArea = !!prefs && Object.keys(prefs).length > 0;
  const hasNeighborhood = !!client.neighborhood_id;
  const isOverridden = overriddenClientIds?.has(client.id) ?? false;

  return { hasAvailability, hasUsableAvailability, requiresAvailability, hasArea, hasReserveArea, hasNeighborhood, isOverridden };
}

/** Determine plannability status from completeness */
export function getPlannabilityStatus(c: ClientDataCompleteness): PlannabilityStatus {
  if (!c.requiresAvailability) return "niet_planbaar";
  if (c.isOverridden) return "planbaar_via_override";
  if (c.hasArea && c.hasUsableAvailability) return "volledig_planbaar";
  if (!c.hasArea && (c.hasReserveArea) && c.hasUsableAvailability) return "planbaar_via_reserve";
  return "incompleet";
}

export function filterClients(
  clients: any[],
  filters: {
    search?: string;
    area?: string;
    school?: string;
    age?: string;
    status?: string;
  }
): any[] {
  return clients.filter((c: any) => {
    if (filters.search?.trim()) {
      const s = filters.search.toLowerCase();
      const name = `${c.first_name} ${c.last_name}`.toLowerCase();
      const guardian = (c.guardian_name ?? "").toLowerCase();
      if (!name.includes(s) && !guardian.includes(s)) return false;
    }
    if (filters.area && filters.area !== "all") {
      const clientAreaId = c.waitlist_area_id;
      if (clientAreaId !== filters.area) return false;
    }
    if (filters.school && filters.school !== "all") {
      if (filters.school === "none") {
        if (c.school_id) return false;
      } else if (c.school_id !== filters.school) return false;
    }
    if (filters.age && filters.age !== "all") {
      const age = calculateAge(c.date_of_birth);
      if (filters.age === "5-7" && (age === null || age < 5 || age > 7)) return false;
      if (filters.age === "8-12" && (age === null || age < 8 || age > 12)) return false;
      if (filters.age === "other" && age !== null && age >= 5 && age <= 12) return false;
    }
    if (filters.status && filters.status !== "all") {
      if ((c.intake_status ?? "nieuw") !== filters.status) return false;
    }
    return true;
  });
}

// ===== Duplicate name detection =====

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "")
    .trim();
}

export interface DuplicateMatch {
  client: any;
  matchType: "exact" | "fuzzy";
}

/** Find potential duplicate clients by first+last name */
export function findPotentialDuplicates(
  firstName: string,
  lastName: string,
  existingClients: any[],
  excludeId?: string
): DuplicateMatch[] {
  if (!firstName.trim() || !lastName.trim()) return [];
  const normFirst = normalizeName(firstName);
  const normLast = normalizeName(lastName);
  if (normFirst.length < 2 || normLast.length < 2) return [];

  const matches: DuplicateMatch[] = [];
  for (const c of existingClients) {
    if (excludeId && c.id === excludeId) continue;
    const cFirst = normalizeName(c.first_name ?? "");
    const cLast = normalizeName(c.last_name ?? "");

    if (cFirst === normFirst && cLast === normLast) {
      matches.push({ client: c, matchType: "exact" });
    } else if (
      (cFirst === normFirst && cLast.startsWith(normLast.slice(0, 3))) ||
      (cLast === normLast && cFirst.startsWith(normFirst.slice(0, 3)))
    ) {
      matches.push({ client: c, matchType: "fuzzy" });
    }
  }
  return matches;
}

/** Find all groups of clients with duplicate names */
export function findAllDuplicateGroups(
  clients: any[]
): { key: string; clients: any[] }[] {
  const groups: Record<string, any[]> = {};
  for (const c of clients) {
    const key = `${normalizeName(c.first_name ?? "")}|${normalizeName(c.last_name ?? "")}`;
    if (!key || key === "|") continue;
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  }
  return Object.entries(groups)
    .filter(([, arr]) => arr.length > 1)
    .map(([key, clients]) => ({ key, clients }));
}

// ===== Scenario validatie (Stap 4) =====

export type SlotValidationStatus = "geldig" | "aandacht_vereist" | "ongeldig";
export type ScenarioValidationStatus = "geldig" | "aandacht_vereist" | "ongeldig";

export interface MemberValidationResult {
  clientId: string;
  status: SlotValidationStatus;
  issues: string[];
}

export interface SlotValidationResult {
  slotId: string;
  status: SlotValidationStatus;
  slotIssues: string[];
  memberResults: MemberValidationResult[];
}

export interface ScenarioValidationResult {
  status: ScenarioValidationStatus;
  slotResults: SlotValidationResult[];
}

const DAY_NAME_TO_DOW: Record<string, string> = {
  ma: "maandag", di: "dinsdag", wo: "woensdag", do: "donderdag", vr: "vrijdag",
};

/**
 * Validate a single scenario slot with its members.
 *
 * AC-2: "al ingepland" = client_id in programClientIds (program_clients where programs.archived IS NOT TRUE)
 */
export function validateScenarioSlot(
  slot: {
    id: string;
    area_id: string;
    age_category: string | null;
    mode: string | null;
    proposal_idx: number | null;
    day_name: string | null;
    start_time: string | null;
    end_time: string | null;
  },
  members: { client_id: string; has_override: boolean }[],
  clients: Record<string, any>,
  availByClient: Record<string, { dayOfWeek: number; dayName: string; startTime: string; endTime: string; date: string }[]>,
  prefsByClient: Record<string, Record<string, number>>,
  programClientIds: Set<string>,
  overriddenClientIds: Set<string>,
  areaIds: Set<string>
): SlotValidationResult {
  const slotIssues: string[] = [];
  let slotStatus: SlotValidationStatus = "geldig";

  // Slot-level checks
  if (!slot.area_id || !areaIds.has(slot.area_id)) {
    slotIssues.push("Ongeldig gebied");
    slotStatus = "ongeldig";
  }

  if (slot.mode === "manual") {
    if (!slot.day_name) {
      slotIssues.push("Dag ontbreekt (manual mode)");
      slotStatus = "ongeldig";
    }
    if (!slot.start_time || !slot.end_time) {
      slotIssues.push("Start/eindtijd ontbreekt (manual mode)");
      slotStatus = "ongeldig";
    } else if (slot.start_time >= slot.end_time) {
      slotIssues.push("Eindtijd moet na starttijd liggen");
      slotStatus = "ongeldig";
    }
  }

  if (slot.mode === "proposal" && (slot.proposal_idx === null || slot.proposal_idx === undefined)) {
    slotIssues.push("proposal_idx ontbreekt (proposal mode)");
    slotStatus = "ongeldig";
  }

  // Member-level checks
  const memberResults: MemberValidationResult[] = [];

  for (const member of members) {
    const issues: string[] = [];
    let memberStatus: SlotValidationStatus = "geldig";
    const client = clients[member.client_id];

    if (!client) {
      issues.push("Deelnemer niet gevonden");
      memberStatus = "ongeldig";
      memberResults.push({ clientId: member.client_id, status: memberStatus, issues });
      continue;
    }

    // Status check
    const intakeStatus = client.intake_status ?? "nieuw";
    if (!["intake_afgerond", "wachtlijst"].includes(intakeStatus)) {
      issues.push(`Status niet toelaatbaar: ${intakeStatus}`);
      memberStatus = "ongeldig";
    }

    // Already planned check (AC-2)
    if (programClientIds.has(member.client_id)) {
      issues.push("Deelnemer is al ingepland in een actief programma");
      memberStatus = "ongeldig";
    }

    // Area match check
    if (slotStatus !== "ongeldig" && slot.area_id) {
      const mt = getMatchType(client, slot.area_id, prefsByClient);
      if (!mt) {
        if (member.has_override && overriddenClientIds.has(member.client_id)) {
          // Override covers area mismatch
        } else {
          issues.push("Gebied matcht niet (geen primair, reserve of flexibel)");
          memberStatus = memberStatus === "ongeldig" ? "ongeldig" : "aandacht_vereist";
        }
      }
    }

    // Availability check (only for manual mode with concrete day/time)
    if (slot.mode === "manual" && slot.day_name && slot.start_time && slot.end_time) {
      const targetDayName = DAY_NAME_TO_DOW[slot.day_name] ?? slot.day_name;
      const clientAvail = availByClient[member.client_id];

      if (!clientAvail || clientAvail.length === 0) {
        if (member.has_override && overriddenClientIds.has(member.client_id)) {
          // Override covers missing availability
        } else {
          issues.push("Geen beschikbaarheid ingevuld");
          memberStatus = memberStatus === "ongeldig" ? "ongeldig" : "aandacht_vereist";
        }
      } else {
        const matchesDay = clientAvail.some(
          (a) => a.dayName === targetDayName && a.startTime <= slot.start_time! && a.endTime >= slot.end_time!
        );
        if (!matchesDay) {
          if (member.has_override && overriddenClientIds.has(member.client_id)) {
            // Override covers availability mismatch
          } else {
            issues.push("Beschikbaarheid gewijzigd: past niet meer op dit tijdslot");
            memberStatus = memberStatus === "ongeldig" ? "ongeldig" : "aandacht_vereist";
          }
        }
      }

      // 4-month coverage check
      if (clientAvail && clientAvail.length > 0 && !hasAvailabilityCoverage(clientAvail)) {
        if (!(member.has_override && overriddenClientIds.has(member.client_id))) {
          issues.push("Onvoldoende dekking: beschikbaarheid loopt niet 3 maanden vooruit");
          memberStatus = memberStatus === "ongeldig" ? "ongeldig" : "aandacht_vereist";
        }
      }
    }

    // Override expired check
    if (member.has_override && !overriddenClientIds.has(member.client_id)) {
      issues.push("Override vervallen");
      memberStatus = memberStatus === "ongeldig" ? "ongeldig" : "aandacht_vereist";
    }

    memberResults.push({ clientId: member.client_id, status: memberStatus, issues });
  }

  // Aggregate member statuses into slot status
  for (const mr of memberResults) {
    if (mr.status === "ongeldig") slotStatus = "ongeldig";
    else if (mr.status === "aandacht_vereist" && slotStatus !== "ongeldig") slotStatus = "aandacht_vereist";
  }

  return { slotId: slot.id, status: slotStatus, slotIssues, memberResults };
}

/**
 * Validate an entire scenario (all slots + members).
 * Aggregates: ongeldig if ≥1 ongeldig, aandacht if ≥1 aandacht, else geldig.
 */
export function validateScenario(
  slots: { id: string; area_id: string; age_category: string | null; mode: string | null; proposal_idx: number | null; day_name: string | null; start_time: string | null; end_time: string | null }[],
  membersBySlot: Record<string, { client_id: string; has_override: boolean }[]>,
  clients: Record<string, any>,
  availByClient: Record<string, { dayOfWeek: number; dayName: string; startTime: string; endTime: string; date: string }[]>,
  prefsByClient: Record<string, Record<string, number>>,
  programClientIds: Set<string>,
  overriddenClientIds: Set<string>,
  areaIds: Set<string>
): ScenarioValidationResult {
  const slotResults = slots.map((slot) =>
    validateScenarioSlot(
      slot,
      membersBySlot[slot.id] ?? [],
      clients,
      availByClient,
      prefsByClient,
      programClientIds,
      overriddenClientIds,
      areaIds
    )
  );

  let status: ScenarioValidationStatus = "geldig";
  for (const sr of slotResults) {
    if (sr.status === "ongeldig") { status = "ongeldig"; break; }
    if (sr.status === "aandacht_vereist") status = "aandacht_vereist";
  }

  return { status, slotResults };
}
