import { describe, it, expect } from "vitest";
import { computeSlotFit } from "@/components/group-composer/utils";
import type { AvailabilitySuggestion } from "@/components/group-composer/types";

function makeSuggestion(overrides: Partial<AvailabilitySuggestion> = {}): AvailabilitySuggestion {
  return {
    dayName: "maandag",
    startTime: "09:00",
    endTime: "10:30",
    overlap: 5,
    total: 8,
    clientIds: ["c1", "c2", "c3", "c4", "c5"],
    alternativesOnDay: 0,
    ...overrides,
  };
}

describe("computeSlotFit", () => {
  it("returns all selected as eligible when all fit the slot", () => {
    const selected = new Set(["c1", "c2", "c3"]);
    const suggestion = makeSuggestion({ clientIds: ["c1", "c2", "c3", "c4", "c5"] });
    const result = computeSlotFit(selected, suggestion);
    expect(result.optimalGroupSize).toBe(3);
    expect(result.eligibleClientIds).toEqual(["c1", "c2", "c3"]);
    expect(result.excludedClients).toEqual([]);
    expect(result.candidatePoolSize).toBe(3);
  });

  it("correctly splits candidate pool into eligible and excluded", () => {
    const selected = new Set(["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9", "c10", "c11"]);
    const suggestion = makeSuggestion({
      clientIds: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"],
      overlap: 8,
      total: 11,
    });
    const result = computeSlotFit(selected, suggestion);
    expect(result.optimalGroupSize).toBe(8);
    expect(result.candidatePoolSize).toBe(11);
    expect(result.excludedClients).toHaveLength(3);
    expect(result.excludedClients.map(e => e.clientId).sort()).toEqual(["c10", "c11", "c9"]);
    expect(result.excludedClients.every(e => e.reason === "niet_beschikbaar")).toBe(true);
  });

  it("returns zero eligible when no suggestion is active", () => {
    const selected = new Set(["c1", "c2"]);
    const result = computeSlotFit(selected, null);
    expect(result.optimalGroupSize).toBe(0);
    expect(result.excludedClients).toHaveLength(2);
    expect(result.candidatePoolSize).toBe(2);
  });

  it("returns zero for empty candidate pool", () => {
    const result = computeSlotFit(new Set(), makeSuggestion());
    expect(result.optimalGroupSize).toBe(0);
    expect(result.candidatePoolSize).toBe(0);
  });

  it("handles slot where none of the selected clients fit", () => {
    const selected = new Set(["c10", "c11", "c12"]);
    const suggestion = makeSuggestion({ clientIds: ["c1", "c2", "c3"] });
    const result = computeSlotFit(selected, suggestion);
    expect(result.optimalGroupSize).toBe(0);
    expect(result.excludedClients).toHaveLength(3);
    expect(result.candidatePoolSize).toBe(3);
  });

  it("excluded clients all have reason 'niet_beschikbaar'", () => {
    const selected = new Set(["c1", "c2", "c3"]);
    const suggestion = makeSuggestion({ clientIds: ["c1"] });
    const result = computeSlotFit(selected, suggestion);
    expect(result.excludedClients).toHaveLength(2);
    result.excludedClients.forEach(e => {
      expect(e.reason).toBe("niet_beschikbaar");
    });
  });

  it("ranking: slot with more eligible clients is better", () => {
    const selected = new Set(["c1", "c2", "c3", "c4", "c5"]);
    const slotA = makeSuggestion({ clientIds: ["c1", "c2", "c3"] });
    const slotB = makeSuggestion({ clientIds: ["c1", "c2", "c3", "c4", "c5"] });
    const fitA = computeSlotFit(selected, slotA);
    const fitB = computeSlotFit(selected, slotB);
    expect(fitB.optimalGroupSize).toBeGreaterThan(fitA.optimalGroupSize);
  });

  it("does not show 'groep van 11' when only 8 fit", () => {
    const selected = new Set(["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9", "c10", "c11"]);
    const suggestion = makeSuggestion({
      clientIds: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"],
    });
    const result = computeSlotFit(selected, suggestion);
    // The primary displayed size should be 8, not 11
    expect(result.optimalGroupSize).toBe(8);
    expect(result.optimalGroupSize).not.toBe(selected.size);
  });
});
