export type StateBounds = {
  low: { latitude: number; longitude: number };
  high: { latitude: number; longitude: number };
};

export const STATE_GEO_BOUNDS: Partial<Record<string, StateBounds>> = {
  AL: { low: { latitude: 30.14, longitude: -88.47 }, high: { latitude: 35.01, longitude: -84.89 } },
  AK: {
    low: { latitude: 54.63, longitude: -179.15 },
    high: { latitude: 71.54, longitude: -129.99 },
  },
  AZ: {
    low: { latitude: 31.33, longitude: -114.82 },
    high: { latitude: 37.0, longitude: -109.04 },
  },
  AR: { low: { latitude: 33.0, longitude: -94.62 }, high: { latitude: 36.5, longitude: -89.64 } },
  CA: {
    low: { latitude: 32.53, longitude: -124.41 },
    high: { latitude: 42.01, longitude: -114.13 },
  },
  CO: {
    low: { latitude: 36.99, longitude: -109.06 },
    high: { latitude: 41.0, longitude: -102.04 },
  },
  CT: { low: { latitude: 40.95, longitude: -73.73 }, high: { latitude: 42.05, longitude: -71.79 } },
  DC: { low: { latitude: 38.79, longitude: -77.12 }, high: { latitude: 38.99, longitude: -76.91 } },
  DE: { low: { latitude: 38.45, longitude: -75.79 }, high: { latitude: 39.84, longitude: -75.05 } },
  FL: { low: { latitude: 24.52, longitude: -87.63 }, high: { latitude: 31.0, longitude: -80.03 } },
  GA: { low: { latitude: 30.36, longitude: -85.61 }, high: { latitude: 35.0, longitude: -80.84 } },
  HI: {
    low: { latitude: 18.91, longitude: -160.25 },
    high: { latitude: 22.24, longitude: -154.81 },
  },
  ID: {
    low: { latitude: 41.99, longitude: -117.24 },
    high: { latitude: 49.0, longitude: -111.04 },
  },
  IL: { low: { latitude: 36.97, longitude: -91.51 }, high: { latitude: 42.51, longitude: -87.49 } },
  IN: { low: { latitude: 37.77, longitude: -88.1 }, high: { latitude: 41.76, longitude: -84.78 } },
  IA: { low: { latitude: 40.38, longitude: -96.64 }, high: { latitude: 43.5, longitude: -90.14 } },
  KS: { low: { latitude: 36.99, longitude: -102.05 }, high: { latitude: 40.0, longitude: -94.59 } },
  KY: { low: { latitude: 36.5, longitude: -89.57 }, high: { latitude: 39.15, longitude: -81.96 } },
  LA: { low: { latitude: 28.92, longitude: -94.04 }, high: { latitude: 33.02, longitude: -88.82 } },
  ME: { low: { latitude: 43.06, longitude: -71.08 }, high: { latitude: 47.46, longitude: -66.95 } },
  MD: { low: { latitude: 37.91, longitude: -79.49 }, high: { latitude: 39.72, longitude: -75.05 } },
  MA: { low: { latitude: 41.24, longitude: -73.5 }, high: { latitude: 42.89, longitude: -69.93 } },
  MI: { low: { latitude: 41.7, longitude: -90.42 }, high: { latitude: 48.31, longitude: -82.41 } },
  MN: { low: { latitude: 43.5, longitude: -97.24 }, high: { latitude: 49.38, longitude: -89.49 } },
  MS: { low: { latitude: 30.17, longitude: -91.65 }, high: { latitude: 34.99, longitude: -88.1 } },
  MO: { low: { latitude: 35.99, longitude: -95.77 }, high: { latitude: 40.61, longitude: -89.1 } },
  MT: {
    low: { latitude: 44.36, longitude: -116.05 },
    high: { latitude: 49.0, longitude: -104.04 },
  },
  NE: { low: { latitude: 40.0, longitude: -104.05 }, high: { latitude: 43.0, longitude: -95.31 } },
  NV: { low: { latitude: 35.0, longitude: -120.01 }, high: { latitude: 42.0, longitude: -114.04 } },
  NH: { low: { latitude: 42.7, longitude: -72.56 }, high: { latitude: 45.31, longitude: -70.61 } },
  NJ: { low: { latitude: 38.93, longitude: -75.56 }, high: { latitude: 41.36, longitude: -73.89 } },
  NM: { low: { latitude: 31.33, longitude: -109.05 }, high: { latitude: 37.0, longitude: -103.0 } },
  NY: { low: { latitude: 40.5, longitude: -79.76 }, high: { latitude: 45.01, longitude: -71.86 } },
  NC: { low: { latitude: 33.84, longitude: -84.32 }, high: { latitude: 36.59, longitude: -75.46 } },
  ND: { low: { latitude: 45.93, longitude: -104.05 }, high: { latitude: 49.0, longitude: -96.55 } },
  OH: { low: { latitude: 38.4, longitude: -84.82 }, high: { latitude: 42.33, longitude: -80.52 } },
  OK: { low: { latitude: 33.62, longitude: -103.0 }, high: { latitude: 37.0, longitude: -94.43 } },
  OR: {
    low: { latitude: 41.99, longitude: -124.57 },
    high: { latitude: 46.24, longitude: -116.46 },
  },
  PA: { low: { latitude: 39.72, longitude: -80.52 }, high: { latitude: 42.27, longitude: -74.69 } },
  RI: { low: { latitude: 41.15, longitude: -71.87 }, high: { latitude: 42.02, longitude: -71.12 } },
  SC: { low: { latitude: 32.05, longitude: -83.35 }, high: { latitude: 35.22, longitude: -78.54 } },
  SD: {
    low: { latitude: 42.48, longitude: -104.06 },
    high: { latitude: 45.95, longitude: -96.44 },
  },
  TN: { low: { latitude: 34.98, longitude: -90.31 }, high: { latitude: 36.68, longitude: -81.65 } },
  TX: { low: { latitude: 25.84, longitude: -106.65 }, high: { latitude: 36.5, longitude: -93.51 } },
  UT: {
    low: { latitude: 36.99, longitude: -114.05 },
    high: { latitude: 42.0, longitude: -109.04 },
  },
  VT: { low: { latitude: 42.73, longitude: -73.44 }, high: { latitude: 45.02, longitude: -71.5 } },
  VA: { low: { latitude: 36.54, longitude: -83.68 }, high: { latitude: 39.47, longitude: -75.24 } },
  WA: {
    low: { latitude: 45.54, longitude: -124.73 },
    high: { latitude: 49.0, longitude: -116.92 },
  },
  WV: { low: { latitude: 37.2, longitude: -82.64 }, high: { latitude: 40.64, longitude: -77.72 } },
  WI: { low: { latitude: 42.49, longitude: -92.89 }, high: { latitude: 47.08, longitude: -86.25 } },
  WY: {
    low: { latitude: 40.99, longitude: -111.06 },
    high: { latitude: 45.01, longitude: -104.05 },
  },
};
