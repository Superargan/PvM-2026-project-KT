import { describe, it, expect } from "vitest";
import {
  formatSchoolTime,
  formatSchoolTimeRange,
  parseImportedSchoolTime,
  validateSchoolTimePair,
  findMatchingColumn,
  normalizeSchoolName,
  dbTimeToInput,
  inputTimeToDb,
  getEffectiveMunicipality,
  DEFAULT_MUNICIPALITY,
  MUNICIPALITY_COLUMNS,
} from "@/lib/schoolTimes";

describe("formatSchoolTime", () => {
  it("returns empty string for null/undefined/empty", () => {
    expect(formatSchoolTime(null)).toBe("");
    expect(formatSchoolTime(undefined)).toBe("");
    expect(formatSchoolTime("")).toBe("");
  });

  it("formats HH:mm:ss to HH:mm", () => {
    expect(formatSchoolTime("08:30:00")).toBe("08:30");
    expect(formatSchoolTime("15:00:00")).toBe("15:00");
  });

  it("handles HH:mm input", () => {
    expect(formatSchoolTime("08:30")).toBe("08:30");
  });
});

describe("formatSchoolTimeRange", () => {
  it("formats both present", () => {
    expect(formatSchoolTimeRange("08:30:00", "15:00:00")).toBe("08:30 – 15:00");
  });

  it("returns — when both absent", () => {
    expect(formatSchoolTimeRange(null, null)).toBe("—");
    expect(formatSchoolTimeRange(undefined, undefined)).toBe("—");
  });

  it("returns — when one absent", () => {
    expect(formatSchoolTimeRange("08:30:00", null)).toBe("—");
    expect(formatSchoolTimeRange(null, "15:00:00")).toBe("—");
  });
});

describe("parseImportedSchoolTime", () => {
  it("returns null for null/undefined/empty", () => {
    expect(parseImportedSchoolTime(null)).toBeNull();
    expect(parseImportedSchoolTime(undefined)).toBeNull();
    expect(parseImportedSchoolTime("")).toBeNull();
  });

  it("parses HH:mm", () => {
    expect(parseImportedSchoolTime("08:30")).toBe("08:30:00");
    expect(parseImportedSchoolTime("15:00")).toBe("15:00:00");
  });

  it("parses H:mm", () => {
    expect(parseImportedSchoolTime("8:30")).toBe("08:30:00");
  });

  it("parses HH.mm", () => {
    expect(parseImportedSchoolTime("08.30")).toBe("08:30:00");
    expect(parseImportedSchoolTime("8.30")).toBe("08:30:00");
  });

  it("parses HH:mm:ss", () => {
    expect(parseImportedSchoolTime("08:30:00")).toBe("08:30:00");
    expect(parseImportedSchoolTime("15:00:45")).toBe("15:00:00");
  });

  it("parses Excel numeric time", () => {
    // 0.354166... ≈ 08:30
    expect(parseImportedSchoolTime(0.354166667)).toBe("08:30:00");
    // 0.625 = 15:00
    expect(parseImportedSchoolTime(0.625)).toBe("15:00:00");
  });

  it("parses Excel numeric string", () => {
    expect(parseImportedSchoolTime("0.625")).toBe("15:00:00");
  });

  it("returns null for garbage", () => {
    expect(parseImportedSchoolTime("abc")).toBeNull();
    expect(parseImportedSchoolTime("25:00")).toBeNull();
    expect(parseImportedSchoolTime("12:60")).toBeNull();
    expect(parseImportedSchoolTime(-0.5)).toBeNull();
    expect(parseImportedSchoolTime(1.5)).toBeNull();
  });
});

describe("validateSchoolTimePair", () => {
  it("both empty is valid", () => {
    expect(validateSchoolTimePair(null, null)).toEqual({ valid: true });
    expect(validateSchoolTimePair("", "")).toEqual({ valid: true });
    expect(validateSchoolTimePair(undefined, undefined)).toEqual({ valid: true });
  });

  it("both filled and ordered is valid", () => {
    expect(validateSchoolTimePair("08:30", "15:00")).toEqual({ valid: true });
    expect(validateSchoolTimePair("08:30:00", "15:00:00")).toEqual({ valid: true });
  });

  it("partial is invalid", () => {
    const r1 = validateSchoolTimePair("08:30", null);
    expect(r1.valid).toBe(false);
    expect(r1.error).toContain("beide");

    const r2 = validateSchoolTimePair(null, "15:00");
    expect(r2.valid).toBe(false);
  });

  it("equal times is invalid", () => {
    const r = validateSchoolTimePair("08:30", "08:30");
    expect(r.valid).toBe(false);
    expect(r.error).toContain("later");
  });

  it("end before start is invalid", () => {
    const r = validateSchoolTimePair("15:00", "08:30");
    expect(r.valid).toBe(false);
    expect(r.error).toContain("later");
  });
});

describe("findMatchingColumn", () => {
  it("finds matching column case-insensitively", () => {
    const headers = ["Naam", "Adres", "Schooltijd Begin", "Schooltijd Eind"];
    expect(findMatchingColumn(headers, ["schooltijd begin"])).toBe("Schooltijd Begin");
    expect(findMatchingColumn(headers, ["schooltijd eind"])).toBe("Schooltijd Eind");
  });

  it("returns null when no match", () => {
    expect(findMatchingColumn(["Naam", "Adres"], ["schooltijd begin"])).toBeNull();
  });

  it("returns first matching candidate", () => {
    const headers = ["Begintijd", "Aanvangstijd"];
    expect(findMatchingColumn(headers, ["begintijd", "aanvangstijd"])).toBe("Begintijd");
  });
});

describe("normalizeSchoolName", () => {
  it("trims, lowercases, collapses spaces", () => {
    expect(normalizeSchoolName("  De  Grote  School  ")).toBe("de grote school");
  });
});

describe("dbTimeToInput / inputTimeToDb", () => {
  it("converts DB to input format", () => {
    expect(dbTimeToInput("08:30:00")).toBe("08:30");
    expect(dbTimeToInput(null)).toBe("");
  });

  it("converts input to DB format", () => {
    expect(inputTimeToDb("08:30")).toBe("08:30:00");
    expect(inputTimeToDb("")).toBeNull();
    expect(inputTimeToDb("08:30:00")).toBe("08:30:00");
  });
});

describe("getEffectiveMunicipality", () => {
  it("returns Rotterdam for null/undefined/empty", () => {
    expect(getEffectiveMunicipality(null)).toBe("Rotterdam");
    expect(getEffectiveMunicipality(undefined)).toBe("Rotterdam");
    expect(getEffectiveMunicipality("")).toBe("Rotterdam");
    expect(getEffectiveMunicipality("   ")).toBe("Rotterdam");
  });

  it("returns the explicit municipality when set", () => {
    expect(getEffectiveMunicipality("Capelle aan den IJssel")).toBe("Capelle aan den IJssel");
    expect(getEffectiveMunicipality("Schiedam")).toBe("Schiedam");
  });

  it("trims whitespace from explicit municipality", () => {
    expect(getEffectiveMunicipality("  Schiedam  ")).toBe("Schiedam");
  });

  it("DEFAULT_MUNICIPALITY is Rotterdam", () => {
    expect(DEFAULT_MUNICIPALITY).toBe("Rotterdam");
  });
});

describe("MUNICIPALITY_COLUMNS", () => {
  it("matches gemeente column in import headers", () => {
    const headers = ["Naam", "Adres", "Gemeente"];
    expect(findMatchingColumn(headers, MUNICIPALITY_COLUMNS)).toBe("Gemeente");
  });

  it("matches municipality column", () => {
    const headers = ["name", "municipality"];
    expect(findMatchingColumn(headers, MUNICIPALITY_COLUMNS)).toBe("municipality");
  });

  it("returns null when no municipality column", () => {
    expect(findMatchingColumn(["Naam", "Adres"], MUNICIPALITY_COLUMNS)).toBeNull();
  });
});
