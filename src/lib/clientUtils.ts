export function calculateAge(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return age;
}

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
