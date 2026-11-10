import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FIELD_ALIASES, resolveColumns } from '../src/lib/columns.js';
import { parseCSV } from '../src/lib/organizations.js';

const { headers } = parseCSV(readFileSync(new URL('./fixtures/sheet.csv', import.meta.url), 'utf8'));

test('finds every column of the real sheet, each column used once', () => {
  const { map } = resolveColumns(headers);
  const absent = ['activity', 'website']; // not added to the sheet yet
  assert.deepEqual(Object.keys(map).sort(), Object.keys(FIELD_ALIASES).filter((f) => !absent.includes(f)).sort());
  assert.equal(map.name, 'Organization Name');
  assert.equal(map.district, 'Primary Supervisorial District  (based on headquarters address) ');
  assert.equal(map.descriptor, 'Provide one sentence descriptor of your primary activity');
  assert.equal(map.lat, 'lat');
  assert.equal(map.lng, 'lng');
  assert.equal(new Set(Object.values(map)).size, Object.values(map).length);
});

test('recognises new Kumu columns added next to the survey columns', () => {
  const { map } = resolveColumns([...headers, 'Contact (website address from Kumu)', 'Activity (Kumu Service Category)']);
  assert.equal(map.website, 'Contact (website address from Kumu)');
  assert.equal(map.activity, 'Activity (Kumu Service Category)');
  assert.equal(map.contactName, 'Your Name (First/Last)');
  assert.equal(map.email, 'Email Address');
});

test('accepts header variants', () => {
  const variants = [
    ['Website', 'website'],
    ['website ', 'website'],
    ['Web Site', 'website'],
    ['Website Address', 'website'],
    ['URL', 'website'],
    ['Contact (website address from Kumu)', 'website'],
    ['Activity', 'activity'],
    ['Activity (Kumu Service Category)', 'activity'],
    ['Kumu Service Category', 'activity'],
    ['Latitude', 'lat'],
    ['LAT', 'lat'],
    ['Longitude', 'lng'],
    ['Long', 'lng'],
    ['Lon', 'lng'],
    ['Org Name', 'name'],
    ['Organization', 'name'],
    ['Address', 'address'],
    ['Street Address', 'address'],
    ['Zip Code', 'zip'],
    ['ZIP', 'zip'],
    ['  TIMESTAMP ', 'timestamp'],
    ['Organization   Name', 'name'],
  ];
  for (const [header, field] of variants) assert.equal(resolveColumns([header]).map[field], header, header);
});

test('an exact header wins over one that only starts the same way', () => {
  const { map } = resolveColumns(['Organization Mission Statement', 'Organization']);
  assert.equal(map.name, 'Organization');
  assert.equal(map.mission, 'Organization Mission Statement');
});

test('"Contact …" columns go to the right field', () => {
  const { map } = resolveColumns(['Contact Name', 'Contact Email', 'Contact (website address from Kumu)']);
  assert.equal(map.contactName, 'Contact Name');
  assert.equal(map.email, 'Contact Email');
  assert.equal(map.website, 'Contact (website address from Kumu)');
});

test('short aliases only match whole words', () => {
  assert.equal(resolveColumns(['Latino-serving organization?']).map.lat, undefined);
  assert.equal(resolveColumns(['Latino-serving organization?', 'Latitude']).map.lat, 'Latitude');
});

test('get() trims values and returns "" for missing cells or columns', () => {
  const cols = resolveColumns(['Organization Name', 'lat']);
  assert.equal(cols.get({ 'Organization Name': '  Food Forward  ' }, 'name'), 'Food Forward');
  assert.equal(cols.get({ 'Organization Name': 'Food Forward' }, 'lat'), '');
  assert.equal(cols.get({ 'Organization Name': 'Food Forward' }, 'website'), '');
});
