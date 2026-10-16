// npm run sync — refresh the two data files the site keeps in the repo:
//   src/data/geocode-cache.json  map locations for addresses, each looked up once (OpenStreetMap's Nominatim)
//   src/data/snapshot.json       saved copy of the sheet, shown whenever the live sheet can't be read
// The site itself reads the sheet live. This runs every night (.github/workflows/refresh-data.yml) so new
// addresses get a map location and the saved copy stays recent.
//
//   npm run sync                  read the published sheet, look up new addresses, save both files
//   npm run sync -- --dry-run     same report, but no address lookups and no files written
//   SHEET_CSV_PATH=tests/fixtures/sheet.csv npm run sync -- --dry-run    read a local CSV instead

import { realpathSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as wait } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { SHEET_CSV_URL } from '../src/config/googleSheets.js';
import { cleanAddress, geocodeCacheKey, parseManualCoords } from '../src/lib/address.js';
import { resolveColumns } from '../src/lib/columns.js';
import { buildDataset, parseCSV } from '../src/lib/organizations.js';

const CACHE_PATH = fileURLToPath(new URL('../src/data/geocode-cache.json', import.meta.url));
const SNAPSHOT_PATH = fileURLToPath(new URL('../src/data/snapshot.json', import.meta.url));

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'FoodSystemsStakeholderSurvey/1.0 (lacountyfoodsystems.org)';
const REQUEST_GAP_MS = 1100; // Nominatim allows at most one request per second
const TIMEOUT_MS = 30_000;

// Addresses Nominatim couldn't find, located by hand (carried over from the original geocoding script).
// Keys are the search strings from geocodeQueries().
export const FALLBACK_COORDS = {
  '7412 Fulton Ave Suite , North Hollywood, CA, Los Angeles, CA': [34.204976, -118.422009],
  '12860 Crossroads Prkwy. South, Los Angeles, CA': [34.028243, -118.024345],
  '3530 Wilshire Blvd, 8th Floor, Los Angeles, CA 90010, Los Angeles, CA': [34.061028, -118.3012],
  '3530 Wilshire Blvd., Suite 800. Los Angeles, CA': [34.061028, -118.3012],
  '7412 Fulton Ave Suite #3, North Hollywood, CA': [34.204976, -118.422009],
  '9595 Wilshire Blvd., Suite 510': [34.067321, -118.398273],
  '2000 Ave of the Stars #1000s, Los Angeles, CA 90067': [34.05758, -118.416932],
  '1710 22ND STREET, Santa Monica': [34.025681, -118.478065],
  '1231 N. Spring Street, Suite C-102': [34.06985, -118.236465],
  '222 E Glenarm Street Ste B2 Pasadena, CA 91106': [34.146061, -118.130084],
  '825 E Orange Grove Blvd, Pasadena, CA': [34.146061, -118.130084],
  '858 W Jackman St., Lancaster CA': [34.686682, -118.137425],
  '6636 Selma Avenue, Los Angeles CA': [34.100292, -118.327759],
  '840 Echo Park Ave, Los Angeles, CA': [34.073635, -118.2603],
  '1000 N. Alameda St. Suite 240, Los Angeles, CA': [34.06485, -118.2233],
  '750 N Alameda St, Los Angeles, CA': [34.06485, -118.2233],
  '961 S Mariposa Ave # 205, Los Angeles, CA': [34.047825, -118.304545],
  '717 W. Temple St., Los Angeles, CA': [34.05758, -118.2523],
  '1517 ASHLAND AVE, Los Angeles, CA': [34.025681, -118.478065],
  '3551 Trousdale Parkway, Los Angeles, CA': [34.022415, -118.28553],
  '5939 Hollywood Blvd, Los Angeles, CA': [34.100292, -118.327759],
  '1734 East 41st Street, Los Angeles CA': [34.007584, -118.239456],
  '11031 Camarillo ST, Los Angeles, CA': [34.237842, -118.445123],
  'Alvarado and Beverly, Los Angeles, CA': [34.06485, -118.278945],
  '2533 W 3rd st Los Angeles, CA': [34.06485, -118.278945],
  '1150 S Olive St, Los Angeles, CA': [34.045236, -118.255468],
  '1919 E El Segundo blvd compton CA': [33.916872, -118.220062],
  '922 Vine Street, Los Angeles, CA': [34.100292, -118.327759],
  'PO Box 32861 Long Beach CA': [33.77005, -118.193739],
  '1000 N. Alameda St., Los Angeles, CA': [34.06485, -118.2233],
  '961 S Mariposa Ave, Los Angeles, CA': [34.047825, -118.304545],
  '9595 Wilshire Blvd., Los Angeles, CA': [34.067321, -118.398273],
  '1734 East 41st Street, Los Angeles, CA': [34.007584, -118.239456],
  '2000 Ave of the Stars, Los Angeles, CA': [34.05758, -118.416932],
  '1710 22ND STREET, Los Angeles, CA': [34.025681, -118.478065],
  '2533 W 3rd st, Los Angeles, CA': [34.06485, -118.278945],
  '1919 E El Segundo blvd compton, Los Angeles, CA': [33.916872, -118.220062],
  '222 E Glenarm Street Pasadena, Los Angeles, CA': [34.146061, -118.130084],
  '1231 N. Spring Street, Los Angeles, CA': [34.06985, -118.236465],
  '858 W Jackman St., Lancaster, Los Angeles, CA': [34.686682, -118.137425],
  'PO Box 32861 Long Beach, Los Angeles, CA': [33.77005, -118.193739],
  '6636 Selma Avenue, Los Angeles, CA': [34.100292, -118.327759],
  '825 E Orange Grove Blvd, Pasadena, Los Angeles, CA': [34.146061, -118.130084],
  '1919 E El Segundo blvd compton CA 90222, Los Angeles, CA': [33.916872, -118.220062],
  '858 W Jackman St., Lanca, Los Angeles, CA': [34.686682, -118.137425],
  'PO Box 32861 Long Beach CA 90832, Los Angeles, CA': [33.77005, -118.193739],
  '858 W Jackman St., Lancaster CA, Los Angeles, CA': [34.686682, -118.137425],
  '2000 Ave of the Stars, Los Angeles, CA, 90067': [34.05758, -118.416932],
  '2000 Ave of the Stars, Los Angeles, CA 90067, Los Angeles, CA, 90067': [34.05758, -118.416932],
  '2000 Ave of the Stars #1000s, Los Angeles, CA': [34.05758, -118.416932],
  '510 S. Vermont Ave, 11th Floor, Los Angeles, CA': [34.05758, -118.291932],
  '510 S. Vermont Ave, 11th Floor, Los Angeles, Los Angeles, CA': [34.05758, -118.2919],
  '510 S Vermont Avenue, 11th Floor. Los Angeles, CA, Los Angeles, CA': [34.05758, -118.2919],
  '2000 Ave of the Stars #1000s, Los Angeles, CA 90067, Los Angeles, CA': [34.05758, -118.416932],
  '777 S Alameda St, 2nd Floor Los Angeles, CA 90021, Los Angeles, CA': [34.044161, -118.234436],
  '777 S Alameda St, 2nd Floor LA CA 90021, Los Angeles, CA': [34.044161, -118.234436],
  '500 W. Temple Street Room 383 Los Angeles, CA, Los Angeles, CA': [34.052895, -118.243759],
  'BOX 951405 2231 Murphy Hall, Los Angeles, CA': [34.068921, -118.445245],
  '1024 N. Maclay Ave. M-13 San Fernando, CA 91340, Los Angeles, CA': [34.28296, -118.434558],
  'PO Box 338 Rancho Cucamonga, CA 91729, Los Angeles, CA': [34.1064, -117.5931],
  '36355 Russell Blvd, Davis, CA, Los Angeles, CA': [38.539398, -121.742897],
};

/**
 * Search strings for an address, most specific first. Addresses that already name a California city
 * ("…, Carpinteria, CA 93013") are searched as typed; anything else is assumed to be in Los Angeles.
 * @returns {string[]}
 */
export function geocodeQueries(street, zip) {
  const cleaned = cleanAddress(street);
  if (!cleaned) return [];
  if (/,\s*(CA|California)\b/i.test(cleaned)) return [cleaned];
  const inLA = `${cleaned}, Los Angeles, CA`;
  return zip ? [`${inLA}, ${zip}`, inLA] : [inLA];
}

/** Hand-located coordinates for an address (FALLBACK_COORDS), or null. */
export function knownCoords(street, zip) {
  const query = geocodeQueries(street, zip).find((q) => Object.hasOwn(FALLBACK_COORDS, q));
  return query ? [...FALLBACK_COORDS[query]] : null;
}

/**
 * Whether an address is worth searching for. Without a street number Nominatim settles for some
 * same-named street: "Texas" with zip code 90277 came back as a street in Downey.
 */
export const hasStreetNumber = (street) => /\d/.test(cleanAddress(street) ?? '');

/**
 * Address lookups on Nominatim, at most one request per 1.1 s. The returned function resolves to
 * [lat, lng], or null when there's no match in California with the sheet's zip code; it throws when
 * Nominatim can't be reached, so that address is simply tried again next time.
 */
export function createGeocoder({ fetch = globalThis.fetch, sleep = wait } = {}) {
  let requests = 0;

  async function search(query, sheetZip) {
    if (requests++ > 0) await sleep(REQUEST_GAP_MS);
    const url = `${NOMINATIM_URL}?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=1`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Nominatim answered HTTP ${res.status}`);
    const [hit] = await res.json();
    // Only California counts, so a same-named street in another state never lands on the map.
    if (hit?.address?.state !== 'California') return null;
    // Nor does a match in another zip code than the sheet's: that's a different place with a similar name.
    const postcode = hit.address.postcode;
    if (sheetZip && postcode && !zipCodes(postcode).includes(sheetZip)) return null;
    const coords = [parseFloat(hit.lat), parseFloat(hit.lon)];
    return coords.every(Number.isFinite) ? coords : null;
  }

  return async function geocode(street, zip) {
    const sheetZip = zipCodes(zip)[0];
    for (const query of geocodeQueries(street, zip)) {
      const coords = await search(query, sheetZip);
      if (coords) return coords;
    }
    return null;
  };
}

/** The 5-digit zip codes in a text: "90277-1234" → ["90277"]. */
const zipCodes = (text) => String(text ?? '').match(/\b\d{5}\b/g) ?? [];

/**
 * The sheet as saved in src/data/snapshot.json. Contact names, email addresses and comments are left
 * out: the file is committed to a public repository. (Only the fallback copy loses emails; the live
 * site still reads them from the sheet.)
 */
export function toSnapshot(headers, rows, generatedAt) {
  const { map } = resolveColumns(headers);
  const privateColumns = new Set([map.contactName, map.email, map.comments].filter(Boolean));
  return {
    generatedAt,
    headers: headers.filter((header) => !privateColumns.has(header)),
    rows: rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !privateColumns.has(key)))),
  };
}

/** geocode-cache.json text: sorted by address, one address per line so changes are easy to review. */
export function formatCache(cache) {
  const lines = Object.keys(cache)
    .sort()
    .map((key) => `  ${JSON.stringify(key)}: ${JSON.stringify(cache[key])}`);
  return lines.length ? `{\n${lines.join(',\n')}\n}\n` : '{}\n';
}

/**
 * Read the sheet, look up addresses that were never tried, save the cache and snapshot, print the report.
 * @param {object} [options]
 * @param {string | null} [options.csvPath]  read this CSV file instead of downloading the published sheet
 * @param {boolean} [options.dryRun]         no address lookups and no files written
 * @returns {Promise<{ report: object, toLookUp: number, written: string[] }>}
 */
export async function sync({
  csvPath = null,
  dryRun = false,
  fetch = globalThis.fetch,
  sleep = wait,
  log = console.log,
  cachePath = CACHE_PATH,
  snapshotPath = SNAPSHOT_PATH,
  now = new Date(),
} = {}) {
  log(csvPath ? `Reading ${csvPath}` : 'Downloading the published spreadsheet');
  const { headers, rows } = parseCSV(csvPath ? await readFile(csvPath, 'utf8') : await downloadSheet(fetch));
  if (!rows.length) {
    throw new Error('the spreadsheet has no organization rows (is the "Organization Name" column still there?)');
  }

  const cacheText = await readIfExists(cachePath);
  const cache = cacheText ? JSON.parse(cacheText) : {};

  // Addresses that have never been looked up, from every row without usable lat/lng. Each row counts,
  // not just the organizations missing from the map: a merged organization shows its latest row's
  // address, which may be new even though an older row already puts a dot on the map. Addresses that
  // were looked up and not found are cached as null and not retried: add lat/lng in the sheet instead.
  const cols = resolveColumns(headers);
  const toLookUp = new Map();
  for (const row of rows) {
    if (parseManualCoords(cols.get(row, 'lat'), cols.get(row, 'lng')).coords) continue;
    const place = { row: row.__row, name: cols.get(row, 'name'), address: cols.get(row, 'address'), zip: cols.get(row, 'zip') };
    const key = geocodeCacheKey(place.address, place.zip);
    if (key && !Object.hasOwn(cache, key) && !toLookUp.has(key)) toLookUp.set(key, place);
  }

  if (toLookUp.size) {
    log(`\n${count(toLookUp.size, 'new address', 'new addresses')} to look up${dryRun ? ' (dry run: skipped)' : ''}:`);
  }
  const geocode = createGeocoder({ fetch, sleep });
  for (const [key, place] of toLookUp) {
    const label = `  row ${place.row}  ${place.name} — ${addressText(place)}`;
    const known = knownCoords(place.address, place.zip);
    if (known) {
      cache[key] = known;
      log(`${label}: found in the built-in address list`);
    } else if (!hasStreetNumber(place.address)) {
      cache[key] = null;
      log(`${label}: no street number, so not looked up (add lat/lng in the sheet)`);
    } else if (dryRun) {
      log(label);
    } else {
      try {
        cache[key] = await geocode(place.address, place.zip);
        log(`${label}: ${cache[key] ? 'found' : 'not found (add lat/lng in the sheet)'}`);
      } catch (err) {
        log(`${label}: lookup failed, will retry next time (${err.message})`);
      }
    }
  }

  const { report } = buildDataset(headers, rows, { geocodeCache: cache, fetchedAt: now.toISOString() });
  printReport(report, log);

  const written = [];
  if (dryRun) {
    log('\nDry run: no files written.');
  } else {
    const newCacheText = formatCache(cache);
    if (newCacheText !== cacheText) {
      await writeFile(cachePath, newCacheText);
      written.push(cachePath);
    }
    // Rewritten only when the sheet changed, so an unchanged sheet doesn't produce a commit every night.
    const snapshot = toSnapshot(headers, rows, now.toISOString());
    const savedText = await readIfExists(snapshotPath);
    const saved = savedText ? JSON.parse(savedText) : null;
    if (!saved || JSON.stringify([saved.headers, saved.rows]) !== JSON.stringify([snapshot.headers, snapshot.rows])) {
      await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
      written.push(snapshotPath);
    }
    log(written.length ? `\nSaved ${written.join(' and ')}` : '\nNo changes to save.');
  }
  return { report, toLookUp: toLookUp.size, written };
}

async function downloadSheet(fetch) {
  const res = await fetch(SHEET_CSV_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`couldn't download the spreadsheet (HTTP ${res.status})`);
  return res.text();
}

async function readIfExists(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/** The same numbers /data-check shows. */
function printReport(report, log) {
  const merged = report.sheetRows - report.uniqueOrganizations;
  log(
    `\n${count(report.sheetRows, 'row')} in the spreadsheet → ${count(merged, 'duplicate')} merged → ` +
      `${count(report.uniqueOrganizations, 'organization')} → ${report.onMap} on the map + ` +
      `${report.missingLocation.length} missing a location`,
  );
  log(`(${report.surveyRespondents} answered the survey, ${report.mapOnly} added for the map only)`);

  const section = (title, items, describe) => {
    log(`\n${title}: ${items.length ? items.length : 'none'}`);
    for (const item of items) log(`  ${describe(item)}`);
  };
  section('Missing a location', report.missingLocation, (m) => `row ${m.row}  ${m.name} — ${addressText(m) || 'no address'}`);
  section('Coordinate problems', report.coordinateIssues, (c) => `row ${c.row}  ${c.name} — ${c.issue}`);
  section('Sector not in the list (shown as Other)', report.unrecognizedSectors, (s) => `row ${s.row}  ${s.name} — "${s.value}"`);
  section('Blank sector (shown as Other)', report.blankSector, (s) => `row ${s.row}  ${s.name}`);
  section('Duplicates merged', report.duplicates, (d) => `rows ${d.rows.join(', ')}  ${d.name} (showing row ${d.keptRow})`);
  log(`\nMissing columns: ${report.missingColumns.join(', ') || 'none'}`);
}

const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Address and zip code, without repeating a zip code that's already in the address. */
const addressText = ({ address, zip }) => (zip && !address.includes(zip) ? [address, zip].filter(Boolean).join(', ') : address);

const USAGE = 'Usage: npm run sync [-- --dry-run]    (set SHEET_CSV_PATH=file.csv to read a local CSV instead)';

// Run only when started as a script, not when imported by the tests. realpath: Node resolves symlinks in
// import.meta.url but not in argv[1], so a checkout under a symlinked folder would otherwise do nothing.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => arg !== '--dry-run');
  if (unknown.length) {
    console.error(`Unknown option: ${unknown.join(' ')}\n${USAGE}`);
    process.exit(1);
  }
  sync({
    csvPath: process.env.SHEET_CSV_PATH || null,
    // `npm run sync --dry-run` (without the `--`) arrives as npm's own dry-run setting.
    dryRun: args.includes('--dry-run') || process.env.npm_config_dry_run === 'true',
  }).catch((err) => {
    console.error(`\nSync failed: ${err.message}`);
    process.exitCode = 1;
  });
}
