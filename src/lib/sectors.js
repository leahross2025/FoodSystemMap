// Canonical sector list — the single source of truth for map dot colors,
// the Sector Legend, the sector filter, and the dashboard.
// Order here is the order shown in the legend.
// Colors follow the Okabe-Ito color-blind-safe palette (yellow darkened, grey for Other) so
// dots stay distinguishable for readers with red-green color blindness.
// To add or rename a sector, edit this list (and use the same spelling in the spreadsheet).

export const OTHER_SECTOR = 'Other';

export const SECTORS = [
  { key: 'Nonprofit/CBO', color: '#0072B2' },
  { key: 'For-Profit', color: '#E69F00' },
  { key: 'Government Agency', color: '#2D3748' },
  { key: 'K-12 School/School District', color: '#CC79A7' },
  { key: 'College/University', color: '#56B4E9' },
  { key: 'Labor', color: '#D55E00' },
  { key: 'Farm', color: '#009E73' },
  { key: 'Foundation', color: '#D4B800' },
  { key: OTHER_SECTOR, color: '#8A94A6' },
];

export const SECTOR_COLORS = Object.fromEntries(SECTORS.map((s) => [s.key, s.color]));

const squash = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

// Spelling variants that clearly mean one sector. Free-text answers that don't match
// (e.g. the Google Form "Other:" write-in) fall into "Other" and are listed on /data-check.
const ALIASES = {
  nonprofit: 'Nonprofit/CBO',
  nonprofitorganization: 'Nonprofit/CBO',
  cbo: 'Nonprofit/CBO',
  communitybasedorganization: 'Nonprofit/CBO',
  forprofit: 'For-Profit',
  business: 'For-Profit',
  government: 'Government Agency',
  governmentagency: 'Government Agency',
  k12: 'K-12 School/School District',
  k12school: 'K-12 School/School District',
  schooldistrict: 'K-12 School/School District',
  college: 'College/University',
  university: 'College/University',
  labor: 'Labor',
  laborunion: 'Labor',
  farm: 'Farm',
  farms: 'Farm',
  foundation: 'Foundation',
  other: OTHER_SECTOR,
};
for (const s of SECTORS) ALIASES[squash(s.key)] = s.key;

/** Map any spreadsheet sector value to a canonical sector key. */
export function normalizeSector(raw) {
  const k = squash(raw);
  if (!k) return OTHER_SECTOR;
  return ALIASES[k] || OTHER_SECTOR;
}

/** True when the raw value is recognised (blank or free text returns false). */
export function isKnownSector(raw) {
  const k = squash(raw);
  return !!k && !!ALIASES[k];
}
