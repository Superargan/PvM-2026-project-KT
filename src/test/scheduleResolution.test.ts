import { describe, it, expect } from "vitest";
import {
  resolveSchedule,
  formatResolvedSchedule,
  formatScheduleCompact,
  validateBreakTimePair,
  SCHEDULE_SEGMENT_LABELS,
} from "@/lib/schoolTimes";

describe("resolveSchedule", () => {
  it("returns 3 segments for traditional with full break info", () => {
    const result = resolveSchedule({
      schedule_type: "traditioneel",
      school_start_time: "08:30:00",
      school_end_time: "15:00:00",
      break_start_time: "11:45:00",
      break_end_time: "12:30:00",
    });
    expect(result.isTraditional).toBe(true);
    if (!result.isTraditional) return;
    expect(result.segments).toHaveLength(3);
    expect(result.segments[0].label).toBe("Ochtend");
    expect(result.segments[0].start).toBe("08:30");
    expect(result.segments[0].end).toBe("11:45");
    expect(result.segments[0].isBreak).toBe(false);
    expect(result.segments[1].label).toBe("Pauze");
    expect(result.segments[1].start).toBe("11:45");
    expect(result.segments[1].end).toBe("12:30");
    expect(result.segments[1].isBreak).toBe(true);
    expect(result.segments[2].label).toBe("Middag");
    expect(result.segments[2].start).toBe("12:30");
    expect(result.segments[2].end).toBe("15:00");
    expect(result.segments[2].isBreak).toBe(false);
  });

  it("segment order is always Ochtend -> Pauze -> Middag", () => {
    const result = resolveSchedule({
      schedule_type: "traditioneel",
      school_start_time: "08:00:00",
      school_end_time: "14:45:00",
      break_start_time: "12:00:00",
      break_end_time: "12:45:00",
    });
    expect(result.isTraditional).toBe(true);
    if (!result.isTraditional) return;
    expect(result.segments.map(s => s.label)).toEqual(["Ochtend", "Pauze", "Middag"]);
  });

  it("pauze is not teaching time", () => {
    const result = resolveSchedule({
      schedule_type: "traditioneel",
      school_start_time: "08:30:00",
      school_end_time: "15:00:00",
      break_start_time: "11:45:00",
      break_end_time: "12:30:00",
    });
    if (!result.isTraditional) return;
    const breakSeg = result.segments.find(s => s.isBreak);
    expect(breakSeg).toBeDefined();
    expect(breakSeg!.label).toBe("Pauze");
    // Morning ends where break starts, afternoon starts where break ends
    expect(result.segments[0].end).toBe(result.segments[1].start);
    expect(result.segments[1].end).toBe(result.segments[2].start);
  });

  it("returns 1 segment for traditional without break times (incomplete)", () => {
    const result = resolveSchedule({
      schedule_type: "traditioneel",
      school_start_time: "08:30:00",
      school_end_time: "15:00:00",
    });
    expect(result.isTraditional).toBe(true);
    if (!result.isTraditional) return;
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].label).toBe("Ochtend");
  });

  it("returns empty segments for traditional without any times", () => {
    const result = resolveSchedule({ schedule_type: "traditioneel" });
    expect(result.isTraditional).toBe(true);
    if (!result.isTraditional) return;
    expect(result.segments).toHaveLength(0);
  });

  it("returns only start/end for traditional with only morning known", () => {
    const result = resolveSchedule({
      schedule_type: "traditioneel",
      school_start_time: "08:30:00",
      school_end_time: "12:00:00",
    });
    expect(result.isTraditional).toBe(true);
    if (!result.isTraditional) return;
    expect(result.segments).toHaveLength(1);
  });

  it("returns continuous range for non-traditional", () => {
    const result = resolveSchedule({
      schedule_type: "continu",
      school_start_time: "08:30:00",
      school_end_time: "14:00:00",
    });
    expect(result.isTraditional).toBe(false);
    if (result.isTraditional === false) {
      expect(result.range).toBe("08:30 – 14:00");
    }
  });

  it("returns continuous range for null schedule_type", () => {
    const result = resolveSchedule({
      school_start_time: "08:30:00",
      school_end_time: "15:00:00",
    });
    expect(result.isTraditional).toBe(false);
  });

  it("non-traditional is not regressed by break time fields being present", () => {
    const result = resolveSchedule({
      schedule_type: "continu",
      school_start_time: "08:30:00",
      school_end_time: "14:00:00",
      break_start_time: "12:00:00",
      break_end_time: "12:30:00",
    });
    expect(result.isTraditional).toBe(false);
    if (result.isTraditional === false) {
      expect(result.range).toBe("08:30 – 14:00");
    }
  });
});

describe("formatResolvedSchedule", () => {
  it("formats traditional 3-segment schedule", () => {
    const resolved = resolveSchedule({
      schedule_type: "traditioneel",
      school_start_time: "08:30:00",
      school_end_time: "15:00:00",
      break_start_time: "11:45:00",
      break_end_time: "12:30:00",
    });
    expect(formatResolvedSchedule(resolved)).toBe(
      "Ochtend 08:30 – 11:45 | Pauze 11:45 – 12:30 | Middag 12:30 – 15:00"
    );
  });

  it("formats continuous schedule", () => {
    const resolved = resolveSchedule({
      schedule_type: "continu",
      school_start_time: "08:30:00",
      school_end_time: "14:00:00",
    });
    expect(formatResolvedSchedule(resolved)).toBe("08:30 – 14:00");
  });

  it("formats empty traditional as —", () => {
    const resolved = resolveSchedule({ schedule_type: "traditioneel" });
    expect(formatResolvedSchedule(resolved)).toBe("—");
  });
});

describe("formatScheduleCompact", () => {
  it("shows morning/afternoon split for 3-segment traditional", () => {
    const resolved = resolveSchedule({
      schedule_type: "traditioneel",
      school_start_time: "08:30:00",
      school_end_time: "15:00:00",
      break_start_time: "11:45:00",
      break_end_time: "12:30:00",
    });
    expect(formatScheduleCompact(resolved)).toBe("08:30–11:45 / 12:30–15:00");
  });

  it("shows pauze onbekend for incomplete traditional", () => {
    const resolved = resolveSchedule({
      schedule_type: "traditioneel",
      school_start_time: "08:30:00",
      school_end_time: "15:00:00",
    });
    expect(formatScheduleCompact(resolved)).toBe("08:30 – 15:00 (pauze onbekend)");
  });

  it("shows — for empty traditional", () => {
    const resolved = resolveSchedule({ schedule_type: "traditioneel" });
    expect(formatScheduleCompact(resolved)).toBe("—");
  });

  it("shows range for continuous", () => {
    const resolved = resolveSchedule({
      schedule_type: "continu",
      school_start_time: "08:30:00",
      school_end_time: "14:00:00",
    });
    expect(formatScheduleCompact(resolved)).toBe("08:30 – 14:00");
  });
});

describe("validateBreakTimePair", () => {
  it("both null is valid", () => {
    expect(validateBreakTimePair(null, null)).toEqual({ valid: true });
  });

  it("both filled and ordered is valid", () => {
    expect(validateBreakTimePair("11:45", "12:30")).toEqual({ valid: true });
  });

  it("partial is invalid", () => {
    expect(validateBreakTimePair("11:45", null).valid).toBe(false);
    expect(validateBreakTimePair(null, "12:30").valid).toBe(false);
  });

  it("break end before break start is invalid", () => {
    expect(validateBreakTimePair("12:30", "11:45").valid).toBe(false);
  });

  it("break before school start is invalid", () => {
    const r = validateBreakTimePair("08:00", "08:30", "08:30", "15:00");
    expect(r.valid).toBe(false);
  });

  it("break after school end is invalid", () => {
    const r = validateBreakTimePair("14:30", "15:30", "08:30", "15:00");
    expect(r.valid).toBe(false);
  });

  it("break within school hours is valid", () => {
    const r = validateBreakTimePair("11:45", "12:30", "08:30", "15:00");
    expect(r.valid).toBe(true);
  });

  it("break without school times is valid (no boundary check)", () => {
    const r = validateBreakTimePair("11:45", "12:30", null, null);
    expect(r.valid).toBe(true);
  });
});

describe("SCHEDULE_SEGMENT_LABELS", () => {
  it("has correct labels", () => {
    expect(SCHEDULE_SEGMENT_LABELS.morning).toBe("Ochtend");
    expect(SCHEDULE_SEGMENT_LABELS.break).toBe("Pauze");
    expect(SCHEDULE_SEGMENT_LABELS.afternoon).toBe("Middag");
  });
});
