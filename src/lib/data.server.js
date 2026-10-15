// Server-only data loader for on-demand pages (`export const prerender = false`) and API routes.
// Reads the published Google Sheet live, so spreadsheet edits show up within minutes; if the
// sheet can't be read it falls back to the saved copy in src/data/snapshot.json.

import { SHEET_CSV_URL } from '../config/googleSheets.js';
import districtsGeojson from '../data/districts.json' with { type: 'json' };
import geocodeCache from '../data/geocode-cache.json' with { type: 'json' };
import snapshot from '../data/snapshot.json' with { type: 'json' };
import { makeDistrictLookup } from './districts.js';
import { buildDataset, parseCSV } from './organizations.js';

const districtLookup = makeDistrictLookup(districtsGeojson);

const MEMO_MS = 60_000;
const FETCH_TIMEOUT_MS = 8_000;

/** @type {{ at: number, data: ReturnType<typeof buildDataset> } | null} */
let memo = null;

/**
 * Organizations and the data-quality report, from the live sheet or the saved snapshot.
 * Each call gets its own copy, so callers may sort or modify the result.
 * @returns {Promise<ReturnType<typeof buildDataset>>}
 */
export async function loadData() {
  if (!memo || Date.now() - memo.at >= MEMO_MS) {
    const data = await load();
    memo = { at: Date.now(), data };
  }
  return structuredClone(memo.data);
}

async function load() {
  try {
    // Cloudflare caches the sheet for 5 minutes, so most requests never reach Google.
    const res = await fetch(SHEET_CSV_URL, {
      cf: { cacheTtl: 300, cacheEverything: true },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { headers, rows } = parseCSV(await res.text());
    if (!rows.length) throw new Error('no organization rows (is the "Organization Name" column still there?)');
    return buildDataset(headers, rows, { geocodeCache, districtLookup, source: 'live' });
  } catch (err) {
    console.warn(`Couldn't read the live spreadsheet, using the saved snapshot: ${err?.message ?? err}`);
    return buildDataset(snapshot.headers, snapshot.rows, {
      geocodeCache,
      districtLookup,
      source: 'snapshot',
      fetchedAt: snapshot.generatedAt,
    });
  }
}
