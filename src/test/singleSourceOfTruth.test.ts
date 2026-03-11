import { describe, it, expect } from "vitest";
import {
  calculateAge,
  getAgeCategoryPlanning,
  getAgeGroup,
  getAgeCategoryReport,
  getAgeCategoryReportLabel,
  resolveAreaId,
  getMatchType,
  matchSortOrder,
  statusLabels,
  allStatuses,
} from "@/lib/clientUtils";
import { differenceInYears, parseISO, subYears, format } from "date-fns";

function dobForAge(age: number): string {
  const d = subYears(new Date(), age);
  // subtract one more day so birthday has passed
  d.setDate(d.getDate() - 1);
  return format(d, "yyyy-MM-dd");
}

describe("calculateAge — single source of truth", () => {
  it("returns null for null input", () => {
    expect(calculateAge(null)).toBeNull();
  });

  it("matches date-fns differenceInYears for various ages", () => {
    for (const age of [5, 7, 8, 10, 12, 15]) {
      const dob = dobForAge(age);
      const result = calculateAge(dob);
      const expected = differenceInYears(new Date(), parseISO(dob));
      expect(result).toBe(expected);
    }
  });
});

describe("getAgeCategoryPlanning — planning leeftijdscategorieën", () => {
  it("returns null for null dob", () => {
    expect(getAgeCategoryPlanning(null)).toBeNull();
  });

  it("returns '5-7 jaar' for ages 5, 6, 7", () => {
    expect(getAgeCategoryPlanning(dobForAge(5))).toBe("5-7 jaar");
    expect(getAgeCategoryPlanning(dobForAge(6))).toBe("5-7 jaar");
    expect(getAgeCategoryPlanning(dobForAge(7))).toBe("5-7 jaar");
  });

  it("returns '8-12 jaar' for ages 8, 10, 12", () => {
    expect(getAgeCategoryPlanning(dobForAge(8))).toBe("8-12 jaar");
    expect(getAgeCategoryPlanning(dobForAge(10))).toBe("8-12 jaar");
    expect(getAgeCategoryPlanning(dobForAge(12))).toBe("8-12 jaar");
  });

  it("returns null for ages outside 5-12", () => {
    expect(getAgeCategoryPlanning(dobForAge(4))).toBeNull();
    expect(getAgeCategoryPlanning(dobForAge(13))).toBeNull();
  });
});

describe("getAgeGroup — display label", () => {
  it("returns '—' for null", () => {
    expect(getAgeGroup(null)).toBe("—");
  });

  it("returns category label for 5-12", () => {
    expect(getAgeGroup(dobForAge(6))).toBe("5-7 jaar");
    expect(getAgeGroup(dobForAge(9))).toBe("8-12 jaar");
  });

  it("returns exact age for outside range", () => {
    expect(getAgeGroup(dobForAge(3))).toBe("3 jaar");
    expect(getAgeGroup(dobForAge(14))).toBe("14 jaar");
  });
});

describe("getAgeCategoryReport — rapportage categorieën", () => {
  it("returns 'Onbekend' for null", () => {
    expect(getAgeCategoryReport(null)).toBe("Onbekend");
  });

  it("categorises correctly", () => {
    expect(getAgeCategoryReport(dobForAge(4))).toBe("0-5");
    expect(getAgeCategoryReport(dobForAge(7))).toBe("6-9");
    expect(getAgeCategoryReport(dobForAge(11))).toBe("10-12");
    expect(getAgeCategoryReport(dobForAge(14))).toBe("13-15");
    expect(getAgeCategoryReport(dobForAge(17))).toBe("16+");
  });
});

describe("resolveAreaId", () => {
  it("prefers waitlist_area_id", () => {
    expect(resolveAreaId({ waitlist_area_id: "a1", schools: { neighborhoods: { area_id: "a2" } } })).toBe("a1");
  });

  it("falls back to school neighborhood", () => {
    expect(resolveAreaId({ waitlist_area_id: null, schools: { neighborhoods: { area_id: "a2" } } })).toBe("a2");
  });

  it("returns null when nothing available", () => {
    expect(resolveAreaId({ waitlist_area_id: null, schools: null })).toBeNull();
  });
});

describe("getMatchType", () => {
  const prefs = { c1: { areaX: 1, areaY: 2 } };

  it("returns Primair when primary area matches", () => {
    expect(getMatchType({ id: "c1", waitlist_area_id: "areaZ" }, "areaZ", prefs)).toBe("Primair");
  });

  it("returns Reserve 1/2 based on preference order", () => {
    expect(getMatchType({ id: "c1", waitlist_area_id: "other" }, "areaX", prefs)).toBe("Reserve 1");
    expect(getMatchType({ id: "c1", waitlist_area_id: "other" }, "areaY", prefs)).toBe("Reserve 2");
  });

  it("returns Flexibel for all_areas_flexible", () => {
    expect(getMatchType({ id: "c2", waitlist_area_id: "other", all_areas_flexible: true }, "anywhere", {})).toBe("Flexibel");
  });

  it("returns null when no match", () => {
    expect(getMatchType({ id: "c2", waitlist_area_id: "other" }, "anywhere", {})).toBeNull();
  });
});

describe("matchSortOrder consistency", () => {
  it("Primair < Reserve 1 < Reserve 2 < Reserve 3 < Flexibel", () => {
    expect(matchSortOrder["Primair"]).toBeLessThan(matchSortOrder["Reserve 1"]);
    expect(matchSortOrder["Reserve 1"]).toBeLessThan(matchSortOrder["Reserve 2"]);
    expect(matchSortOrder["Reserve 2"]).toBeLessThan(matchSortOrder["Reserve 3"]);
    expect(matchSortOrder["Reserve 3"]).toBeLessThan(matchSortOrder["Flexibel"]);
  });
});

describe("statusLabels — single definition", () => {
  it("contains all expected statuses", () => {
    const expected = [
      "nieuw", "intake_gepland", "intake_afgerond", "wachtlijst",
      "actief", "training_afgerond", "tussentijds_gestopt", "niet_deelnemen",
    ];
    for (const s of expected) {
      expect(statusLabels[s]).toBeDefined();
    }
  });

  it("allStatuses matches statusLabels keys", () => {
    expect(allStatuses.sort()).toEqual(Object.keys(statusLabels).sort());
  });
});
