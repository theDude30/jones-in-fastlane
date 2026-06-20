import type { LocationType } from "@jones/config";

const COLOR_BY_TYPE: Record<LocationType, string> = {
  apartment: "#ffe2b0",
  store: "#cfe3ff",
  service: "#d8f5d0",
  workplace: "#ffd2a8",
};

/** When a location has multiple types, the first matching type here wins. */
const PRIORITY: LocationType[] = ["apartment", "store", "service", "workplace"];

export function buildingColor(types: LocationType[]): string {
  for (const type of PRIORITY) {
    if (types.includes(type)) return COLOR_BY_TYPE[type];
  }
  throw new Error(`no color defined for location types: ${types.join(",")}`);
}
