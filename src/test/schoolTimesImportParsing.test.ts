import { describe, expect, it } from "vitest";
import {
  parseImportedSchoolTimeRange,
  resolveImportedSchoolTimePair,
  findMatchingColumn,
  SCHOOL_START_TIME_COLUMNS,
  SCHOOL_END_TIME_COLUMNS,
} from "@/lib/schoolTimes";

describe("parseImportedSchoolTimeRange", () => {
  it("parses a simple range with en-dash", () => {
    expect(parseImportedSchoolTimeRange("08:30–15:00")).toEqual({
      start: "08:30:00",
      end: "15:00:00",
    });
  });

  it("parses split-day values and returns earliest start + latest end", () => {
    expect(parseImportedSchoolTimeRange("08:30–11:45 / 12:45–14:45")).toEqual({
      start: "08:30:00",
      end: "14:45:00",
    });
  });

  it("handles grouped text values", () => {
    expect(parseImportedSchoolTimeRange("gr.1-2 08:30–12:00 / gr.3-8 08:30–14:45")).toEqual({
      start: "08:30:00",
      end: "14:45:00",
    });
  });
});

describe("resolveImportedSchoolTimePair", () => {
  it("uses explicit start/end columns when valid", () => {
    const headers = ["Naam", "Schooltijd begin", "Schooltijd eind"];
    const row = {
      Naam: "Testschool",
      "Schooltijd begin": "08:30",
      "Schooltijd eind": "15:00",
    };

    expect(
      resolveImportedSchoolTimePair(
        row,
        headers,
        findMatchingColumn(headers, SCHOOL_START_TIME_COLUMNS),
        findMatchingColumn(headers, SCHOOL_END_TIME_COLUMNS),
      ),
    ).toEqual({
      school_start_time: "08:30:00",
      school_end_time: "15:00:00",
      invalidValues: 0,
    });
  });

  it("falls back to weekday columns when explicit columns are absent", () => {
    const headers = ["School", "Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag"];
    const row = {
      School: "Voorbeeldschool",
      Maandag: "08:30–15:00",
      Dinsdag: "08:30–15:00",
      Woensdag: "08:30–12:30",
      Donderdag: "08:30–15:00",
      Vrijdag: "08:30–15:00",
    };

    expect(resolveImportedSchoolTimePair(row, headers, null, null)).toEqual({
      school_start_time: "08:30:00",
      school_end_time: "15:00:00",
      invalidValues: 0,
    });
  });

  it("counts invalid weekday values but still resolves from valid days", () => {
    const headers = ["School", "Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag"];
    const row = {
      School: "Voorbeeldschool",
      Maandag: "08:30–15:00",
      Dinsdag: "onbekend",
      Woensdag: "08:30–12:30",
      Donderdag: "08:30–15:00",
      Vrijdag: "08:30–15:00",
    };

    expect(resolveImportedSchoolTimePair(row, headers, null, null)).toEqual({
      school_start_time: "08:30:00",
      school_end_time: "15:00:00",
      invalidValues: 1,
    });
  });
});

describe("findMatchingColumn normalization", () => {
  it("matches normalized variations (underscores / casing)", () => {
    const headers = ["SCHOOL_START_TIME", "Naam"];
    expect(findMatchingColumn(headers, SCHOOL_START_TIME_COLUMNS)).toBe("SCHOOL_START_TIME");
  });
});
