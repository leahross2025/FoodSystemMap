import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { SHEET_CSV_URL } from '../src/config/googleSheets.js';
import snapshot from '../src/data/snapshot.json' with { type: 'json' };
import { resolveColumns } from '../src/lib/columns.js';
import { buildDataset } from '../src/lib/organizations.js';

const fixture = readFileSync(new URL('./fixtures/sheet.csv', import.meta.url), 'utf8');

// Each test gets its own copy of the module, so it starts with an empty 60-second memo.
let instance = 0;
const freshLoadData = async () => (await import(`../src/lib/data.server.js?test=${++instance}`)).loadData;

/** Replace fetch for one test (never reaching the network) and record the calls. */
function stubFetch(t, respond) {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return respond();
  };
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  return calls;
}

describe('loadData', () => {
  test('reads the live sheet, letting Cloudflare cache it for 5 minutes', async (t) => {
    const calls = stubFetch(t, () => new Response(fixture));
    const { organizations, report } = await (await freshLoadData())();
    assert.equal(report.source, 'live');
    assert.equal(report.sheetRows, 148);
    assert.equal(organizations.length, 143);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, SHEET_CSV_URL);
    assert.deepEqual(calls[0].init.cf, { cacheTtl: 300, cacheEverything: true });
    assert.ok(calls[0].init.signal instanceof AbortSignal);
    // Farms didn't answer the district question: their district comes from the district boundaries.
    const beylik = organizations.find((o) => o.name === 'Beylik Family Farms');
    assert.deepEqual([beylik.district, beylik.districtSource], [0, 'location']);
  });

  test('shares one result for 60 seconds', async (t) => {
    const calls = stubFetch(t, () => new Response(fixture));
    const loadData = await freshLoadData();
    const start = Date.now();

    const first = await loadData();
    assert.equal(await loadData(), first); // the same object, not a copy
    assert.equal(calls.length, 1);

    t.mock.method(Date, 'now', () => start + 61_000);
    assert.notEqual(await loadData(), first);
    assert.equal(calls.length, 2);
  });

  test('requests that arrive while the sheet is being read wait for that read', async (t) => {
    let finishDownload;
    const calls = stubFetch(t, () => new Promise((resolve) => (finishDownload = resolve)));
    const loadData = await freshLoadData();

    const waiting = [loadData(), loadData(), loadData()];
    assert.equal(calls.length, 1);
    finishDownload(new Response(fixture));
    const [first, ...others] = await Promise.all(waiting);
    assert.equal(first.report.sheetRows, 148);
    for (const result of others) assert.equal(result, first);
  });

  test('a read is handed to waitUntil, so it finishes even if the visitor who started it leaves', async (t) => {
    stubFetch(t, () => new Response(fixture));
    const loadData = await freshLoadData();
    const handed = [];
    const ctx = { waitUntil: (promise) => handed.push(promise) };

    const reading = loadData(ctx);
    assert.equal(handed.length, 1);
    assert.equal(handed[0], reading);
    await reading;
    await loadData(ctx); // nothing new to wait for
    assert.equal(handed.length, 1);
  });

  const failures = {
    'the network request fails': () => Promise.reject(new TypeError('fetch failed')),
    'Google answers with an error': () => new Response('Server error', { status: 500 }),
    'the response is not the sheet': () => new Response('<!DOCTYPE html><html><body>Sign in</body></html>'),
    'the sheet has no organization rows': () => new Response('Organization Name,Sector\n,\n'),
  };
  for (const [problem, respond] of Object.entries(failures)) {
    test(`falls back to the saved snapshot when ${problem}`, async (t) => {
      stubFetch(t, respond);
      const warn = t.mock.method(console, 'warn', () => {});
      const { organizations, report } = await (await freshLoadData())();
      assert.equal(report.source, 'snapshot');
      assert.equal(report.fetchedAt, snapshot.generatedAt);
      assert.equal(report.sheetRows, snapshot.rows.length);
      assert.equal(organizations.length, report.uniqueOrganizations);
      assert.equal(warn.mock.callCount(), 1);
    });
  }
});

// Checks that stay true after the nightly sync replaces the snapshot with live data.
describe('src/data/snapshot.json', () => {
  test('has the saved sheet: generatedAt, headers and rows', () => {
    assert.ok(!Number.isNaN(Date.parse(snapshot.generatedAt)));
    assert.ok(Array.isArray(snapshot.headers) && snapshot.headers.length > 0);
    assert.ok(Array.isArray(snapshot.rows) && snapshot.rows.length > 0);
  });

  test('never contains contact names or comments', () => {
    const { map } = resolveColumns(snapshot.headers);
    assert.equal(map.contactName, undefined);
    assert.equal(map.comments, undefined);
    for (const row of snapshot.rows) {
      const rowColumns = resolveColumns(Object.keys(row)).map;
      assert.equal(rowColumns.contactName, undefined);
      assert.equal(rowColumns.comments, undefined);
    }
  });

  test('builds a consistent dataset', () => {
    const { organizations, report } = buildDataset(snapshot.headers, snapshot.rows, { source: 'snapshot' });
    const merged = report.duplicates.reduce((n, d) => n + d.rows.length - 1, 0);
    assert.equal(report.sheetRows, snapshot.rows.length);
    assert.equal(report.sheetRows, report.uniqueOrganizations + merged);
    assert.equal(report.uniqueOrganizations, report.onMap + report.missingLocation.length);
    assert.equal(organizations.length, report.uniqueOrganizations);
  });
});
