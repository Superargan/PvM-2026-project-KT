/**
 * Central location abstraction layer.
 * Unifies schools and training_locations into a single resolved type
 * for consistent planning, filtering, validation and reporting.
 */

export type LocationSource = "school" | "training_location";

export interface ResolvedLocation {
  source: LocationSource;
  id: string;
  name: string;
  neighborhoodId: string | null;
  areaId: string | null;
  address: string | null;
}

/**
 * Resolve location for a program record.
 * Priority: training_location_id → school_id → null
 */
export function resolveLocationForProgram(
  program: any,
  schoolsMap: Map<string, any>,
  trainingLocationsMap: Map<string, any>
): ResolvedLocation | null {
  if (program.training_location_id) {
    const tl = trainingLocationsMap.get(program.training_location_id);
    if (tl) {
      return {
        source: "training_location",
        id: tl.id,
        name: tl.name,
        neighborhoodId: tl.neighborhood_id ?? null,
        areaId: tl.area_id ?? tl.neighborhoods?.area_id ?? null,
        address: tl.address ?? null,
      };
    }
  }
  if (program.school_id) {
    const s = schoolsMap.get(program.school_id);
    if (s) {
      return {
        source: "school",
        id: s.id,
        name: s.name,
        neighborhoodId: s.neighborhood_id ?? null,
        areaId: s.neighborhoods?.area_id ?? null,
        address: s.address ?? null,
      };
    }
  }
  return null;
}

/**
 * Resolve location for a scenario slot.
 * Priority: training_location_id → school_id → null
 */
export function resolveLocationForSlot(
  slot: any,
  schoolsMap: Map<string, any>,
  trainingLocationsMap: Map<string, any>
): ResolvedLocation | null {
  if (slot.training_location_id) {
    const tl = trainingLocationsMap.get(slot.training_location_id);
    if (tl) {
      return {
        source: "training_location",
        id: tl.id,
        name: tl.name,
        neighborhoodId: tl.neighborhood_id ?? null,
        areaId: tl.area_id ?? tl.neighborhoods?.area_id ?? null,
        address: tl.address ?? null,
      };
    }
  }
  if (slot.school_id) {
    const s = schoolsMap.get(slot.school_id);
    if (s) {
      return {
        source: "school",
        id: s.id,
        name: s.name,
        neighborhoodId: s.neighborhood_id ?? null,
        areaId: s.neighborhoods?.area_id ?? null,
        address: s.address ?? null,
      };
    }
  }
  return null;
}

/**
 * Get resolved location name from a program (with joined data).
 * Falls back to text location field, then area name.
 */
export function getResolvedLocationName(program: any): string {
  if (program.training_locations?.name) return program.training_locations.name;
  if (program.schools?.name) return program.schools.name;
  if (program.location) return program.location;
  if (program.areas?.name) return program.areas.name;
  return "—";
}

/**
 * Get location source label for display.
 */
export function getLocationSourceLabel(source: LocationSource): string {
  return source === "school" ? "School" : "Trainingslocatie";
}

/**
 * Build unified location options for select dropdowns.
 * Returns options grouped by source type.
 */
export interface LocationOption {
  id: string;
  name: string;
  source: LocationSource;
  neighborhoodId: string | null;
  areaId: string | null;
  label: string; // Display label with type prefix
}

export function buildLocationOptions(
  schools: any[],
  trainingLocations: any[]
): LocationOption[] {
  const options: LocationOption[] = [];

  for (const s of schools) {
    options.push({
      id: s.id,
      name: s.name,
      source: "school",
      neighborhoodId: s.neighborhood_id ?? null,
      areaId: s.neighborhoods?.area_id ?? null,
      label: s.name,
    });
  }

  for (const tl of trainingLocations) {
    options.push({
      id: tl.id,
      name: tl.name,
      source: "training_location",
      neighborhoodId: tl.neighborhood_id ?? null,
      areaId: tl.area_id ?? tl.neighborhoods?.area_id ?? null,
      label: tl.name,
    });
  }

  return options.sort((a, b) => a.name.localeCompare(b.name, "nl"));
}
