import { describe, it, expect } from "vitest";
import { format, addMonths, subDays } from "date-fns";
import {
  validateScenarioSlot,
  validateScenario,
  hasAvailabilityCoverage,
  buildAvailabilityByClient,
  type SlotValidationResult,
  type ScenarioValidationResult,
} from "@/lib/clientUtils";

// ===== Test helpers =====

const AREA_A = "area-a-uuid";
const AREA_B = "area-b-uuid";
const AREA_IDS = new Set([AREA_A, AREA_B]);

function makeSlot(overrides: Partial<Parameters<typeof validateScenarioSlot>[0]> = {}) {
  return {
    id: "slot-1",
    area_id: AREA_A,
    age_category: "8-12 jaar",
    mode: "proposal" as string | null,
    proposal_idx: 0,
    day_name: null as string | null,
    start_time: null as string | null,
    end_time: null as string | null,
    ...overrides,
  };
}

function makeClient(id: string, overrides: Partial<Record<string, any>> = {}) {
  return {
    id,
    first_name: "Test",
    last_name: "Client",
    waitlist_area_id: AREA_A,
    all_areas_flexible: false,
    intake_status: "wachtlijst",
    date_of_birth: "2015-01-01",
    ...overrides,
  };
}

function makeMember(clientId: string, hasOverride = false) {
  return { client_id: clientId, has_override: hasOverride };
}

/** Generate availability records that cover 4+ months ahead */
function makeGoodAvail(clientId: string, dayName = "maandag"): Record<string, any[]> {
  const records: any[] = [];
  const now = new Date();
  // Create weekly records for 5 months ahead
  for (let week = 0; week < 22; week++) {
    const d = new Date(now);
    d.setDate(d.getDate() + week * 7);
    // Adjust to target day
    records.push({
      client_id: clientId,
      available_date: format(d, "yyyy-MM-dd"),
      start_time: "09:00:00",
      end_time: "17:00:00",
    });
  }
  return buildAvailabilityByClient(records);
}

// ===== T11: Scenario geldig =====
describe("T11 — Scenario geldig", () => {
  it("returns geldig when all members valid with correct area/status", () => {
    const slot = makeSlot();
    const client = makeClient("c1");
    const clients = { c1: client };
    const members = [makeMember("c1")];
    const prefs = { c1: { [AREA_A]: 1 } };

    const result = validateScenarioSlot(
      slot, members, clients,
      {}, // no avail needed for proposal mode
      prefs,
      new Set(), // no programClients
      new Set(), // no overrides
      AREA_IDS
    );

    expect(result.status).toBe("geldig");
    expect(result.slotIssues).toHaveLength(0);
    expect(result.memberResults[0].status).toBe("geldig");
    expect(result.memberResults[0].issues).toHaveLength(0);
  });
});

// ===== T12: Scenario aandacht_vereist =====
describe("T12 — Scenario aandacht vereist", () => {
  it("returns aandacht_vereist when area doesn't match (no override)", () => {
    const slot = makeSlot({ area_id: AREA_B });
    const client = makeClient("c1", { waitlist_area_id: AREA_A });
    const clients = { c1: client };
    const members = [makeMember("c1")];

    const result = validateScenarioSlot(
      slot, members, clients,
      {},
      {}, // no prefs → no match to AREA_B
      new Set(),
      new Set(),
      AREA_IDS
    );

    expect(result.status).toBe("aandacht_vereist");
    expect(result.memberResults[0].issues).toContain(
      "Gebied matcht niet (geen primair, reserve of flexibel)"
    );
  });
});

// ===== T13: Scenario ongeldig =====
describe("T13 — Scenario ongeldig", () => {
  it("returns ongeldig when member has invalid status", () => {
    const slot = makeSlot();
    const client = makeClient("c1", { intake_status: "nieuw" });
    const clients = { c1: client };
    const members = [makeMember("c1")];

    const result = validateScenarioSlot(
      slot, members, clients,
      {}, {}, new Set(), new Set(), AREA_IDS
    );

    expect(result.status).toBe("ongeldig");
    expect(result.memberResults[0].issues).toContain("Status niet toelaatbaar: nieuw");
  });

  it("returns ongeldig when member is already planned (AC-2)", () => {
    const slot = makeSlot();
    const client = makeClient("c1");
    const clients = { c1: client };
    const members = [makeMember("c1")];

    const result = validateScenarioSlot(
      slot, members, clients,
      {}, {}, new Set(["c1"]), new Set(), AREA_IDS
    );

    expect(result.status).toBe("ongeldig");
    expect(result.memberResults[0].issues).toContain(
      "Deelnemer is al ingepland in een actief programma"
    );
  });
});

// ===== T15: Manual slot — eindtijd vóór starttijd =====
describe("T15 — Manual slot met eindtijd vóór starttijd", () => {
  it("returns ongeldig with issue about end time", () => {
    const slot = makeSlot({
      mode: "manual",
      day_name: "ma",
      start_time: "14:00",
      end_time: "10:00", // vóór start
    });

    const result = validateScenarioSlot(
      slot, [], {}, {}, {}, new Set(), new Set(), AREA_IDS
    );

    expect(result.status).toBe("ongeldig");
    expect(result.slotIssues).toContain("Eindtijd moet na starttijd liggen");
  });
});

// ===== T16: Proposal slot zonder proposal_idx =====
describe("T16 — Proposal slot incompleet", () => {
  it("returns ongeldig when proposal_idx is null", () => {
    const slot = makeSlot({ mode: "proposal", proposal_idx: null });

    const result = validateScenarioSlot(
      slot, [], {}, {}, {}, new Set(), new Set(), AREA_IDS
    );

    expect(result.status).toBe("ongeldig");
    expect(result.slotIssues).toContain("proposal_idx ontbreekt (proposal mode)");
  });
});

// ===== T17: Deelnemer niet meer geldig =====
describe("T17 — Deelnemer met niet-toelaatbare status", () => {
  it("returns ongeldig for status 'actief'", () => {
    const slot = makeSlot();
    const client = makeClient("c1", { intake_status: "actief" });
    const members = [makeMember("c1")];

    const result = validateScenarioSlot(
      slot, members, { c1: client },
      {}, {}, new Set(), new Set(), AREA_IDS
    );

    expect(result.status).toBe("ongeldig");
    expect(result.memberResults[0].issues.some(i => i.includes("Status niet toelaatbaar"))).toBe(true);
  });

  it("returns ongeldig for missing client", () => {
    const slot = makeSlot();
    const members = [makeMember("c-missing")];

    const result = validateScenarioSlot(
      slot, members, {},
      {}, {}, new Set(), new Set(), AREA_IDS
    );

    expect(result.status).toBe("ongeldig");
    expect(result.memberResults[0].issues).toContain("Deelnemer niet gevonden");
  });
});

// ===== T18: Beschikbaarheid gewijzigd =====
describe("T18 — Beschikbaarheid gewijzigd", () => {
  it("reports availability mismatch for manual slot", () => {
    const slot = makeSlot({
      mode: "manual",
      day_name: "ma",
      start_time: "09:00",
      end_time: "12:00",
    });
    const client = makeClient("c1");
    // Client has availability on dinsdag, not maandag
    const avail = buildAvailabilityByClient([
      { client_id: "c1", available_date: format(new Date(), "yyyy-MM-dd"), start_time: "09:00:00", end_time: "17:00:00" },
    ]);
    // Only works if the date happens to be a Tuesday; use a broader approach
    // Let's create availability that explicitly doesn't match "maandag"
    const wrongDayAvail: Record<string, any[]> = {
      c1: [{ dayOfWeek: 2, dayName: "dinsdag", startTime: "09:00:00", endTime: "17:00:00", date: format(new Date(), "yyyy-MM-dd") }],
    };

    const result = validateScenarioSlot(
      slot, [makeMember("c1")], { c1: client },
      wrongDayAvail,
      { c1: { [AREA_A]: 1 } },
      new Set(), new Set(), AREA_IDS
    );

    const memberResult = result.memberResults[0];
    expect(memberResult.issues.some(i => i.includes("Beschikbaarheid gewijzigd"))).toBe(true);
    expect(memberResult.status).not.toBe("geldig");
  });
});

// ===== T19: 4-maandsdekking ontbreekt =====
describe("T19 — 4-maandsdekking ontbreekt", () => {
  it("reports insufficient coverage when avail doesn't extend 4 months", () => {
    const slot = makeSlot({
      mode: "manual",
      day_name: "ma",
      start_time: "09:00",
      end_time: "12:00",
    });
    const client = makeClient("c1");
    // Availability only for 2 weeks (not 4 months)
    const shortAvail: Record<string, any[]> = {
      c1: [
        { dayOfWeek: 1, dayName: "maandag", startTime: "09:00:00", endTime: "17:00:00", date: format(new Date(), "yyyy-MM-dd") },
        { dayOfWeek: 1, dayName: "maandag", startTime: "09:00:00", endTime: "17:00:00", date: format(addMonths(new Date(), 1), "yyyy-MM-dd") },
      ],
    };

    const result = validateScenarioSlot(
      slot, [makeMember("c1")], { c1: client },
      shortAvail,
      { c1: { [AREA_A]: 1 } },
      new Set(), new Set(), AREA_IDS
    );

    const memberResult = result.memberResults[0];
    expect(memberResult.issues.some(i => i.includes("Onvoldoende dekking"))).toBe(true);
  });
});

// ===== T20: Gebied matcht niet meer =====
describe("T20 — Gebied matcht niet meer", () => {
  it("reports area mismatch when client area changed", () => {
    const slot = makeSlot({ area_id: AREA_B });
    const client = makeClient("c1", { waitlist_area_id: AREA_A, all_areas_flexible: false });

    const result = validateScenarioSlot(
      slot, [makeMember("c1")], { c1: client },
      {}, {}, // no prefs → no reserve match
      new Set(), new Set(), AREA_IDS
    );

    const memberResult = result.memberResults[0];
    expect(memberResult.issues).toContain("Gebied matcht niet (geen primair, reserve of flexibel)");
  });
});

// ===== T21: Geldige override =====
describe("T21 — Geldige override", () => {
  it("override covers area mismatch → member stays geldig", () => {
    const slot = makeSlot({ area_id: AREA_B });
    const client = makeClient("c1", { waitlist_area_id: AREA_A });

    const result = validateScenarioSlot(
      slot, [makeMember("c1", true)], { c1: client },
      {}, {},
      new Set(),
      new Set(["c1"]), // active override
      AREA_IDS
    );

    const memberResult = result.memberResults[0];
    expect(memberResult.issues).not.toContain("Gebied matcht niet (geen primair, reserve of flexibel)");
  });

  it("override covers missing availability → member stays geldig", () => {
    const slot = makeSlot({
      mode: "manual",
      day_name: "ma",
      start_time: "09:00",
      end_time: "12:00",
    });
    const client = makeClient("c1");

    const result = validateScenarioSlot(
      slot, [makeMember("c1", true)], { c1: client },
      {}, // no availability
      { c1: { [AREA_A]: 1 } },
      new Set(),
      new Set(["c1"]), // active override
      AREA_IDS
    );

    const memberResult = result.memberResults[0];
    expect(memberResult.issues).not.toContain("Geen beschikbaarheid ingevuld");
  });
});

// ===== T22: Override vervallen =====
describe("T22 — Override vervallen", () => {
  it("reports expired override when has_override=true but not in active set", () => {
    const slot = makeSlot();
    const client = makeClient("c1");

    const result = validateScenarioSlot(
      slot, [makeMember("c1", true)], { c1: client },
      {}, { c1: { [AREA_A]: 1 } },
      new Set(),
      new Set(), // override NOT active
      AREA_IDS
    );

    const memberResult = result.memberResults[0];
    expect(memberResult.issues).toContain("Override vervallen");
    expect(memberResult.status).not.toBe("geldig");
  });
});

// ===== T03/T04: Slot-set edge cases (pure logic) =====
describe("T03/T04 — Lege slot-set en slot zonder members", () => {
  it("T03: empty slot set → scenario validates as geldig", () => {
    const result = validateScenario(
      [], // no slots
      {},
      {},
      {},
      {},
      new Set(),
      new Set(),
      AREA_IDS
    );

    expect(result.status).toBe("geldig");
    expect(result.slotResults).toHaveLength(0);
  });

  it("T04: slot without members → slot validates as geldig (no member issues)", () => {
    const slot = makeSlot();
    const result = validateScenario(
      [slot],
      { "slot-1": [] }, // no members
      {},
      {},
      {},
      new Set(),
      new Set(),
      AREA_IDS
    );

    expect(result.status).toBe("geldig");
    expect(result.slotResults).toHaveLength(1);
    expect(result.slotResults[0].memberResults).toHaveLength(0);
  });
});

// ===== T35: Actuele validatie overschrijft snapshot =====
describe("T35 — Actuele validatie overschrijft snapshot", () => {
  it("same data validates identically each time (deterministic)", () => {
    const slot = makeSlot();
    const client = makeClient("c1");
    const args: Parameters<typeof validateScenario> = [
      [slot],
      { "slot-1": [makeMember("c1")] },
      { c1: client },
      {},
      { c1: { [AREA_A]: 1 } },
      new Set(),
      new Set(),
      AREA_IDS,
    ];

    const result1 = validateScenario(...args);
    const result2 = validateScenario(...args);

    expect(result1.status).toBe(result2.status);
    expect(result1.slotResults[0].status).toBe(result2.slotResults[0].status);
  });

  it("validation changes when underlying data changes", () => {
    const slot = makeSlot();
    const clientOk = makeClient("c1", { intake_status: "wachtlijst" });
    const clientBad = makeClient("c1", { intake_status: "nieuw" });

    const resultOk = validateScenario(
      [slot],
      { "slot-1": [makeMember("c1")] },
      { c1: clientOk },
      {}, { c1: { [AREA_A]: 1 } },
      new Set(), new Set(), AREA_IDS
    );

    const resultBad = validateScenario(
      [slot],
      { "slot-1": [makeMember("c1")] },
      { c1: clientBad },
      {}, { c1: { [AREA_A]: 1 } },
      new Set(), new Set(), AREA_IDS
    );

    expect(resultOk.status).toBe("geldig");
    expect(resultBad.status).toBe("ongeldig");
  });
});

// ===== T36: Wijziging in aanmeldgegevens werkt door =====
describe("T36 — Aanmeldingen leidend", () => {
  it("area change in client data reflects in validation", () => {
    const slot = makeSlot({ area_id: AREA_A });

    // Client originally in AREA_A → geldig
    const clientInA = makeClient("c1", { waitlist_area_id: AREA_A });
    const r1 = validateScenarioSlot(
      slot, [makeMember("c1")], { c1: clientInA },
      {}, {}, new Set(), new Set(), AREA_IDS
    );
    expect(r1.memberResults[0].status).toBe("geldig");

    // Client moved to AREA_B → aandacht_vereist (no longer matches slot AREA_A)
    const clientInB = makeClient("c1", { waitlist_area_id: AREA_B, all_areas_flexible: false });
    const r2 = validateScenarioSlot(
      slot, [makeMember("c1")], { c1: clientInB },
      {}, {}, new Set(), new Set(), AREA_IDS
    );
    expect(r2.memberResults[0].issues).toContain(
      "Gebied matcht niet (geen primair, reserve of flexibel)"
    );
  });

  it("status change in client data reflects in validation", () => {
    const slot = makeSlot();

    // Status wachtlijst → geldig
    const r1 = validateScenarioSlot(
      slot, [makeMember("c1")],
      { c1: makeClient("c1", { intake_status: "wachtlijst" }) },
      {}, {}, new Set(), new Set(), AREA_IDS
    );
    expect(r1.memberResults[0].status).toBe("geldig");

    // Status changed to 'actief' → ongeldig
    const r2 = validateScenarioSlot(
      slot, [makeMember("c1")],
      { c1: makeClient("c1", { intake_status: "actief" }) },
      {}, {}, new Set(), new Set(), AREA_IDS
    );
    expect(r2.memberResults[0].status).toBe("ongeldig");
  });
});

// ===== Scenario-level aggregation =====
describe("Scenario-level aggregation", () => {
  it("1 geldig + 1 ongeldig → ongeldig", () => {
    const slotOk = makeSlot({ id: "s1" });
    const slotBad = makeSlot({ id: "s2" });
    const clientOk = makeClient("c1");
    const clientBad = makeClient("c2", { intake_status: "nieuw" });

    const result = validateScenario(
      [slotOk, slotBad],
      { s1: [makeMember("c1")], s2: [makeMember("c2")] },
      { c1: clientOk, c2: clientBad },
      {},
      { c1: { [AREA_A]: 1 }, c2: { [AREA_A]: 1 } },
      new Set(), new Set(), AREA_IDS
    );

    expect(result.status).toBe("ongeldig");
  });

  it("1 geldig + 1 aandacht → aandacht_vereist", () => {
    const slotOk = makeSlot({ id: "s1" });
    const slotWarn = makeSlot({ id: "s2", area_id: AREA_B });
    const clientOk = makeClient("c1");
    const clientMismatch = makeClient("c2", { waitlist_area_id: AREA_A }); // doesn't match AREA_B

    const result = validateScenario(
      [slotOk, slotWarn],
      { s1: [makeMember("c1")], s2: [makeMember("c2")] },
      { c1: clientOk, c2: clientMismatch },
      {},
      { c1: { [AREA_A]: 1 } }, // c2 has no prefs for AREA_B
      new Set(), new Set(), AREA_IDS
    );

    expect(result.status).toBe("aandacht_vereist");
  });

  it("all geldig → geldig", () => {
    const result = validateScenario(
      [makeSlot({ id: "s1" }), makeSlot({ id: "s2" })],
      { s1: [makeMember("c1")], s2: [makeMember("c2")] },
      { c1: makeClient("c1"), c2: makeClient("c2") },
      {},
      { c1: { [AREA_A]: 1 }, c2: { [AREA_A]: 1 } },
      new Set(), new Set(), AREA_IDS
    );

    expect(result.status).toBe("geldig");
  });
});

// ===== hasAvailabilityCoverage =====
describe("hasAvailabilityCoverage", () => {
  it("returns false for empty/undefined", () => {
    expect(hasAvailabilityCoverage(undefined)).toBe(false);
    expect(hasAvailabilityCoverage([])).toBe(false);
  });

  it("returns false when only past dates", () => {
    expect(hasAvailabilityCoverage([
      { date: "2020-01-01" },
    ])).toBe(false);
  });

  it("returns false when future but not 3 months ahead", () => {
    const tomorrow = format(new Date(Date.now() + 86400000), "yyyy-MM-dd");
    expect(hasAvailabilityCoverage([
      { date: tomorrow },
    ])).toBe(false);
  });

  it("returns true when has records beyond 3 months", () => {
    const tomorrow = format(new Date(Date.now() + 86400000), "yyyy-MM-dd");
    const fiveMonths = format(addMonths(new Date(), 5), "yyyy-MM-dd");
    expect(hasAvailabilityCoverage([
      { date: tomorrow },
      { date: fiveMonths },
    ])).toBe(true);
  });
});

// ===== Slot-level: invalid area =====
describe("Slot-level: invalid area_id", () => {
  it("reports invalid area when area_id not in areaIds set", () => {
    const slot = makeSlot({ area_id: "nonexistent-area" });
    const result = validateScenarioSlot(
      slot, [], {}, {}, {}, new Set(), new Set(), AREA_IDS
    );
    expect(result.status).toBe("ongeldig");
    expect(result.slotIssues).toContain("Ongeldig gebied");
  });
});

// ===== Manual slot missing day/time =====
describe("Manual slot missing fields", () => {
  it("reports missing day_name", () => {
    const slot = makeSlot({ mode: "manual", day_name: null, start_time: "09:00", end_time: "12:00" });
    const result = validateScenarioSlot(
      slot, [], {}, {}, {}, new Set(), new Set(), AREA_IDS
    );
    expect(result.slotIssues).toContain("Dag ontbreekt (manual mode)");
  });

  it("reports missing start/end time", () => {
    const slot = makeSlot({ mode: "manual", day_name: "ma", start_time: null, end_time: null });
    const result = validateScenarioSlot(
      slot, [], {}, {}, {}, new Set(), new Set(), AREA_IDS
    );
    expect(result.slotIssues).toContain("Start/eindtijd ontbreekt (manual mode)");
  });
});

// ===== Multiple issues accumulate correctly =====
describe("Multiple issues on same member", () => {
  it("member with bad status AND already planned → both issues present", () => {
    const slot = makeSlot();
    const client = makeClient("c1", { intake_status: "nieuw" });

    const result = validateScenarioSlot(
      slot, [makeMember("c1")], { c1: client },
      {}, {},
      new Set(["c1"]), // already planned
      new Set(), AREA_IDS
    );

    const issues = result.memberResults[0].issues;
    expect(issues.some(i => i.includes("Status niet toelaatbaar"))).toBe(true);
    expect(issues.some(i => i.includes("al ingepland"))).toBe(true);
    expect(result.memberResults[0].status).toBe("ongeldig");
  });
});
