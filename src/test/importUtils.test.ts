import { describe, it, expect } from "vitest";
import {
  normalizeKey,
  normalizeColumnHeader,
  findCol,
  normalizeEntityName,
  stripSchoolPrefix,
  findSchoolMatch,
  findAreaMatch,
  findReferrerMatch,
  parseTime,
  parseExcelDate,
  type EntityRef,
} from "@/lib/importUtils";

// ── normalizeKey ────────────────────────────────────────────────────

describe("normalizeKey", () => {
  it("lowercases and strips accents", () => {
    expect(normalizeKey("Geboortedatum")).toBe("geboortedatum");
    expect(normalizeKey("Résumé")).toBe("resume");
  });
  it("strips non-alphanumeric", () => {
    expect(normalizeKey("Reserve gebied 1")).toBe("reservegebied1");
    expect(normalizeKey("e-mail_ouder")).toBe("emailouder");
  });
});

// ── normalizeColumnHeader ───────────────────────────────────────────

describe("normalizeColumnHeader", () => {
  it("preserves spaces but normalizes separators", () => {
    expect(normalizeColumnHeader("Reserve_gebied-1")).toBe("reserve gebied 1");
  });
});

// ── findCol ─────────────────────────────────────────────────────────

describe("findCol", () => {
  const row = { "Naam kind": "Jan", School: "De Ster", Leeftijd: "8", "": "" };

  it("exact match", () => {
    expect(findCol(row, "Naam kind")).toBe("Jan");
  });
  it("case-insensitive match", () => {
    expect(findCol(row, "school")).toBe("De Ster");
  });
  it("contains match", () => {
    expect(findCol(row, "naam")).toBe("Jan");
  });
  it("returns undefined for missing column", () => {
    expect(findCol(row, "Postcode")).toBeUndefined();
  });
  it("skips empty values", () => {
    expect(findCol(row, "")).toBeUndefined();
  });
  it("tries multiple candidates in order", () => {
    expect(findCol(row, "Voornaam", "Naam kind")).toBe("Jan");
  });
});

// ── stripSchoolPrefix ───────────────────────────────────────────────

describe("stripSchoolPrefix", () => {
  it("strips OBS prefix", () => {
    expect(stripSchoolPrefix("OBS De Ster")).toBe("ster");
  });
  it("strips CBS prefix", () => {
    expect(stripSchoolPrefix("CBS Het Kompas")).toBe("kompas");
  });
  it("strips Basisschool prefix", () => {
    expect(stripSchoolPrefix("Basisschool De Boog")).toBe("boog");
  });
  it("strips leading article", () => {
    expect(stripSchoolPrefix("De Regenboog")).toBe("regenboog");
  });
  it("leaves short names intact", () => {
    expect(stripSchoolPrefix("Avi")).toBe("avi");
  });
});

// ── findSchoolMatch ─────────────────────────────────────────────────

describe("findSchoolMatch", () => {
  const schools: EntityRef[] = [
    { id: "1", name: "OBS De Ster" },
    { id: "2", name: "CBS Het Kompas" },
    { id: "3", name: "Basisschool De Boog" },
  ];

  it("exact match", () => {
    expect(findSchoolMatch("OBS De Ster", schools)?.id).toBe("1");
  });
  it("case-insensitive match", () => {
    expect(findSchoolMatch("obs de ster", schools)?.id).toBe("1");
  });
  it("prefix-stripped match", () => {
    expect(findSchoolMatch("De Ster", schools)?.id).toBe("1");
  });
  it("contains match", () => {
    expect(findSchoolMatch("Kompas", schools)?.id).toBe("2");
  });
  it("returns null for no match", () => {
    expect(findSchoolMatch("Onbekende School", schools)).toBeNull();
  });
  it("uses resolutions", () => {
    expect(findSchoolMatch("nieuwe school", schools, { "nieuwe school": "3" })?.id).toBe("3");
  });
  it("returns null for empty input", () => {
    expect(findSchoolMatch("", schools)).toBeNull();
  });
});

// ── findAreaMatch ───────────────────────────────────────────────────

describe("findAreaMatch", () => {
  const areas: EntityRef[] = [
    { id: "a1", name: "Hillegersberg-Schiebroek" },
    { id: "a2", name: "Kralingen-Crooswijk" },
    { id: "a3", name: "Centrum" },
  ];

  it("exact match", () => {
    expect(findAreaMatch("Centrum", areas)?.id).toBe("a3");
  });
  it("case-insensitive", () => {
    expect(findAreaMatch("centrum", areas)?.id).toBe("a3");
  });
  it("alias match HIS", () => {
    expect(findAreaMatch("HIS", areas)?.id).toBe("a1");
  });
  it("alias match Hillegersberg", () => {
    expect(findAreaMatch("Hillegersberg", areas)?.id).toBe("a1");
  });
  it("alias match Kralingen", () => {
    expect(findAreaMatch("Kralingen", areas)?.id).toBe("a2");
  });
  it("returns null for unknown area", () => {
    expect(findAreaMatch("Onbekend", areas)).toBeNull();
  });
  it("returns null for empty input", () => {
    expect(findAreaMatch("", areas)).toBeNull();
  });
});

// ── findReferrerMatch ───────────────────────────────────────────────

describe("findReferrerMatch", () => {
  const refs = [
    { id: "r1", name: "Juf Petra", school_id: "s1" },
    { id: "r2", name: "Juf Petra", school_id: "s2" },
    { id: "r3", name: "Meester Jan", school_id: null },
  ];

  it("exact match", () => {
    expect(findReferrerMatch("Meester Jan", refs)?.id).toBe("r3");
  });
  it("prefers same-school match", () => {
    expect(findReferrerMatch("Juf Petra", refs, "s2")?.id).toBe("r2");
  });
  it("falls back to any match without school", () => {
    expect(findReferrerMatch("Juf Petra", refs)?.id).toBe("r1");
  });
  it("contains match", () => {
    expect(findReferrerMatch("Petra", refs)?.id).toBe("r1");
  });
  it("returns null for no match", () => {
    expect(findReferrerMatch("Onbekend", refs)).toBeNull();
  });
});

// ── parseTime ───────────────────────────────────────────────────────

describe("parseTime", () => {
  it("parses HH:MM", () => {
    expect(parseTime("14:30")).toBe("14:30");
  });
  it("parses HH.MM", () => {
    expect(parseTime("8.45")).toBe("08:45");
  });
  it("parses Excel fraction (0.625 = 15:00)", () => {
    expect(parseTime(0.625)).toBe("15:00");
  });
  it("parses plain hour", () => {
    expect(parseTime("9")).toBe("09:00");
  });
  it("returns null for empty", () => {
    expect(parseTime("")).toBeNull();
    expect(parseTime(null)).toBeNull();
    expect(parseTime(undefined)).toBeNull();
  });
});

// ── parseExcelDate ──────────────────────────────────────────────────

describe("parseExcelDate", () => {
  it("parses DD-MM-YYYY (Dutch default)", () => {
    expect(parseExcelDate("15-03-2026")).toBe("2026-03-15");
  });
  it("parses DD/MM/YYYY", () => {
    expect(parseExcelDate("01/12/2025")).toBe("2025-12-01");
  });
  it("parses YYYY-MM-DD (ISO)", () => {
    expect(parseExcelDate("2026-03-14")).toBe("2026-03-14");
  });
  it("parses DD-MM-YY (2-digit year)", () => {
    expect(parseExcelDate("15-03-26")).toBe("2026-03-15");
  });
  it("parses Excel serial number", () => {
    // 45000 ≈ 2023-02-18
    const result = parseExcelDate(45000);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("parses MDY format when specified", () => {
    expect(parseExcelDate("03-15-2026", "mdy")).toBe("2026-03-15");
  });
  it("returns null for empty", () => {
    expect(parseExcelDate("")).toBeNull();
    expect(parseExcelDate(null)).toBeNull();
  });
});
