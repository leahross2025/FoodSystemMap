import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { SECTORS } from '../src/lib/sectors.js';

const fixture = readFileSync(new URL('./fixtures/sheet.csv', import.meta.url), 'utf8');

test(
  'GET /api/survey-data: organizations without survey answers or emails, plus the report counts',
  { skip: !process.features.typescript && 'this Node version cannot import TypeScript' },
  async (t) => {
    // Serve the fixture instead of the live sheet.
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(fixture);
    t.after(() => {
      globalThis.fetch = realFetch;
    });

    const { GET } = await import('../src/pages/api/survey-data.ts');
    const res = await GET({});
    assert.equal(res.headers.get('Cache-Control'), 'public, max-age=300');
    assert.equal(res.headers.get('Content-Type'), 'application/json');

    const { organizations, metadata } = await res.json();
    assert.equal(organizations.length, 143);
    for (const org of organizations) {
      assert.deepEqual(Object.keys(org), [
        'id', 'row', 'name', 'sector', 'sectorRaw', 'isSurveyRespondent', 'address', 'zip', 'coordinates', 'coordSource',
        'district', 'districtLabel', 'districtSource', 'otherDistricts', 'primarySPA', 'spas', 'mission', 'activity',
        'website', 'timestamp',
      ]);
    }
    assert.ok(!JSON.stringify(organizations).includes('redacted@example.org'));
    assert.deepEqual(metadata, {
      sheetRows: 148,
      uniqueOrganizations: 143,
      surveyRespondents: 83,
      mapOnly: 60,
      onMap: 122,
      source: 'live',
      fetchedAt: metadata.fetchedAt,
      sectors: SECTORS.map((s) => s.key),
    });
    assert.ok(!Number.isNaN(Date.parse(metadata.fetchedAt)));
  },
);
