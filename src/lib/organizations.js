// Turns the stakeholder spreadsheet into the organization list every page uses, plus a
// data-quality report for /data-check. Pure (no I/O), so it runs in Node (tests, sync script)
// and in the Cloudflare Worker.

import Papa from 'papaparse';
import { geocodeCacheKey, normalizeWebsite, parseManualCoords } from './address.js';
import { resolveColumns } from './columns.js';
import { districtLabel, parseDistrict, parseSPAs } from './districts.js';
import { isKnownSector, normalizeSector, OTHER_SECTOR } from './sectors.js';

// parseCSV stores each row's spreadsheet row number under this key, so row numbers stay right
// when blank rows are skipped (and survive being saved in src/data/snapshot.json).
const ROW_KEY = '__row';

// /data-check warns when the sheet has no column for one of these.
const EXPECTED_COLUMNS = ['name', 'sector', 'address', 'lat', 'lng', 'website'];

// When an organization appears on several rows, these blanks on the kept row are filled from the others.
const FILL_FIELDS = ['website', 'activity', 'address', 'zip', 'mission', 'email'];

const SURVEY_FIELDS = ['groups', 'goals', 'topGoal', 'objectives', 'topObjective', 'activities', 'challenges', 'capacity'];

/**
 * @typedef {object} Org
 * @property {string} id                 `row-${row}`
 * @property {number} row                spreadsheet row number (header is row 1)
 * @property {string} name
 * @property {string} sector             canonical key from SECTORS
 * @property {string} sectorRaw          as typed in the sheet
 * @property {boolean} isSurveyRespondent  row has a survey Timestamp
 * @property {string} address
 * @property {string} zip
 * @property {[number, number] | null} coordinates  [lat, lng]
 * @property {'sheet' | 'geocoded' | null} coordSource
 * @property {1 | 2 | 3 | 4 | 5 | 'countywide' | 0 | null} district  0 = outside LA County
 * @property {string} districtLabel
 * @property {'survey' | 'location' | null} districtSource
 * @property {string[]} otherDistricts   labels of other districts served
 * @property {string | null} primarySPA
 * @property {string[]} spas             primary + additional SPAs ('Countywide' allowed)
 * @property {string} mission
 * @property {string} activity
 * @property {string} website            clickable URL or ''
 * @property {string} email
 * @property {string} timestamp          survey Timestamp as written in the sheet
 * @property {Record<string, string> | null} survey  raw answers (groups, goals, topGoal, objectives,
 *   topObjective, activities, challenges, capacity); survey respondents only
 */

/**
 * @typedef {object} Report
 * @property {'live' | 'snapshot'} source
 * @property {string} fetchedAt
 * @property {number} sheetRows            rows with an organization name
 * @property {number} uniqueOrganizations  after merging duplicates (= onMap + missingLocation.length)
 * @property {number} surveyRespondents
 * @property {number} mapOnly              organizations that didn't answer the survey
 * @property {number} onMap                organizations with coordinates
 * @property {{ name: string, rows: number[], keptRow: number }[]} duplicates
 * @property {{ row: number, name: string, address: string, zip: string, sector: string }[]} missingLocation
 * @property {{ row: number, name: string, issue: string }[]} coordinateIssues
 * @property {{ row: number, name: string, value: string }[]} unrecognizedSectors  shown as Other
 * @property {{ row: number, name: string }[]} blankSector
 * @property {string[]} missingColumns
 */

/**
 * Parse the published sheet CSV. Rows without an organization name (including empty rows) are
 * dropped; each remaining row also carries its spreadsheet row number as `__row`.
 * @param {string} text
 * @returns {{ headers: string[], rows: Record<string, string>[] }}
 */
export function parseCSV(text) {
  // Empty lines are kept by papaparse so record i is always spreadsheet row i + 2; they have no
  // name, so dropping nameless rows below gives the same rows as skipEmptyLines: 'greedy'.
  const { data, meta } = Papa.parse(String(text ?? ''), { header: true, skipEmptyLines: false });
  const headers = meta.fields ?? [];
  const cols = resolveColumns(headers);
  const rows = [];
  data.forEach((row, i) => {
    if (cols.get(row, 'name')) rows.push({ ...row, [ROW_KEY]: i + 2 });
  });
  return { headers, rows };
}

/** Organization name → key for spotting the same organization on several rows. */
export function dedupeKey(name) {
  return String(name ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // accents: "Café" = "Cafe"
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Build the organization list and the /data-check report.
 * @param {string[]} headers
 * @param {Record<string, string>[]} rows  from parseCSV (or src/data/snapshot.json)
 * @param {{ geocodeCache?: Record<string, [number, number] | null>, districtLookup?: ((lat: number, lng: number) => number) | null, source?: 'live' | 'snapshot', fetchedAt?: string }} [options]
 * @returns {{ organizations: Org[], report: Report }}
 */
export function buildDataset(
  headers,
  rows,
  { geocodeCache = {}, districtLookup = null, source = 'live', fetchedAt = new Date().toISOString() } = {},
) {
  const cols = resolveColumns(headers);
  /** @type {Report} */
  const report = {
    source,
    fetchedAt,
    sheetRows: 0,
    uniqueOrganizations: 0,
    surveyRespondents: 0,
    mapOnly: 0,
    onMap: 0,
    duplicates: [],
    missingLocation: [],
    coordinateIssues: [],
    unrecognizedSectors: [],
    blankSector: [],
    missingColumns: EXPECTED_COLUMNS.filter((field) => !cols.map[field]),
  };

  // Group the rows of each organization (same name, ignoring case and punctuation).
  const groups = new Map();
  rows.forEach((raw, i) => {
    const org = readRow(raw, Number(raw[ROW_KEY]) || i + 2, cols, geocodeCache, report);
    if (!org) return;
    report.sheetRows++;
    const key = dedupeKey(org.name) || org.id;
    if (groups.has(key)) groups.get(key).push(org);
    else groups.set(key, [org]);
  });

  const organizations = [...groups.values()]
    .map((group) => (group.length > 1 ? mergeDuplicates(group, report) : group[0]))
    .sort((a, b) => a.row - b.row);

  for (const org of organizations) {
    // No district in the survey answers (farms, Kumu additions): use the map location.
    if (org.district === null && org.coordinates && districtLookup) {
      org.district = districtLookup(org.coordinates[0], org.coordinates[1]);
      org.districtLabel = districtLabel(org.district);
      org.districtSource = 'location';
    }
    if (org.isSurveyRespondent) report.surveyRespondents++;
    if (org.coordinates) report.onMap++;
    else report.missingLocation.push({ row: org.row, name: org.name, address: org.address, zip: org.zip, sector: org.sector });
  }
  report.uniqueOrganizations = organizations.length;
  report.mapOnly = organizations.length - report.surveyRespondents;

  return { organizations, report };
}

/** One sheet row → Org (district from the survey answer only), noting cell problems in the report. */
function readRow(raw, row, cols, geocodeCache, report) {
  const get = (field) => cols.get(raw, field);
  const name = get('name');
  if (!name) return null;

  const sectorRaw = get('sector');
  if (!sectorRaw) report.blankSector.push({ row, name });
  else if (!isKnownSector(sectorRaw)) report.unrecognizedSectors.push({ row, name, value: sectorRaw });

  const address = get('address');
  const zip = get('zip');
  const manual = parseManualCoords(get('lat'), get('lng'));
  if (manual.issue) report.coordinateIssues.push({ row, name, issue: manual.issue });
  let coordinates = manual.coords;
  let coordSource = coordinates ? 'sheet' : null;
  if (!coordinates) {
    const key = geocodeCacheKey(address, zip);
    const cached = key ? geocodeCache?.[key] : null;
    if (isLatLng(cached)) {
      coordinates = [cached[0], cached[1]];
      coordSource = 'geocoded';
    }
  }

  const district = parseDistrict(get('district'));
  const primarySPAs = parseSPAs(get('primarySPA'));
  const timestamp = get('timestamp');

  return {
    id: `row-${row}`,
    row,
    name,
    sector: normalizeSector(sectorRaw),
    sectorRaw,
    isSurveyRespondent: timestamp !== '',
    address,
    zip,
    coordinates,
    coordSource,
    district,
    districtLabel: districtLabel(district),
    districtSource: district === null ? null : 'survey',
    otherDistricts: unique(get('otherDistricts').split(',').map(parseDistrict).filter((d) => d !== null).map(districtLabel)),
    primarySPA: primarySPAs[0] ?? null,
    spas: unique([...primarySPAs, ...parseSPAs(get('additionalSPAs'))]),
    mission: get('mission'),
    activity: get('activity') || get('descriptor'),
    website: normalizeWebsite(get('website')),
    email: get('email'),
    timestamp,
    survey: timestamp ? Object.fromEntries(SURVEY_FIELDS.map((field) => [field, get(field)])) : null,
  };
}

/**
 * Keep the most recent survey response (else the first row) and fill its blanks from the other rows.
 * @param {Org[]} group  rows of one organization, in sheet order
 * @param {Report} report
 */
function mergeDuplicates(group, report) {
  const respondents = group.filter((org) => org.isSurveyRespondent);
  const kept = respondents.length
    ? respondents.reduce((latest, org) => (timestampValue(org.timestamp) > timestampValue(latest.timestamp) ? org : latest))
    : group[0];
  const others = group.filter((org) => org !== kept);

  for (const field of FILL_FIELDS) {
    if (kept[field]) continue;
    const donor = others.find((org) => org[field]);
    if (donor) kept[field] = donor[field];
  }
  if (!kept.coordinates) {
    // Coordinates typed into the sheet beat geocoded ones.
    const donor = others.find((org) => org.coordSource === 'sheet') || others.find((org) => org.coordinates);
    if (donor) {
      kept.coordinates = donor.coordinates;
      kept.coordSource = donor.coordSource;
    }
  }
  if (kept.sector === OTHER_SECTOR) {
    const donor = others.find((org) => org.sector !== OTHER_SECTOR);
    if (donor) {
      kept.sector = donor.sector;
      kept.sectorRaw = donor.sectorRaw;
    }
  }

  report.duplicates.push({ name: kept.name, rows: group.map((org) => org.row), keptRow: kept.row });
  return kept;
}

/** Google Forms timestamps ("8/21/2025 22:47:09") as sortable numbers; unreadable ones sort first. */
function timestampValue(text) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?)?/i.exec(text);
  if (!m) {
    const t = Date.parse(text);
    return Number.isNaN(t) ? -Infinity : t;
  }
  const [, month, day, year, hour = 0, minute = 0, second = 0, ampm] = m;
  const h = ampm ? (Number(hour) % 12) + (/^p/i.test(ampm) ? 12 : 0) : Number(hour);
  return Date.UTC(Number(year), Number(month) - 1, Number(day), h, Number(minute), Number(second));
}

const isLatLng = (v) => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite);

const unique = (list) => [...new Set(list)];
