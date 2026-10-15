// Canonical sector list — the single source of truth for map dot colors,
// the Sector Legend, the sector filter, and the dashboard.
// Order here is the order shown in the legend.
// To add or rename a sector, edit this list (and use the same spelling in the spreadsheet).

export const OTHER_SECTOR = 'Other';

export const SECTORS = [
  { key: 'Nonprofit/CBO', color: '#2B6CB0' },
  { key: 'For-Profit', color: '#DD6B20' },
  { key: 'Government Agency', color: '#4A5568' },
  { key: 'K-12 School/School District', color: '#D53F8C' },
  { key: 'College/University', color: '#6B46C1' },
  { key: 'Labor', color: '#C53030' },
  { key: 'Farm', color: '#2F855A' },
  { key: 'Foundation', color: '#B7791F' },
  { key: OTHER_SECTOR, color: '#319795' },
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
