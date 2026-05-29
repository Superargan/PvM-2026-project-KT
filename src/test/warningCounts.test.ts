import { describe, it, expect } from "vitest";
import {
  buildAvailabilityByClient,
  buildPrefsByClientMap,
  getClientDataCompleteness,
} from "@/lib/clientUtils";

/**
 * Warning categories on the Planning page (WarningBar) are derived from
 * getClientDataCompleteness + a small exclusive-counting pass. These tests
 * lock in the per-category truth for the 3 categories that were "0" in the UI:
 *   - unusableAvailability (raw rows exist, but start_time === end_time)
 *   - noArea (waitlist/intake_afgerond zonder gebied of wijk)
 *   - isOverridden (admin override actief)
 */

const baseClient = {
  id: "c1",
  intake_status: "wachtlijst" as const,
  date_of_birth: "2017-01-01",
  waitlist_area_id: null,
  neighborhood_id: null,
  school_id: null,
  schools: null,
  neighborhoods: null,
};

describe("warning category fixtures — getClientDataCompleteness", () => {
  it("unusableAvailability: raw rows exist maar start_time === end_time", () => {
    const raw = [
      { client_id: "c1", available_date: "2026-06-01", start_time: "09:00", end_time: "09:00" },
    ];
    const availByClient = buildAvailabilityByClient(raw);
    const prefsByClient = buildPrefsByClientMap([
      { client_id: "c1", area_id: "a1", preference_order: 1 },
    ]);

    const comp = getClientDataCompleteness(
      { ...baseClient, waitlist_area_id: "a1" },
      availByClient,
      prefsByClient,
      new Set(),
    );

    expect(comp.requiresAvailability).toBe(true);
    expect(comp.hasAvailability).toBe(false); // gefilterd door builder
    expect(comp.hasUsableAvailability).toBe(false);
    // Raw rows wel aanwezig in input → planning telt dit als 'unusable'
    expect(raw.length).toBeGreaterThan(0);
  });

  it("noArea: geen waitlist_area_id, neighborhood_id of school", () => {
    const comp = getClientDataCompleteness(
      baseClient,
      {},
      {},
      new Set(),
    );

    expect(comp.requiresAvailability).toBe(true);
    expect(comp.hasArea).toBe(false);
    expect(comp.isOverridden).toBe(false);
  });

  it("isOverridden: client staat in overriddenClientIds", () => {
    const comp = getClientDataCompleteness(
      baseClient,
      {},
      {},
      new Set(["c1"]),
    );

    expect(comp.isOverridden).toBe(true);
  });
});

/**
 * Spiegel van de exclusieve telling in PlanningPage.warningCounts. Houdt de
 * categorieën onderling exclusief zodat 1 deelnemer nooit dubbel telt.
 */
function countExclusive(
  clients: Array<typeof baseClient & { id: string }>,
  rawAvail: { client_id: string; available_date: string; start_time: string | null; end_time: string | null }[],
  prefs: { client_id: string; area_id: string; preference_order: number }[],
  overridden: Set<string>,
) {
  const availByClient = buildAvailabilityByClient(rawAvail);
  const prefsByClient = buildPrefsByClientMap(prefs);
  const rawAvailCount: Record<string, number> = {};
  rawAvail.forEach((a) => {
    rawAvailCount[a.client_id] = (rawAvailCount[a.client_id] ?? 0) + 1;
  });

  let unusableAvail = 0;
  let noArea = 0;
  let overriddenCount = 0;
  let noAvail = 0;

  clients.forEach((c) => {
    const comp = getClientDataCompleteness(c, availByClient, prefsByClient, overridden);
    if (comp.isOverridden) return overriddenCount++;
    if (comp.requiresAvailability && !comp.hasArea) return noArea++;
    const rc = rawAvailCount[c.id] ?? 0;
    if (comp.requiresAvailability && rc > 0 && !comp.hasUsableAvailability) return unusableAvail++;
    if (comp.requiresAvailability && !comp.hasAvailability) return noAvail++;
  });

  return { unusableAvail, noArea, overriddenCount, noAvail };
}

describe("warningCounts exclusivity", () => {
  it("een deelnemer wordt nooit in meer dan één categorie geteld", () => {
    const c1 = { ...baseClient, id: "c1", waitlist_area_id: "a1" }; // unusable
    const c2 = { ...baseClient, id: "c2" }; // noArea
    const c3 = { ...baseClient, id: "c3", waitlist_area_id: "a1" }; // overridden
    const c4 = { ...baseClient, id: "c4", waitlist_area_id: "a1" }; // noAvail

    const raw = [
      { client_id: "c1", available_date: "2026-06-01", start_time: "09:00", end_time: "09:00" },
    ];
    const result = countExclusive([c1, c2, c3, c4], raw, [], new Set(["c3"]));

    expect(result).toEqual({ unusableAvail: 1, noArea: 1, overriddenCount: 1, noAvail: 1 });
  });
});