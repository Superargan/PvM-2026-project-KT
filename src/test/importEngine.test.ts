import { describe, it, expect } from "vitest";
import {
  parseAvailabilityCell,
  generateDatesForDay,
  expandWeekdayToDates,
  applyEnrichmentPolicy,
  appendNotes,
  createImportSummary,
  buildSummaryMessage,
  normalizeGender,
  splitName,
  isNonPersonReferralSource,
  detectDateFormat,
} from "@/lib/ImportEngine";

describe("ImportEngine", () => {
  describe("parseAvailabilityCell", () => {
    it("returns null for empty/skip values", () => {
      expect(parseAvailabilityCell(null)).toBeNull();
      expect(parseAvailabilityCell("")).toBeNull();
      expect(parseAvailabilityCell("nee")).toBeNull();
      expect(parseAvailabilityCell("-")).toBeNull();
      expect(parseAvailabilityCell("n.v.t.")).toBeNull();
    });

    it("parses x/ja as full day", () => {
      const result = parseAvailabilityCell("x");
      expect(result).toEqual({ available: true, startTime: "09:00", endTime: "17:00", notes: null });
      expect(parseAvailabilityCell("ja")?.available).toBe(true);
      expect(parseAvailabilityCell("✓")?.available).toBe(true);
    });

    it("parses ochtend/middag", () => {
      expect(parseAvailabilityCell("ochtend")).toEqual({ available: true, startTime: "09:00", endTime: "12:00", notes: null });
      expect(parseAvailabilityCell("middag")).toEqual({ available: true, startTime: "12:00", endTime: "17:00", notes: null });
    });

    it("parses 'onder schooltijd'", () => {
      const result = parseAvailabilityCell("onder schooltijd");
      expect(result?.startTime).toBe("08:30");
      expect(result?.endTime).toBe("15:00");
    });

    it("parses 'vanaf HH:MM'", () => {
      const result = parseAvailabilityCell("vanaf 14:00");
      expect(result).toEqual({ available: true, startTime: "14:00", endTime: "17:00", notes: null });
    });

    it("parses 'na HH:MM'", () => {
      const result = parseAvailabilityCell("na 15.00");
      expect(result).toEqual({ available: true, startTime: "15:00", endTime: "17:00", notes: null });
    });

    it("parses 'tot HH:MM'", () => {
      const result = parseAvailabilityCell("tot 15:00");
      expect(result?.startTime).toBe("09:00");
      expect(result?.endTime).toBe("15:00");
    });

    it("parses time range", () => {
      const result = parseAvailabilityCell("8:30-15:00");
      expect(result).toEqual({ available: true, startTime: "08:30", endTime: "15:00", notes: null });
    });

    it("parses 'X (15.00 uur)'", () => {
      const result = parseAvailabilityCell("X (15.00 uur)");
      expect(result?.available).toBe(true);
      expect(result?.startTime).toBe("15:00");
    });

    it("parses voorkeur", () => {
      const result = parseAvailabilityCell("voorkeur");
      expect(result).toEqual({ available: true, startTime: "09:00", endTime: "17:00", notes: "Voorkeur" });
    });

    it("parses 'in overleg'", () => {
      const result = parseAvailabilityCell("in overleg");
      expect(result).toEqual({ available: true, startTime: "09:00", endTime: "17:00", notes: "In overleg" });
    });

    it("parses unknown text as available with notes", () => {
      const result = parseAvailabilityCell("alleen woensdags");
      expect(result?.available).toBe(true);
      expect(result?.notes).toBe("alleen woensdags");
    });
  });

  describe("generateDatesForDay", () => {
    it("generates dates for the specified day of week", () => {
      const dates = generateDatesForDay(1, 14); // Monday, 2 weeks
      expect(dates.length).toBeGreaterThanOrEqual(1);
      expect(dates.length).toBeLessThanOrEqual(3);
      for (const d of dates) {
        expect(new Date(d).getDay()).toBe(1); // Monday
      }
    });
  });

  describe("expandWeekdayToDates", () => {
    it("generates dates for the specified weekday over N months", () => {
      const dates = expandWeekdayToDates(3, 1); // Wednesday, 1 month
      expect(dates.length).toBeGreaterThanOrEqual(3);
      for (const d of dates) {
        expect(new Date(d).getDay()).toBe(3);
      }
    });
  });

  describe("applyEnrichmentPolicy", () => {
    it("only fills missing values", () => {
      const existing = { name: "Jan", phone: null, email: "jan@test.nl" };
      const imported = { name: "Johannes", phone: "123", email: "new@test.nl" };
      const result = applyEnrichmentPolicy(existing, imported);
      expect(result.phone).toBe("123");
      expect(result.name).toBeUndefined(); // existing has value
      expect(result.email).toBeUndefined(); // existing has value
    });

    it("respects alwaysOverwrite option", () => {
      const existing = { name: "Jan", gender: "Jongen" };
      const imported = { name: "Johannes", gender: "Meisje" };
      const result = applyEnrichmentPolicy(existing, imported, { alwaysOverwrite: ["gender"] });
      expect(result.gender).toBe("Meisje");
      expect(result.name).toBeUndefined();
    });

    it("skips blank import values", () => {
      const existing = { name: null };
      const imported = { name: "" };
      const result = applyEnrichmentPolicy(existing, imported);
      expect(result.name).toBeUndefined();
    });

    it("respects skipFields option", () => {
      const existing = { name: null, internal: null };
      const imported = { name: "Jan", internal: "secret" };
      const result = applyEnrichmentPolicy(existing, imported, { skipFields: ["internal"] });
      expect(result.name).toBe("Jan");
      expect(result.internal).toBeUndefined();
    });
  });

  describe("appendNotes", () => {
    it("returns incoming when existing is empty", () => {
      expect(appendNotes(null, "new note")).toBe("new note");
    });

    it("returns existing when incoming is empty", () => {
      expect(appendNotes("existing", null)).toBe("existing");
    });

    it("merges without duplicating", () => {
      expect(appendNotes("old note", "new note")).toBe("old note\nnew note");
    });

    it("skips if existing already contains incoming", () => {
      expect(appendNotes("contains new note here", "new note")).toBe("contains new note here");
    });

    it("returns null if both empty", () => {
      expect(appendNotes(null, null)).toBeNull();
    });
  });

  describe("createImportSummary / buildSummaryMessage", () => {
    it("creates empty summary", () => {
      const s = createImportSummary();
      expect(s.added).toBe(0);
      expect(s.errors).toEqual([]);
    });

    it("builds readable message", () => {
      const s = createImportSummary();
      s.added = 5;
      s.updated = 2;
      s.skipped = 1;
      expect(buildSummaryMessage(s)).toBe("5 toegevoegd, 2 bijgewerkt, 1 overgeslagen");
    });

    it("returns 'Geen wijzigingen' for empty summary", () => {
      expect(buildSummaryMessage(createImportSummary())).toBe("Geen wijzigingen");
    });
  });

  describe("normalizeGender", () => {
    it("normalizes Dutch gender terms", () => {
      expect(normalizeGender("jongen")).toBe("Jongen");
      expect(normalizeGender("J")).toBe("Jongen");
      expect(normalizeGender("meisje")).toBe("Meisje");
      expect(normalizeGender("V")).toBe("Meisje");
      expect(normalizeGender("anders")).toBe("Anders");
    });

    it("returns null for empty", () => {
      expect(normalizeGender(null)).toBeNull();
      expect(normalizeGender(undefined)).toBeNull();
    });

    it("preserves unknown values", () => {
      expect(normalizeGender("non-binary")).toBe("non-binary");
    });
  });

  describe("splitName", () => {
    it("splits full name into first and last", () => {
      expect(splitName("Jan de Vries")).toEqual({ first_name: "Jan", last_name: "de Vries" });
    });

    it("handles single name", () => {
      expect(splitName("Jan")).toEqual({ first_name: "Jan", last_name: "" });
    });
  });

  describe("isNonPersonReferralSource", () => {
    it("identifies generic sources", () => {
      expect(isNonPersonReferralSource("flyer")).toBe(true);
      expect(isNonPersonReferralSource("Internet")).toBe(true);
      expect(isNonPersonReferralSource("school")).toBe(true);
    });

    it("rejects person-like names", () => {
      expect(isNonPersonReferralSource("Jansen")).toBe(false);
      expect(isNonPersonReferralSource("Piet de Groot")).toBe(false);
    });
  });

  describe("detectDateFormat", () => {
    it("detects DMY from unambiguous date", () => {
      const rows = [{ "Geboortedatum": "25-03-2020" }];
      expect(detectDateFormat(rows)).toBe("dmy");
    });

    it("detects MDY from unambiguous date", () => {
      const rows = [{ "date_of_birth": "03/25/2020" }];
      expect(detectDateFormat(rows)).toBe("mdy");
    });

    it("defaults to DMY for ambiguous dates", () => {
      const rows = [{ "Geboortedatum": "05-03-2020" }];
      expect(detectDateFormat(rows)).toBe("dmy");
    });
  });
});
