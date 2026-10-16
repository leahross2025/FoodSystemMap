import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import districtsGeojson from '../src/data/districts.json' with { type: 'json' };
import { geocodeCacheKey } from '../src/lib/address.js';
import { resolveColumns } from '../src/lib/columns.js';
import { DISTRICTS, makeDistrictLookup, NOT_SPECIFIED, OUTSIDE_COUNTY } from '../src/lib/districts.js';
import { buildDataset, dedupeKey, parseCSV } from '../src/lib/organizations.js';
// The geocode cache as it was when the sheet fixture was taken (the real one changes every night).
import geocodeCache from './fixtures/geocode-cache.json' with { type: 'json' };

const ORG_KEYS = [
  'id', 'row', 'name', 'sector', 'sectorRaw', 'isSurveyRespondent', 'address', 'zip', 'coordinates', 'coordSource',
  'district', 'districtLabel', 'districtSource', 'otherDistricts', 'primarySPA', 'spas', 'mission', 'activity',
  'website', 'email', 'timestamp', 'survey',
];
const REPORT_KEYS = [
  'source', 'fetchedAt', 'sheetRows', 'uniqueOrganizations', 'surveyRespondents', 'mapOnly', 'onMap', 'duplicates',
  'missingLocation', 'coordinateIssues', 'unrecognizedSectors', 'blankSector', 'missingColumns',
];
const SURVEY_KEYS = ['groups', 'goals', 'topGoal', 'objectives', 'topObjective', 'activities', 'challenges', 'capacity'];

function assertInvariants({ organizations, report }) {
  const merged = report.duplicates.reduce((n, d) => n + d.rows.length - 1, 0);
  assert.equal(report.sheetRows, report.uniqueOrganizations + merged);
  assert.equal(report.uniqueOrganizations, report.onMap + report.missingLocation.length);
  assert.equal(report.uniqueOrganizations, organizations.length);
  assert.equal(report.onMap, organizations.filter((o) => o.coordinates).length);
  assert.equal(report.surveyRespondents, organizations.filter((o) => o.isSurveyRespondent).length);
  assert.equal(report.mapOnly, report.uniqueOrganizations - report.surveyRespondents);
  assert.equal(new Set(organizations.map((o) => o.id)).size, organizations.length);
}

// Small hand-made sheets: records use the field names from columns.js.
const HEADERS = {
  timestamp: 'Timestamp',
  name: 'Organization Name',
  sector: 'Sector',
  address: 'Address',
  zip: 'Zip Code',
  district: 'Primary Supervisorial District',
  otherDistricts: 'Other Supervisorial District(s) Served',
  primarySPA: 'Primary SPA',
  additionalSPAs: 'Additional SPA(s) Served',
  lat: 'lat',
  lng: 'lng',
  website: 'Website',
  mission: 'Mission',
  email: 'Email Address',
  activity: 'Activity (Kumu Service Category)',
  descriptor: 'Provide one sentence descriptor of your primary activity',
};

function toCSV(records) {
  const fields = Object.keys(HEADERS);
  const quote = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [fields.map((f) => HEADERS[f]), ...records.map((r) => fields.map((f) => r[f]))]
    .map((cells) => cells.map(quote).join(','))
    .join('\n');
}

/** Records → dataset; record i is spreadsheet row i + 2. */
function build(records, options) {
  const { headers, rows } = parseCSV(toCSV(records));
  return buildDataset(headers, rows, options);
}

describe('real sheet (tests/fixtures/sheet.csv)', () => {
  const { headers, rows } = parseCSV(readFileSync(new URL('./fixtures/sheet.csv', import.meta.url), 'utf8'));
  const cols = resolveColumns(headers);
  const dataset = buildDataset(headers, rows, { geocodeCache, districtLookup: makeDistrictLookup(districtsGeojson) });
  const { organizations, report } = dataset;
  const atRow = (row) => organizations.find((o) => o.row === row);

  test('has 148 rows, 88 of them survey responses', () => {
    assert.equal(rows.length, 148);
    assert.equal(rows[0].__row, 2);
    assert.equal(rows.at(-1).__row, 149);
    assert.equal(rows.filter((r) => cols.get(r, 'timestamp')).length, 88);
  });

  test('merges 5 duplicate groups into 143 organizations, keeping the latest response', () => {
    assert.deepEqual(report.duplicates, [
      { name: 'Eastmont Community Center', rows: [22, 87], keptRow: 87 },
      { name: 'Food Forward', rows: [30, 31], keptRow: 31 },
      { name: 'FoodCycle', rows: [32, 33], keptRow: 33 },
      { name: 'Hollywood Food Coalition', rows: [38, 39], keptRow: 39 },
      { name: 'Project Angel Food', rows: [56, 57], keptRow: 57 },
    ]);
    assert.equal(report.sheetRows, 148);
    assert.equal(report.uniqueOrganizations, 143);
    assert.equal(report.surveyRespondents, 83);
    assert.equal(report.mapOnly, 60);
  });

  test('report invariants hold', () => {
    assertInvariants(dataset);
    assert.deepEqual(Object.keys(report), REPORT_KEYS);
    assert.equal(report.source, 'live');
  });

  test('invariants also hold with no geocode cache or district lookup', () => {
    const bare = buildDataset(headers, rows);
    assertInvariants(bare);
    assert.equal(bare.report.onMap, 7); // only the farms with lat/lng typed in
    assert.ok(bare.organizations.every((o) => o.districtSource !== 'location'));
  });

  test('the 7 farms with lat/lng typed in are placed from the sheet', () => {
    assert.deepEqual(
      organizations.filter((o) => o.coordSource === 'sheet').map((o) => o.name),
      ['Achadinha Cheese Co', 'Beylik Family Farms', 'Casitas Valley Pastures', 'CHINCHIOLO FARMS', 'Cuyama Orchards', 'El Abuelo Organic Herbs Corp', 'Forbidden Fruit Orchards'],
    );
    const beylik = organizations.find((o) => o.name === 'Beylik Family Farms');
    assert.deepEqual(beylik.coordinates, [34.407402507694286, -118.94461150634022]);
    assert.equal(beylik.sector, 'Farm');
    assert.equal(beylik.isSurveyRespondent, false);
    assert.equal(beylik.survey, null);
    // Farms didn't answer the district question, so it comes from the location (Ventura County).
    assert.equal(beylik.district, 0);
    assert.equal(beylik.districtLabel, OUTSIDE_COUNTY);
    assert.equal(beylik.districtSource, 'location');
  });

  test('a free-text sector shows as Other and is listed for fixing', () => {
    const value = "we're a governmental nonprofit, part of county but independent";
    assert.equal(atRow(28).sector, 'Other');
    assert.equal(atRow(28).sectorRaw, value);
    assert.deepEqual(report.unrecognizedSectors, [{ row: 28, name: 'First 5 Los Angeles', value }]);
    assert.deepEqual(report.blankSector, []);
  });

  test('no coordinate problems; the Website column has not been added yet', () => {
    assert.deepEqual(report.coordinateIssues, []);
    assert.deepEqual(report.missingColumns, ['website']);
  });

  test('organizations never carry contact names or comments', () => {
    for (const org of organizations) assert.deepEqual(Object.keys(org), ORG_KEYS);
    // In the fixture, contact names and comments are all "Redacted".
    assert.ok(!JSON.stringify(organizations).includes('Redacted'));
  });

  test('the kept response keeps its own answers (FoodCycle moved to Carson)', () => {
    const org = atRow(33);
    assert.equal(org.name, 'FoodCycle');
    assert.equal(org.address, '129 E 223rd Street Carson CA');
    assert.equal(org.zip, '90745');
    assert.equal(org.district, 5);
    assert.equal(org.districtSource, 'survey');
  });

  test("Eastmont's latest response gets its location from the older row", () => {
    // Row 87's address was never geocoded; row 22's was.
    const row22 = rows.find((r) => r.__row === 22);
    const cache = { [geocodeCacheKey(cols.get(row22, 'address'), cols.get(row22, 'zip'))]: [34.0211, -118.1499] };
    const org = buildDataset(headers, rows, { geocodeCache: cache }).organizations.find((o) => o.row === 87);
    assert.equal(org.address, '701 Hoefner Ave Los Angeles CA');
    assert.deepEqual(org.coordinates, [34.0211, -118.1499]);
    assert.equal(org.coordSource, 'geocoded');
  });

  test('districts and SPAs served become labels', () => {
    assert.deepEqual(atRow(12).otherDistricts, [...Object.values(DISTRICTS), 'Countywide']);
    assert.equal(atRow(87).district, 1);
    assert.equal(atRow(87).districtLabel, 'District 1 – Hilda Solis');
    assert.equal(atRow(87).primarySPA, 'SPA 7 – East');
    assert.deepEqual(atRow(87).spas, ['SPA 7 – East', 'SPA 4 – Metro LA']);
  });

  test('survey answers are kept for respondents only; activity falls back to the descriptor', () => {
    for (const org of organizations) {
      if (org.isSurveyRespondent) {
        assert.deepEqual(Object.keys(org.survey), SURVEY_KEYS);
        assert.ok(Object.values(org.survey).every((v) => typeof v === 'string'));
        assert.notEqual(org.timestamp, '');
      } else {
        assert.equal(org.survey, null);
        assert.equal(org.timestamp, '');
      }
    }
    assert.equal(atRow(87).survey.topGoal, cols.get(rows.find((r) => r.__row === 87), 'topGoal'));
    assert.match(atRow(87).activity, /^We tackle/);
    assert.ok(organizations.every((o) => o.website === ''));
  });
});

describe('parseCSV', () => {
  test('row numbers match the spreadsheet, even around blank rows', () => {
    const text = [
      'Organization Name,Sector,Organization Mission Statement',
      'Alpha,Farm,"first line\nsecond line"', // row 2 (one row despite the line break)
      ',,', // row 3: empty
      ',Farm,started but no name yet', // row 4: no name
      'Beta,Farm,', // row 5
      '',
    ].join('\r\n');
    const { headers, rows } = parseCSV(text);
    assert.deepEqual(headers, ['Organization Name', 'Sector', 'Organization Mission Statement']);
    assert.deepEqual(rows.map((r) => r.__row), [2, 5]);
    assert.equal(rows[0]['Organization Mission Statement'], 'first line\nsecond line');

    const { organizations, report } = buildDataset(headers, rows);
    assert.deepEqual(organizations.map((o) => [o.id, o.name]), [['row-2', 'Alpha'], ['row-5', 'Beta']]);
    assert.equal(report.sheetRows, 2);
  });

  test('handles empty input and a sheet without a name column', () => {
    assert.deepEqual(parseCSV('').rows, []);
    assert.deepEqual(parseCSV('Sector,lat\nFarm,34').rows, []);
  });

  test('without stored row numbers, rows count from 2 in order', () => {
    const { organizations } = buildDataset(['Organization Name'], [{ 'Organization Name': 'A' }, { 'Organization Name': 'B' }]);
    assert.deepEqual(organizations.map((o) => o.id), ['row-2', 'row-3']);
  });
});

describe('dedupeKey', () => {
  test('ignores case, spacing, punctuation and accents', () => {
    assert.equal(dedupeKey('Hollywood Food Coalition '), 'hollywoodfoodcoalition');
    assert.equal(dedupeKey('Food-Forward, Inc.'), 'foodforwardinc');
    assert.equal(dedupeKey('Café Olé'), dedupeKey('cafe ole'));
    assert.equal(dedupeKey(''), '');
    assert.equal(dedupeKey(null), '');
  });
});

describe('duplicates', () => {
  test('keeps the most recent survey response, comparing dates rather than text', () => {
    const { organizations, report } = build([
      { timestamp: '12/1/2025 9:00:00', name: 'Food Forward', mission: 'December answer' },
      { timestamp: '2/1/2025 9:00:00', name: 'food forward', mission: 'February answer' },
    ]);
    assert.equal(organizations.length, 1);
    assert.equal(organizations[0].mission, 'December answer');
    assert.deepEqual(report.duplicates, [{ name: 'Food Forward', rows: [2, 3], keptRow: 2 }]);
  });

  test('understands 12-hour times', () => {
    const { report } = build([
      { timestamp: '3/5/2025 1:00:00 PM', name: 'A' },
      { timestamp: '3/5/2025 11:00:00 AM', name: 'A' },
    ]);
    assert.equal(report.duplicates[0].keptRow, 2);
  });

  test('prefers a survey response over map-only rows, else keeps the first row', () => {
    const { report } = build([
      { name: 'Farm A', sector: 'Farm' },
      { timestamp: '5/1/2025 10:00:00', name: 'Farm A', sector: 'Farm' },
      { name: 'Farm B', sector: 'Farm' },
      { name: 'Farm B', sector: 'Farm' },
    ]);
    assert.deepEqual(report.duplicates.map((d) => d.keptRow), [3, 4]);
  });

  test('fills blanks on the kept row from the other rows', () => {
    const cache = { [geocodeCacheKey('1 Old St', '90001')]: [33.97, -118.25] };
    const { organizations, report } = build(
      [
        { name: 'Hollywood Food Coalition', sector: 'Nonprofit/CBO', address: '1 Old St', zip: '90001', website: 'hfc.org', mission: 'Old mission', email: 'old@hfc.org', descriptor: 'Hot meals' },
        { timestamp: '5/29/2025 14:22:24', name: 'Hollywood Food Coalition ', sector: 'nonprofit', mission: 'New mission' },
      ],
      { geocodeCache: cache, districtLookup: () => 2 },
    );
    const [org] = organizations;
    assert.equal(org.row, 3);
    assert.equal(org.mission, 'New mission'); // the kept row's own answer wins
    assert.equal(org.website, 'https://hfc.org/');
    assert.equal(org.email, 'old@hfc.org');
    assert.equal(org.activity, 'Hot meals');
    assert.equal(org.address, '1 Old St');
    assert.equal(org.zip, '90001');
    assert.deepEqual(org.coordinates, [33.97, -118.25]);
    assert.equal(org.coordSource, 'geocoded');
    // The district is looked up after merging, so the borrowed location counts.
    assert.equal(org.district, 2);
    assert.equal(org.districtSource, 'location');
    assert.deepEqual(report.missingLocation, []);
  });

  test('prefers typed-in coordinates over geocoded ones when filling', () => {
    const cache = { [geocodeCacheKey('1 Main St', '90012')]: [34.05, -118.24] };
    const { organizations } = build(
      [
        { name: 'Farm X', address: '1 Main St', zip: '90012' },
        { name: 'Farm X', lat: '34.4', lng: '-118.9' },
        { timestamp: '1/1/2026 0:00:00', name: 'Farm X' },
      ],
      { geocodeCache: cache },
    );
    assert.equal(organizations[0].row, 4);
    assert.deepEqual(organizations[0].coordinates, [34.4, -118.9]);
    assert.equal(organizations[0].coordSource, 'sheet');
  });

  test('takes a known sector from another row when the kept row is Other', () => {
    const { organizations, report } = build([
      { name: 'First 5 LA', sector: 'Government Agency' },
      { timestamp: '8/1/2025 9:00:00', name: 'First 5 LA', sector: "we're a governmental nonprofit" },
    ]);
    assert.equal(organizations[0].row, 3);
    assert.equal(organizations[0].sector, 'Government Agency');
    assert.equal(organizations[0].sectorRaw, 'Government Agency');
    // The cell itself is still listed so it can be fixed in the sheet.
    assert.deepEqual(report.unrecognizedSectors, [{ row: 3, name: 'First 5 LA', value: "we're a governmental nonprofit" }]);
  });

  test('names without letters or digits are never merged', () => {
    const { organizations, report } = build([{ name: '???' }, { name: '???' }]);
    assert.equal(organizations.length, 2);
    assert.deepEqual(report.duplicates, []);
  });
});

describe('organization fields', () => {
  test('coordinates: sheet lat/lng first, then the geocode cache', () => {
    const cache = {
      [geocodeCacheKey('200 N Spring St', '90012')]: [34.0537, -118.2428],
      [geocodeCacheKey('1 Nowhere Rd', '90000')]: null, // geocoding failed
      [geocodeCacheKey('2 Broken Rd', '90000')]: [34.05], // not a lat/lng pair
    };
    const { organizations, report } = build(
      [
        { name: 'Typed', address: '200 N Spring St', zip: '90012', lat: '34.1', lng: '-118.3' },
        { name: 'Cached', address: '200 N Spring St, Suite 5', zip: '90012', sector: 'Farm' },
        { name: 'Failed', address: '1 Nowhere Rd', zip: '90000', sector: 'Farm' },
        { name: 'Malformed', address: '2 Broken Rd', zip: '90000' },
        { name: 'No address' },
      ],
      { geocodeCache: cache },
    );
    assert.deepEqual(organizations.map((o) => [o.coordinates, o.coordSource]), [
      [[34.1, -118.3], 'sheet'],
      [[34.0537, -118.2428], 'geocoded'],
      [null, null],
      [null, null],
      [null, null],
    ]);
    assert.notEqual(organizations[1].coordinates, cache[geocodeCacheKey('200 N Spring St', '90012')]); // a copy
    assert.equal(report.onMap, 2);
    assert.deepEqual(report.missingLocation, [
      { row: 4, name: 'Failed', address: '1 Nowhere Rd', zip: '90000', sector: 'Farm' },
      { row: 5, name: 'Malformed', address: '2 Broken Rd', zip: '90000', sector: 'Other' },
      { row: 6, name: 'No address', address: '', zip: '', sector: 'Other' },
    ]);
  });

  test('district: the survey answer, else the map location', () => {
    const { organizations } = build(
      [
        { timestamp: '1/1/2025 9:00:00', name: 'Answered', district: '2nd District- Holly Mitchell', lat: '34.05', lng: '-118.24' },
        { name: 'Located', lat: '34.05', lng: '-118.24' },
        { name: 'Outside', lat: '38.21', lng: '-122.67' },
        { name: 'Countywide', district: 'Countywide' },
        { name: 'Unknown' },
      ],
      { districtLookup: (lat) => (lat < 35 ? 1 : 0) },
    );
    assert.deepEqual(organizations.map((o) => [o.district, o.districtLabel, o.districtSource]), [
      [2, 'District 2 – Holly Mitchell', 'survey'],
      [1, 'District 1 – Hilda Solis', 'location'],
      [0, OUTSIDE_COUNTY, 'location'],
      ['countywide', 'Countywide', 'survey'],
      [null, NOT_SPECIFIED, null],
    ]);
  });

  test('other districts and SPAs are de-duplicated labels', () => {
    const { organizations } = build([
      {
        name: 'A',
        otherDistricts: '1st District- Hilda Solis, District 1, Countywide, somewhere else',
        primarySPA: 'SPA 4- Metro LA (Boyle Heights, Central City, Downtown LA)',
        additionalSPAs: 'SPA 4- Metro LA (Boyle Heights, Central City, Downtown LA), SPA 6- South (Athens, Compton)',
      },
      { name: 'B' },
    ]);
    assert.deepEqual(organizations[0].otherDistricts, ['District 1 – Hilda Solis', 'Countywide']);
    assert.equal(organizations[0].primarySPA, 'SPA 4 – Metro LA');
    assert.deepEqual(organizations[0].spas, ['SPA 4 – Metro LA', 'SPA 6 – South']);
    assert.deepEqual([organizations[1].otherDistricts, organizations[1].primarySPA, organizations[1].spas], [[], null, []]);
  });

  test('activity comes from the Activity column, else the one-sentence descriptor', () => {
    const { organizations } = build([
      { name: 'Kumu org', activity: 'Food Recovery', descriptor: 'We rescue food' },
      { name: 'Survey org', descriptor: 'We rescue food' },
    ]);
    assert.deepEqual(organizations.map((o) => o.activity), ['Food Recovery', 'We rescue food']);
  });

  test('websites become clickable links, or blank', () => {
    const { organizations } = build([
      { name: 'A', website: 'www.example.org' },
      { name: 'B', website: 'info@example.org' },
    ]);
    assert.deepEqual(organizations.map((o) => o.website), ['https://www.example.org/', '']);
  });
});

describe('report', () => {
  test('lists cell problems with their spreadsheet row', () => {
    const { organizations, report } = build([
      { name: 'Swapped', sector: 'Farm', lat: '-118.24', lng: '34.05' },
      { name: 'Positive', sector: 'Farm', lat: '34.05', lng: '118.24' },
      { name: 'Far away', sector: 'Farm', lat: '40.71', lng: '-74.00' },
      { name: 'Half', sector: 'Farm', lat: '34.05' },
      { name: 'Free text', sector: 'Faith-based organization' },
      { name: 'Blank' },
      { name: 'Chose Other', sector: 'Other' },
    ]);
    assert.deepEqual(report.coordinateIssues.map((c) => [c.row, c.name]), [[2, 'Swapped'], [3, 'Positive'], [4, 'Far away'], [5, 'Half']]);
    assert.match(report.coordinateIssues[0].issue, /swapped/);
    assert.deepEqual(organizations[0].coordinates, [34.05, -118.24]); // still shown, using the swapped values
    assert.deepEqual(organizations[1].coordinates, [34.05, -118.24]);
    assert.deepEqual(report.unrecognizedSectors, [{ row: 6, name: 'Free text', value: 'Faith-based organization' }]);
    assert.deepEqual(report.blankSector, [{ row: 7, name: 'Blank' }]);
    assert.deepEqual(organizations.slice(4).map((o) => o.sector), ['Other', 'Other', 'Other']);
    assert.deepEqual(report.missingLocation.map((m) => m.row), [4, 5, 6, 7, 8]);
    assertInvariants({ organizations, report });
  });

  test('missingColumns names expected columns the sheet lacks', () => {
    assert.deepEqual(buildDataset(['Organization Name', 'Sector', 'Latitude', 'Longitude'], []).report.missingColumns, ['address', 'website']);
    assert.deepEqual(build([]).report.missingColumns, []);
  });

  test('records the data source and time', () => {
    const { report } = buildDataset([], [], { source: 'snapshot', fetchedAt: '2026-10-15T20:30:53.000Z' });
    assert.equal(report.source, 'snapshot');
    assert.equal(report.fetchedAt, '2026-10-15T20:30:53.000Z');
    assert.ok(!Number.isNaN(Date.parse(buildDataset([], []).report.fetchedAt)));
  });
});
