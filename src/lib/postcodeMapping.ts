/**
 * Maps Rotterdam 4-digit postcodes to area names.
 * Used for auto-assigning schools to areas/neighborhoods based on address.
 */

const POSTCODE_TO_AREA: [number, number, string][] = [
  // [from, to, areaName]
  [3011, 3015, "Centrum"],
  [3021, 3029, "Delfshaven"],
  [3031, 3039, "Noord"],
  [3041, 3043, "Overschie"],
  [3044, 3046, "Overschie"],
  [3051, 3055, "Hillegersberg-Schiebroek"],
  [3056, 3059, "Hillegersberg-Schiebroek"],
  [3061, 3063, "Kralingen-Crooswijk"],
  [3064, 3069, "Prins Alexander"],
  [3071, 3073, "Feijenoord"],
  [3074, 3079, "IJsselmonde"],
  [3081, 3089, "Charlois"],
  [3151, 3151, "Hoek van Holland"],
  [3181, 3181, "Rozenburg"],
  [3191, 3194, "Hoogvliet"],
  [3195, 3196, "Pernis"],
];

/** Extract 4-digit postcode from an address string */
export function extractPostcode(address: string): number | null {
  const match = address.match(/\b(\d{4})\s?[A-Za-z]{2}\b/);
  return match ? parseInt(match[1], 10) : null;
}

/** Get area name from a 4-digit postcode */
export function getAreaFromPostcode(postcode: number): string | null {
  for (const [from, to, area] of POSTCODE_TO_AREA) {
    if (postcode >= from && postcode <= to) return area;
  }
  return null;
}

/** Get area name from an address string */
export function getAreaFromAddress(address: string): string | null {
  const pc = extractPostcode(address);
  return pc ? getAreaFromPostcode(pc) : null;
}
