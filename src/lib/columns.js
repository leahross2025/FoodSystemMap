// Spreadsheet column lookup.
// Column headers are matched loosely (case/spacing-insensitive, and long survey questions
// by their opening words) so the sheet keeps working if a header is lightly edited or a
// new column like "Website" or "Activity (Kumu Service Category)" is added.

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

// Field → accepted header names (normalized). First match wins; exact matches are
// preferred over "starts with" matches.
export const FIELD_ALIASES = {
  timestamp: ['timestamp'],
  email: ['email address', 'email', 'contact email'],
  contactName: ['your name (first/last)', 'contact name'],
  name: ['organization name', 'org name', 'organization'],
  mission: ['organization mission statement', 'mission'],
  descriptor: ['provide one sentence descriptor of your primary activity'],
  activity: ['activity', 'kumu service category', 'service category'],
  sector: ['sector'],
  address: ['main org street address (headquarters)', 'address', 'street address'],
  zip: ['main org zip code', 'zip code', 'zip'],
  district: ['primary supervisorial district'],
  otherDistricts: ['other supervisorial district'],
  primarySPA: ['primary spa'],
  additionalSPAs: ['additional spa'],
  groups: ['indicate all of the food systems groups'],
  goals: ['which of the following la county roundtable action plan goals'],
  topGoal: ['if you had to choose the goal most aligned'],
  objectives: ['which of the following la county roundtable action plan objectives'],
  topObjective: ['if you had to choose the objective most aligned'],
  activities: ['how would you describe the activities of your organization'],
  challenges: ['what are the biggest challenges'],
  capacity: ['what types of capacity-building tools'],
  comments: ['additional questions or comments'],
  website: ['website', 'web site', 'website address', 'url', 'contact'],
  lat: ['lat', 'latitude'],
  lng: ['lng', 'lon', 'long', 'longitude'],
};

// "starts with" only counts at a word boundary, so "lat" never matches "latitude" here
// (that's handled by the explicit alias) and "contact" doesn't match "contact name".
function startsWithWord(header, alias) {
  if (!header.startsWith(alias)) return false;
  const next = header.charAt(alias.length);
  return next === '' || next === ' ' || next === '(' || next === ':' || next === '-';
}

/**
 * Build a resolver for one sheet's header row.
 * @param {string[]} headers
 * @returns {{ map: Record<string,string>, get: (row: Record<string,string>, field: string) => string }}
 */
export function resolveColumns(headers) {
  const normalized = headers.map((h) => ({ raw: h, n: norm(h) }));
  const claimed = new Set();
  const map = {};

  // Pass 1: exact header matches. Pass 2: "starts with" matches.
  for (const pass of ['exact', 'prefix']) {
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (map[field]) continue;
      for (const alias of aliases) {
        const hit = normalized.find(
          (h) => !claimed.has(h.raw) && (pass === 'exact' ? h.n === alias : startsWithWord(h.n, alias)),
        );
        if (hit) {
          map[field] = hit.raw;
          claimed.add(hit.raw);
          break;
        }
      }
    }
  }

  return {
    map,
    get(row, field) {
      const h = map[field];
      return h ? String(row[h] ?? '').trim() : '';
    },
  };
}
