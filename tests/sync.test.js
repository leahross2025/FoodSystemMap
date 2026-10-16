import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createGeocoder, FALLBACK_COORDS, formatCache, geocodeQueries, knownCoords, sync, toSnapshot } from '../scripts/sync.js';
import { SHEET_CSV_URL } from '../src/config/googleSheets.js';
import geocodeCache from '../src/data/geocode-cache.json' with { type: 'json' };
import { parseCSV } from '../src/lib/organizations.js';

const SCRIPT = fileURLToPath(new URL('../scripts/sync.js', import.meta.url));
const FIXTURE = fileURLToPath(new URL('./fixtures/sheet.csv', import.meta.url));
const fixtureText = await readFile(FIXTURE, 'utf8');
const PRIVATE_COLUMNS = ['Your Name (First/Last)', 'Additional questions or comments'];

const inCalifornia = (lat, lon) => ({ lat: String(lat), lon: String(lon), address: { state: 'California' } });

/** A fake Nominatim: `places` maps a search string to its result; anything else finds nothing. */
function fakeNominatim(places = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    const u = new URL(url);
    assert.equal(`${u.origin}${u.pathname}`, 'https://nominatim.openstreetmap.org/search');
    const q = u.searchParams.get('q');
    calls.push({ q, params: Object.fromEntries(u.searchParams), init });
    return Response.json(places[q] ? [places[q]] : []);
  };
  return { fetch, calls };
}

/** fetch for tests that must not make any request: records the attempt and fails it. */
function noNetwork() {
  const calls = [];
  const fetch = async (url) => {
    calls.push(String(url));
    throw new Error('no network in tests');
  };
  return { fetch, calls };
}

/** A temporary folder with a copy of the real geocode cache; the snapshot file starts out missing. */
async function tempData(t) {
  const dir = await mkdtemp(join(tmpdir(), 'fsm-sync-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const cachePath = join(dir, 'geocode-cache.json');
  await copyFile(fileURLToPath(new URL('../src/data/geocode-cache.json', import.meta.url)), cachePath);
  return { cachePath, snapshotPath: join(dir, 'snapshot.json') };
}

const readIfExists = (path) => readFile(path, 'utf8').catch(() => null);

describe('geocodeQueries', () => {
  test('assumes Los Angeles, trying with the zip code first', () => {
    assert.deepEqual(geocodeQueries('1847 W 43rd Street', '90062'), [
      '1847 W 43rd Street, Los Angeles, CA, 90062',
      '1847 W 43rd Street, Los Angeles, CA',
    ]);
    assert.deepEqual(geocodeQueries('1847 W 43rd Street', ''), ['1847 W 43rd Street, Los Angeles, CA']);
  });

  test('searches addresses that already name a California city as typed', () => {
    assert.deepEqual(geocodeQueries('490 43rd St, Unit 332, Oakland, CA 94609', '94609'), ['490 43rd St, Unit 332, Oakland, CA 94609']);
    assert.deepEqual(geocodeQueries('4019 Clayton Ave W, Los Angeles, CA 90027, USA', '90027'), ['4019 Clayton Ave W, Los Angeles, CA 90027']);
  });

  test('drops suite numbers; nothing to search without an address', () => {
    assert.deepEqual(geocodeQueries('1000 N. Alameda St. Suite 240', ''), ['1000 N. Alameda St., Los Angeles, CA']);
    assert.deepEqual(geocodeQueries('', '90012'), []);
  });
});

describe('knownCoords', () => {
  test('uses the hand-located addresses from the original script', () => {
    assert.deepEqual(knownCoords('1150 S Olive St', '90015'), [34.045236, -118.255468]);
    assert.notEqual(knownCoords('1150 S Olive St', '90015'), FALLBACK_COORDS['1150 S Olive St, Los Angeles, CA']); // a copy
    assert.equal(knownCoords('1847 W 43rd Street', '90062'), null);
    assert.equal(knownCoords('', ''), null);
  });
});

describe('createGeocoder', () => {
  test("asks Nominatim with the app's User-Agent and returns the California match", async () => {
    const nominatim = fakeNominatim({ '1847 W 43rd Street, Los Angeles, CA, 90062': inCalifornia(34.0046, -118.3087) });
    const geocode = createGeocoder({ fetch: nominatim.fetch, sleep: async () => {} });
    assert.deepEqual(await geocode('1847 W 43rd Street', '90062'), [34.0046, -118.3087]);
    assert.equal(nominatim.calls.length, 1);
    const [{ params, init }] = nominatim.calls;
    assert.deepEqual(params, { format: 'json', q: '1847 W 43rd Street, Los Angeles, CA, 90062', addressdetails: '1', limit: '1' });
    assert.equal(init.headers['User-Agent'], 'FoodSystemsStakeholderSurvey/1.0 (lacountyfoodsystems.org)');
    assert.ok(init.signal instanceof AbortSignal);
  });

  test('ignores matches outside California, then tries without the zip code', async () => {
    const nominatim = fakeNominatim({
      'Texas, Los Angeles, CA, 90277': { lat: '31.2', lon: '-99.3', address: { state: 'Texas' } },
      '9415 Culver Blvd, Los Angeles, CA': inCalifornia(34.0218, -118.3965),
    });
    const geocode = createGeocoder({ fetch: nominatim.fetch, sleep: async () => {} });
    assert.equal(await geocode('Texas', '90277'), null);
    assert.deepEqual(await geocode('9415 Culver Blvd', '90232'), [34.0218, -118.3965]);
    assert.deepEqual(nominatim.calls.map((c) => c.q), [
      'Texas, Los Angeles, CA, 90277',
      'Texas, Los Angeles, CA',
      '9415 Culver Blvd, Los Angeles, CA, 90232',
      '9415 Culver Blvd, Los Angeles, CA',
    ]);
  });

  test('waits 1.1 s between requests', async () => {
    const sleeps = [];
    const geocode = createGeocoder({ fetch: fakeNominatim().fetch, sleep: async (ms) => sleeps.push(ms) });
    await geocode('1 Main St', '90012'); // 2 requests
    await geocode('2 Main St', ''); // 1 request
    assert.deepEqual(sleeps, [1100, 1100]);
  });

  test('throws when Nominatim answers with an error, so the address is retried next time', async () => {
    const geocode = createGeocoder({ fetch: async () => new Response('Too many requests', { status: 429 }), sleep: async () => {} });
    await assert.rejects(geocode('1 Main St', '90012'), /HTTP 429/);
  });
});

describe('toSnapshot', () => {
  test('leaves out contact names and comments, keeping everything else and the row numbers', () => {
    const { headers, rows } = parseCSV(fixtureText);
    const snapshot = toSnapshot(headers, rows, '2026-10-15T20:30:53.000Z');
    assert.equal(snapshot.generatedAt, '2026-10-15T20:30:53.000Z');
    assert.deepEqual(snapshot.headers, headers.filter((h) => !PRIVATE_COLUMNS.includes(h)));
    assert.equal(snapshot.rows.length, 148);
    snapshot.rows.forEach((row, i) => {
      const expected = { ...rows[i] };
      for (const column of PRIVATE_COLUMNS) delete expected[column];
      assert.deepEqual(row, expected);
    });
    assert.equal(snapshot.rows[0].__row, 2);
    // In the fixture, contact names and comments are all "Redacted".
    assert.ok(!JSON.stringify(snapshot).includes('Redacted'));
    assert.ok(PRIVATE_COLUMNS.every((column) => column in rows[0]), 'the parsed rows are left as they were');
  });
});

describe('formatCache', () => {
  test('sorts addresses, one per line', () => {
    const text = formatCache({ 'b st, los angeles, ca': [34.1, -118.2], 'a st, los angeles, ca': null });
    assert.equal(text, '{\n  "a st, los angeles, ca": null,\n  "b st, los angeles, ca": [34.1,-118.2]\n}\n');
    assert.deepEqual(JSON.parse(text), { 'a st, los angeles, ca': null, 'b st, los angeles, ca': [34.1, -118.2] });
    assert.equal(formatCache({}), '{}\n');
  });
});

describe('sync', () => {
  const quiet = () => {};

  test('dry run: reports on the sheet without any requests or file changes', async (t) => {
    const { cachePath, snapshotPath } = await tempData(t);
    const cacheBefore = await readFile(cachePath, 'utf8');
    const network = noNetwork();
    const lines = [];
    const { report, toLookUp, written } = await sync({
      csvPath: FIXTURE, dryRun: true, fetch: network.fetch, log: (line) => lines.push(line), cachePath, snapshotPath,
    });
    assert.deepEqual(network.calls, []);
    assert.equal(toLookUp, 5); // rows 84, 85, 86, 88 and 89 have addresses that were never looked up
    assert.deepEqual(written, []);
    assert.equal(await readFile(cachePath, 'utf8'), cacheBefore);
    assert.equal(await readIfExists(snapshotPath), null);
    assert.equal(report.sheetRows, 148);
    assert.equal(report.onMap + report.missingLocation.length, 143);
    const output = lines.join('\n');
    assert.match(output, /148 rows in the spreadsheet → 5 duplicates merged → 143 organizations → 122 on the map \+ 21 missing a location/);
    assert.match(output, /row 84 {2}Common Threads — Texas, 90277/);
    assert.match(output, /Dry run: no files written\./);
  });

  test('looks up new addresses once, then saves the cache and the snapshot', async (t) => {
    const { cachePath, snapshotPath } = await tempData(t);
    const nominatim = fakeNominatim({
      'Texas, Los Angeles, CA, 90277': { lat: '31.2', lon: '-99.3', address: { state: 'Texas' } },
      '1847 W 43rd Street, Los Angeles, CA': inCalifornia(34.0046, -118.3087),
      '490 43rd St, Unit 332, Oakland, CA 94609': inCalifornia(37.8302, -122.2617),
    });
    const sleeps = [];
    const first = await sync({
      csvPath: FIXTURE,
      fetch: nominatim.fetch,
      sleep: async (ms) => sleeps.push(ms),
      log: quiet,
      cachePath,
      snapshotPath,
      now: new Date('2026-10-16T10:00:00Z'),
    });

    assert.deepEqual(nominatim.calls.map((c) => c.q), [
      'Texas, Los Angeles, CA, 90277',
      'Texas, Los Angeles, CA',
      '32712 El Sastre Rd Acton Ca 93510, Los Angeles, CA, 93510',
      '32712 El Sastre Rd Acton Ca 93510, Los Angeles, CA',
      '1847 W 43rd Street, Los Angeles, CA, 90062',
      '1847 W 43rd Street, Los Angeles, CA',
      '490 43rd St, Unit 332, Oakland, CA 94609',
      '9415 Culver Blvd #368, Los Angeles, CA, 90232',
      '9415 Culver Blvd #368, Los Angeles, CA',
    ]);
    assert.equal(sleeps.length, nominatim.calls.length - 1);
    assert.deepEqual(first.written, [cachePath, snapshotPath]);
    assert.equal(first.report.onMap, 124);
    assert.equal(first.report.missingLocation.length, 19);

    const cacheText = await readFile(cachePath, 'utf8');
    const cache = JSON.parse(cacheText);
    assert.deepEqual(Object.keys(cache), Object.keys(cache).sort());
    assert.equal(cacheText, formatCache(cache));
    for (const [key, value] of Object.entries(geocodeCache)) assert.deepEqual(cache[key], value, key);
    assert.deepEqual(cache['1847 w 43rd street, los angeles, ca, 90062'], [34.0046, -118.3087]);
    assert.deepEqual(cache['490 43rd st, unit 332, oakland, ca 94609, los angeles, ca, 94609'], [37.8302, -122.2617]);
    assert.equal(cache['texas, los angeles, ca, 90277'], null); // not found: not retried
    assert.equal(Object.keys(cache).length, Object.keys(geocodeCache).length + 5);

    const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
    assert.equal(snapshot.generatedAt, '2026-10-16T10:00:00.000Z');
    assert.equal(snapshot.rows.length, 148);
    assert.ok(PRIVATE_COLUMNS.every((column) => !snapshot.headers.includes(column)));
    assert.ok(snapshot.rows.every((row) => PRIVATE_COLUMNS.every((column) => !(column in row)) && row.__row >= 2));

    // Next night, same sheet: nothing to look up and nothing to save.
    const second = await sync({
      csvPath: FIXTURE, fetch: nominatim.fetch, log: quiet, cachePath, snapshotPath, now: new Date('2026-10-17T10:00:00Z'),
    });
    assert.equal(nominatim.calls.length, 9);
    assert.equal(second.toLookUp, 0);
    assert.deepEqual(second.written, []);
    assert.equal(JSON.parse(await readFile(snapshotPath, 'utf8')).generatedAt, '2026-10-16T10:00:00.000Z');
  });

  test('leaves an address out of the cache when Nominatim fails, so it is retried next time', async (t) => {
    const { cachePath, snapshotPath } = await tempData(t);
    const lines = [];
    await sync({
      csvPath: FIXTURE,
      fetch: async () => new Response('Too many requests', { status: 429 }),
      sleep: async () => {},
      log: (line) => lines.push(line),
      cachePath,
      snapshotPath,
    });
    assert.deepEqual(Object.keys(JSON.parse(await readFile(cachePath, 'utf8'))).sort(), Object.keys(geocodeCache).sort());
    assert.match(lines.join('\n'), /Common Threads — Texas, 90277: lookup failed, will retry next time \(Nominatim answered HTTP 429\)/);
  });

  test('downloads the published sheet when no CSV file is given', async (t) => {
    const { cachePath, snapshotPath } = await tempData(t);
    const calls = [];
    const fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url) === SHEET_CSV_URL) return new Response(fixtureText);
      throw new Error('no network in tests');
    };
    const { report } = await sync({ dryRun: true, fetch, log: quiet, cachePath, snapshotPath });
    assert.deepEqual(calls.map((c) => c.url), [SHEET_CSV_URL]);
    assert.ok(calls[0].init.signal instanceof AbortSignal);
    assert.equal(report.sheetRows, 148);
  });

  const unreadable = {
    'Google answers with an error': () => new Response('Server error', { status: 500 }),
    'the download is not the sheet': () => new Response('<!DOCTYPE html><html><body>Sign in</body></html>'),
    'the sheet has no organization rows': () => new Response('Organization Name,Sector\n,\n'),
  };
  for (const [problem, respond] of Object.entries(unreadable)) {
    test(`changes nothing when ${problem}`, async (t) => {
      const { cachePath, snapshotPath } = await tempData(t);
      const cacheBefore = await readFile(cachePath, 'utf8');
      await assert.rejects(sync({ fetch: async () => respond(), log: quiet, cachePath, snapshotPath }), /HTTP 500|no organization rows/);
      assert.equal(await readFile(cachePath, 'utf8'), cacheBefore);
      assert.equal(await readIfExists(snapshotPath), null);
    });
  }

  test('stops rather than starting over when the cache file is damaged', async (t) => {
    const { cachePath, snapshotPath } = await tempData(t);
    await writeFile(cachePath, '{ "1 main st, los angeles, ca": [34.0');
    await assert.rejects(sync({ csvPath: FIXTURE, fetch: noNetwork().fetch, log: quiet, cachePath, snapshotPath }), SyntaxError);
    assert.equal(await readIfExists(snapshotPath), null);
  });
});

describe('npm run sync', () => {
  test('refuses unknown options instead of running', () => {
    const result = spawnSync(process.execPath, [SCRIPT, '--dryrun'], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unknown option: --dryrun/);
    assert.equal(result.stdout, '');
  });
});
