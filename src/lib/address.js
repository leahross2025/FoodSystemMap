// Address helpers shared by the geocoding script and the live site.
// The cache key format must stay identical to the one used to build
// src/data/geocode-cache.json, or existing cached coordinates stop matching.

export function cleanAddress(street) {
  if (!street) return null;
  let cleaned = street.toString().trim();
  cleaned = cleaned.replace(/,?\s*USA\s*$/i, '').trim(); // Google Maps appends ", USA"
  cleaned = cleaned.replace(/\b(Suite|Ste\.?)\s*[A-Za-z0-9#\-]+/gi, '');
  cleaned = cleaned.replace(/\b#\s*[A-Za-z0-9\-]+/gi, '');
  cleaned = cleaned.replace(/\bFloor\s*\d+/gi, '');
  cleaned = cleaned.replace(/^[A-Za-z\s]+ and at /i, '');
  cleaned = cleaned.trim().replace(/^,+|,+$/g, '');
  return cleaned || null;
}

export function geocodeCacheKey(street, zipCode) {
  const cleaned = cleanAddress(street);
  if (!cleaned) return null;
  const zipPart = zipCode ? `, ${zipCode}` : '';
  return `${cleaned}, Los Angeles, CA${zipPart}`.toLowerCase();
}

// Rough California bounding box — catches typos and swapped lat/lng.
const CA = { latMin: 32.4, latMax: 42.1, lngMin: -124.6, lngMax: -114.1 };
const inCA = (lat, lng) => lat >= CA.latMin && lat <= CA.latMax && lng >= CA.lngMin && lng <= CA.lngMax;

/**
 * Validate coordinates typed into the sheet.
 * @returns {{ coords: [number, number] | null, issue: string | null }}
 */
export function parseManualCoords(latRaw, lngRaw) {
  const latText = String(latRaw ?? '').trim();
  const lngText = String(lngRaw ?? '').trim();
  if (!latText && !lngText) return { coords: null, issue: null };
  if (!latText || !lngText) {
    // Google Maps copies both numbers at once ("34.05223, -118.24368"), so they often go into one cell.
    const pair = (latText || lngText).match(/-?\d+(?:\.\d+)?/g);
    if (pair?.length === 2) {
      const both = parseManualCoords(pair[0], pair[1]);
      if (!both.coords || both.issue) return both;
      return { coords: both.coords, issue: `Both numbers are in the ${latText ? 'lat' : 'lng'} column — the map uses them, so you can leave it` };
    }
    return { coords: null, issue: 'Latitude or longitude is missing or not a number' };
  }
  const lat = parseFloat(latText.replace(/[^\d.\-]/g, ''));
  const lng = parseFloat(lngText.replace(/[^\d.\-]/g, ''));
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return { coords: null, issue: 'Latitude or longitude is missing or not a number' };
  }
  if (inCA(lat, lng)) return { coords: [lat, lng], issue: null };
  if (inCA(lng, lat)) return { coords: [lng, lat], issue: 'Latitude and longitude look swapped — shown on the map using the swapped values' };
  if (inCA(lat, -Math.abs(lng))) return { coords: [lat, -Math.abs(lng)], issue: 'Longitude should be negative — shown on the map with a minus sign added' };
  return { coords: null, issue: 'Coordinates are outside California' };
}

/** Normalize a website value into a clickable https URL, or '' if it isn't one. */
export function normalizeWebsite(raw) {
  let v = String(raw ?? '').trim();
  // An @ before the first "/" is an email address (or a login), not a website; later on it's
  // fine, e.g. https://www.youtube.com/@FoodForward.
  if (!v || /^(https?:\/\/)?[^/]*@/i.test(v) || /\s/.test(v)) return '';
  if (!/^https?:\/\//i.test(v)) {
    if (!/^[\w-]+(\.[\w-]+)+/.test(v)) return '';
    v = `https://${v}`;
  }
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
}
