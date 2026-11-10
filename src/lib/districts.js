// Supervisorial district + SPA helpers.
// District boundaries (simplified from LA County's official layer) are used to fill in the
// district for organizations that didn't answer the survey (farms, Kumu additions).

export const DISTRICTS = {
  1: 'District 1 – Hilda Solis',
  2: 'District 2 – Holly Mitchell',
  3: 'District 3 – Lindsey Horvath',
  4: 'District 4 – Janice Hahn',
  5: 'District 5 – Kathryn Barger',
};
export const OUTSIDE_COUNTY = 'Outside LA County';
export const NOT_SPECIFIED = 'Not specified';

/** "1st District- Hilda Solis" → 1 ; "Countywide" → 'countywide' ; '' → null */
export function parseDistrict(raw) {
  const v = String(raw ?? '').trim();
  if (!v) return null;
  if (/countywide/i.test(v)) return 'countywide';
  const m = v.match(/(\d)\s*(st|nd|rd|th)?\s*district/i) || v.match(/district\s*(\d)/i);
  return m ? Number(m[1]) : null;
}

export function districtLabel(d) {
  if (d === 'countywide') return 'Countywide';
  if (d === 0) return OUTSIDE_COUNTY;
  return DISTRICTS[d] || NOT_SPECIFIED;
}

/** "SPA 4- Metro LA (Boyle Heights, …)" , "SPA 6- South (…)" → ['SPA 4 – Metro LA', 'SPA 6 – South'] */
export function parseSPAs(raw) {
  const v = String(raw ?? '');
  if (!v.trim()) return [];
  if (/countywide/i.test(v)) return ['Countywide'];
  const out = [];
  const re = /SPA\s*(\d)\s*-?\s*([^(,]*)/gi;
  let m;
  while ((m = re.exec(v))) {
    const label = `SPA ${m[1]}${m[2].trim() ? ` – ${m[2].trim()}` : ''}`;
    if (!out.some((s) => s.startsWith(`SPA ${m[1]}`))) out.push(label);
  }
  return out;
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Build a lookup from a GeoJSON FeatureCollection whose features carry properties.DISTRICT.
 * @returns {(lat: number, lng: number) => number} district number, or 0 when outside the county
 */
export function makeDistrictLookup(geojson) {
  const shapes = (geojson?.features || []).map((f) => ({
    district: Number(f.properties.DISTRICT),
    polygons: f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates,
  }));
  return (lat, lng) => {
    const pt = [lng, lat];
    for (const s of shapes) {
      for (const poly of s.polygons) {
        if (pointInRing(pt, poly[0]) && !poly.slice(1).some((hole) => pointInRing(pt, hole))) return s.district;
      }
    }
    return 0;
  };
}
