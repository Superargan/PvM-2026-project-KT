import { describe, it, expect } from "vitest";
import {
  // Derived resolvers
  getEffectiveClientMunicipality,
  getEffectiveClientSchoolTimeRange,
  hasExplicitOverride,
  getDisplayValueOrDefault,
  resolveInheritedValue,
  getMunicipalityBadgeValue,
  getClientAgeDisplay,
  // Token maps
  matchColorTokens,
  statusBadgeTokens,
  sessionStatusTokens,
  // Constants
  DEFAULT_CITY,
  DEFAULT_MUNICIPALITY,
  AVAILABILITY_COVERAGE_MONTHS,
  DEFAULT_AVAIL_START,
  DEFAULT_AVAIL_END,
  SCHOOL_TIME_AVAIL_START,
  SCHOOL_TIME_AVAIL_END,
  // Re-exported domain functions (verify accessibility)
  calculateAge,
  getAgeCategoryPlanning,
  getAgeGroup,
  statusLabels,
  statusStyles,
  matchColors,
  statusBadgeStyles,
  filterClients,
  findPotentialDuplicates,
  normalizeSchoolName,
  formatSchoolTimeRange,
  getResolvedAreaName,
  getResolvedLocationName,
  getAreaFromPostcode,
  extractPostcode,
} from "@/lib/DomainResolver";

describe("DomainResolver", () => {
  describe("shared constants", () => {
    it("DEFAULT_CITY equals Rotterdam", () => {
      expect(DEFAULT_CITY).toBe("Rotterdam");
    });

    it("DEFAULT_MUNICIPALITY equals Rotterdam", () => {
      expect(DEFAULT_MUNICIPALITY).toBe("Rotterdam");
    });

    it("availability constants have expected values", () => {
      expect(AVAILABILITY_COVERAGE_MONTHS).toBe(3);
      expect(DEFAULT_AVAIL_START).toBe("09:00");
      expect(DEFAULT_AVAIL_END).toBe("17:00");
      expect(SCHOOL_TIME_AVAIL_START).toBe("08:30");
      expect(SCHOOL_TIME_AVAIL_END).toBe("15:00");
    });
  });

  describe("getEffectiveClientMunicipality", () => {
    it("returns Rotterdam when no school", () => {
      expect(getEffectiveClientMunicipality({})).toBe("Rotterdam");
    });

    it("returns Rotterdam when school has no municipality", () => {
      expect(getEffectiveClientMunicipality({ schools: { municipality: null } })).toBe("Rotterdam");
    });

    it("returns explicit municipality from school", () => {
      expect(getEffectiveClientMunicipality({ schools: { municipality: "Capelle" } })).toBe("Capelle");
    });
  });

  describe("getEffectiveClientSchoolTimeRange", () => {
    it("returns null when no school", () => {
      expect(getEffectiveClientSchoolTimeRange({})).toBeNull();
    });

    it("returns null when school has no times", () => {
      expect(getEffectiveClientSchoolTimeRange({ schools: { school_start_time: null, school_end_time: null } })).toBeNull();
    });

    it("returns times from school", () => {
      expect(getEffectiveClientSchoolTimeRange({
        schools: { school_start_time: "08:30:00", school_end_time: "15:00:00" },
      })).toEqual({ start: "08:30:00", end: "15:00:00" });
    });
  });

  describe("hasExplicitOverride", () => {
    it("returns false for null/undefined/empty", () => {
      expect(hasExplicitOverride(null)).toBe(false);
      expect(hasExplicitOverride(undefined)).toBe(false);
      expect(hasExplicitOverride("")).toBe(false);
      expect(hasExplicitOverride("   ")).toBe(false);
    });

    it("returns true for non-empty values", () => {
      expect(hasExplicitOverride("Capelle")).toBe(true);
      expect(hasExplicitOverride("0")).toBe(true);
    });
  });

  describe("getDisplayValueOrDefault", () => {
    it("returns value when truthy", () => {
      expect(getDisplayValueOrDefault("Hello")).toBe("Hello");
    });

    it("returns dash for null/empty", () => {
      expect(getDisplayValueOrDefault(null)).toBe("—");
      expect(getDisplayValueOrDefault("")).toBe("—");
    });

    it("supports custom fallback", () => {
      expect(getDisplayValueOrDefault(null, "N/A")).toBe("N/A");
    });
  });

  describe("resolveInheritedValue", () => {
    it("returns first truthy value", () => {
      expect(resolveInheritedValue(null, undefined, "fallback")).toBe("fallback");
      expect(resolveInheritedValue("explicit", "fallback")).toBe("explicit");
    });

    it("skips empty strings", () => {
      expect(resolveInheritedValue("", "fallback")).toBe("fallback");
    });

    it("returns null if all empty", () => {
      expect(resolveInheritedValue(null, undefined, "")).toBeNull();
    });

    it("works with non-string types", () => {
      expect(resolveInheritedValue(null, 42)).toBe(42);
      expect(resolveInheritedValue(0, 42)).toBe(0);
    });
  });

  describe("getMunicipalityBadgeValue", () => {
    it("returns null for Rotterdam (default)", () => {
      expect(getMunicipalityBadgeValue(null)).toBeNull();
      expect(getMunicipalityBadgeValue("")).toBeNull();
      expect(getMunicipalityBadgeValue("Rotterdam")).toBeNull();
    });

    it("returns value for non-default municipality", () => {
      expect(getMunicipalityBadgeValue("Capelle")).toBe("Capelle");
    });
  });

  describe("getClientAgeDisplay", () => {
    it("returns dash for null DOB", () => {
      expect(getClientAgeDisplay(null)).toBe("—");
    });

    it("returns age string for valid DOB", () => {
      const dob = "2016-01-15"; // ~10 years old in 2026
      const result = getClientAgeDisplay(dob);
      expect(result).toMatch(/\d+ jaar/);
    });
  });

  describe("semantic token maps", () => {
    it("matchColorTokens uses semantic classes", () => {
      expect(matchColorTokens["Primair"]).toContain("success");
      expect(matchColorTokens["Flexibel"]).toContain("warning");
    });

    it("statusBadgeTokens uses semantic classes", () => {
      expect(statusBadgeTokens["intake_afgerond"].className).toContain("info");
      expect(statusBadgeTokens["wachtlijst"].className).toContain("warning");
    });

    it("sessionStatusTokens covers all statuses", () => {
      expect(sessionStatusTokens["beschikbaar"].className).toContain("success");
      expect(sessionStatusTokens["geblokkeerd"].className).toContain("destructive");
      expect(sessionStatusTokens["handmatig_vrijgegeven"].className).toContain("info");
    });
  });
});
