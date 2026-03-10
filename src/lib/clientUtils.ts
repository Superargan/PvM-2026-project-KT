import { differenceInYears, parseISO } from "date-fns";

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

export const allStatuses = Object.keys(statusLabels);

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
