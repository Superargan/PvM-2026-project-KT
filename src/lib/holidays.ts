// Nederlandse feestdagen, islamitische feestdagen en schoolvakanties regio Zuid-Holland
// Periode: 2026–2028

export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
  type: "feestdag" | "islamitisch";
}

export interface SchoolVacation {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  name: string;
}

export const HOLIDAYS: Holiday[] = [
  // === 2026 ===
  { date: "2026-01-01", name: "Nieuwjaar", type: "feestdag" },
  { date: "2026-03-20", name: "Suikerfeest (Eid al-Fitr)", type: "islamitisch" },
  { date: "2026-03-21", name: "Suikerfeest (2e dag)", type: "islamitisch" },
  { date: "2026-04-03", name: "Goede Vrijdag", type: "feestdag" },
  { date: "2026-04-05", name: "Eerste Paasdag", type: "feestdag" },
  { date: "2026-04-06", name: "Tweede Paasdag", type: "feestdag" },
  { date: "2026-04-27", name: "Koningsdag", type: "feestdag" },
  { date: "2026-05-05", name: "Bevrijdingsdag", type: "feestdag" },
  { date: "2026-05-14", name: "Hemelvaartsdag", type: "feestdag" },
  { date: "2026-05-24", name: "Eerste Pinksterdag", type: "feestdag" },
  { date: "2026-05-25", name: "Tweede Pinksterdag", type: "feestdag" },
  { date: "2026-05-27", name: "Offerfeest (Eid al-Adha)", type: "islamitisch" },
  { date: "2026-05-28", name: "Offerfeest (2e dag)", type: "islamitisch" },
  { date: "2026-12-25", name: "Eerste Kerstdag", type: "feestdag" },
  { date: "2026-12-26", name: "Tweede Kerstdag", type: "feestdag" },

  // === 2027 ===
  { date: "2027-01-01", name: "Nieuwjaar", type: "feestdag" },
  { date: "2027-03-10", name: "Suikerfeest (Eid al-Fitr)", type: "islamitisch" },
  { date: "2027-03-11", name: "Suikerfeest (2e dag)", type: "islamitisch" },
  { date: "2027-03-26", name: "Goede Vrijdag", type: "feestdag" },
  { date: "2027-03-28", name: "Eerste Paasdag", type: "feestdag" },
  { date: "2027-03-29", name: "Tweede Paasdag", type: "feestdag" },
  { date: "2027-04-27", name: "Koningsdag", type: "feestdag" },
  { date: "2027-05-05", name: "Bevrijdingsdag", type: "feestdag" },
  { date: "2027-05-06", name: "Hemelvaartsdag", type: "feestdag" },
  { date: "2027-05-16", name: "Eerste Pinksterdag", type: "feestdag" },
  { date: "2027-05-17", name: "Tweede Pinksterdag", type: "feestdag" },
  { date: "2027-05-17", name: "Offerfeest (Eid al-Adha)", type: "islamitisch" },
  { date: "2027-05-18", name: "Offerfeest (2e dag)", type: "islamitisch" },
  { date: "2027-12-25", name: "Eerste Kerstdag", type: "feestdag" },
  { date: "2027-12-26", name: "Tweede Kerstdag", type: "feestdag" },

  // === 2028 ===
  { date: "2028-01-01", name: "Nieuwjaar", type: "feestdag" },
  { date: "2028-02-27", name: "Suikerfeest (Eid al-Fitr)", type: "islamitisch" },
  { date: "2028-02-28", name: "Suikerfeest (2e dag)", type: "islamitisch" },
  { date: "2028-04-14", name: "Goede Vrijdag", type: "feestdag" },
  { date: "2028-04-16", name: "Eerste Paasdag", type: "feestdag" },
  { date: "2028-04-17", name: "Tweede Paasdag", type: "feestdag" },
  { date: "2028-04-27", name: "Koningsdag", type: "feestdag" },
  { date: "2028-05-05", name: "Bevrijdingsdag", type: "feestdag" },
  { date: "2028-05-06", name: "Offerfeest (Eid al-Adha)", type: "islamitisch" },
  { date: "2028-05-07", name: "Offerfeest (2e dag)", type: "islamitisch" },
  { date: "2028-05-25", name: "Hemelvaartsdag", type: "feestdag" },
  { date: "2028-06-04", name: "Eerste Pinksterdag", type: "feestdag" },
  { date: "2028-06-05", name: "Tweede Pinksterdag", type: "feestdag" },
  { date: "2028-12-25", name: "Eerste Kerstdag", type: "feestdag" },
  { date: "2028-12-26", name: "Tweede Kerstdag", type: "feestdag" },
];

// Schoolvakanties regio Zuid (Zuid-Holland) — bron: rijksoverheid.nl
export const SCHOOL_VACATIONS: SchoolVacation[] = [
  // === 2025-2026 (relevant deel) ===
  { start: "2026-02-21", end: "2026-03-01", name: "Voorjaarsvakantie" },
  { start: "2026-04-25", end: "2026-05-10", name: "Meivakantie" },
  { start: "2026-07-11", end: "2026-08-23", name: "Zomervakantie" },

  // === 2026-2027 ===
  { start: "2026-10-17", end: "2026-10-25", name: "Herfstvakantie" },
  { start: "2026-12-19", end: "2027-01-03", name: "Kerstvakantie" },
  { start: "2027-02-20", end: "2027-02-28", name: "Voorjaarsvakantie" },
  { start: "2027-04-24", end: "2027-05-09", name: "Meivakantie" },
  { start: "2027-07-10", end: "2027-08-22", name: "Zomervakantie" },

  // === 2027-2028 ===
  { start: "2027-10-16", end: "2027-10-24", name: "Herfstvakantie" },
  { start: "2027-12-18", end: "2028-01-02", name: "Kerstvakantie" },
  { start: "2028-02-26", end: "2028-03-05", name: "Voorjaarsvakantie" },
  { start: "2028-04-22", end: "2028-05-07", name: "Meivakantie" },
  { start: "2028-07-15", end: "2028-08-27", name: "Zomervakantie" },
];

// Helper: get holiday info for a date string (YYYY-MM-DD)
export function getHolidayForDate(dateStr: string): Holiday | undefined {
  return HOLIDAYS.find((h) => h.date === dateStr);
}

// Helper: get all holidays for a date (can have multiple, e.g. Pinksteren + Offerfeest)
export function getHolidaysForDate(dateStr: string): Holiday[] {
  return HOLIDAYS.filter((h) => h.date === dateStr);
}

// Helper: get vacation info for a date string
export function getVacationForDate(dateStr: string): SchoolVacation | undefined {
  return SCHOOL_VACATIONS.find((v) => dateStr >= v.start && dateStr <= v.end);
}

// Helper: check if date is a special day
export function isSpecialDay(dateStr: string): { holidays: Holiday[]; vacation?: SchoolVacation } {
  return {
    holidays: getHolidaysForDate(dateStr),
    vacation: getVacationForDate(dateStr),
  };
}
