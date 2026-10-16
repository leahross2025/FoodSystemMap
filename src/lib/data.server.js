// Server-only data loader for on-demand pages (`export const prerender = false`) and API routes.
// Reads the published Google Sheet live, so spreadsheet edits show up within minutes; if the
// sheet can't be read it falls back to the saved copy in src/data/snapshot.json.

import { SHEET_CSV_URL } from '../config/googleSheets.js';
import districtsGeojson from '../data/districts.json' with { type: 'json' };
import geocodeCache from '../data/geocode-cache.json' with { type: 'json' };
import snapshot from '../data/snapshot.json' with { type: 'json' };
import { makeDistrictLookup } from './districts.js';
import { buildDataset, parseCSV } from './organizations.js';

const MEMO_MS = 60_000;
const FETCH_TIMEOUT_MS = 8_000;

/** @type {{ at: number, data: Promise<ReturnType<typeof buildDataset>> } | null} */
let memo = null;

/** @type {ReturnType<typeof makeDistrictLookup> | null} */
let districtLookup = null;

/**
 * Organizations and the data-quality report, from the live sheet or the saved snapshot.
 * One result is shared by every request for 60 seconds, so callers must not modify it.
 * Requests that arrive while the sheet is being read wait for that same read.
 * @param {{ waitUntil(promise: Promise<unknown>): void }} [ctx]  the request's context
 *   (`Astro.locals.runtime.ctx`). When this request starts a read, the read is finished even if the
 *   visitor leaves, so the other requests waiting for it still get their answer.
 * @returns {Promise<ReturnType<typeof buildDataset>>}
 */
export function loadData(ctx) {
  if (!memo || Date.now() - memo.at >= MEMO_MS) {
    memo = { at: Date.now(), data: load() };
    ctx?.waitUntil(memo.data);
  }
  return memo.data;
}

async function load() {
  // Built on first use rather than when the Worker starts.
  districtLookup ??= makeDistrictLookup(districtsGeojson);
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
