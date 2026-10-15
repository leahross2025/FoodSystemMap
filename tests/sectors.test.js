import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isKnownSector, normalizeSector, OTHER_SECTOR, SECTOR_COLORS, SECTORS } from '../src/lib/sectors.js';

test('the legend lists exactly the requested sectors, in order', () => {
  assert.deepEqual(
    SECTORS.map((s) => s.key),
    ['Nonprofit/CBO', 'For-Profit', 'Government Agency', 'K-12 School/School District', 'College/University', 'Labor', 'Farm', 'Foundation', 'Other'],
  );
  assert.equal(OTHER_SECTOR, 'Other');
});

test('every sector has its own color', () => {
  for (const { key, color } of SECTORS) {
    assert.match(color, /^#[0-9a-f]{6}$/i);
    assert.equal(SECTOR_COLORS[key], color);
  }
  assert.equal(new Set(SECTORS.map((s) => s.color.toLowerCase())).size, SECTORS.length);
});

test('canonical names map to themselves, however they are typed', () => {
  for (const { key } of SECTORS) {
    assert.equal(normalizeSector(key), key);
    assert.equal(normalizeSector(` ${key.toUpperCase()} `), key);
    assert.ok(isKnownSector(key));
  }
});

test('common spelling variants map to the canonical sector', () => {
  const variants = {
    nonprofit: 'Nonprofit/CBO',
    'Non-Profit': 'Nonprofit/CBO',
    'Nonprofit Organization': 'Nonprofit/CBO',
    CBO: 'Nonprofit/CBO',
    'Community-Based Organization': 'Nonprofit/CBO',
    'For Profit': 'For-Profit',
    Business: 'For-Profit',
    Government: 'Government Agency',
    'K-12': 'K-12 School/School District',
    'K12 School': 'K-12 School/School District',
    'School District': 'K-12 School/School District',
    college: 'College/University',
    University: 'College/University',
    'Labor Union': 'Labor',
    Farms: 'Farm',
    FOUNDATION: 'Foundation',
  };
  for (const [raw, expected] of Object.entries(variants)) {
    assert.equal(normalizeSector(raw), expected, raw);
    assert.ok(isKnownSector(raw), raw);
  }
});

test('free-text and blank answers show as Other but are not "known"', () => {
  for (const raw of ["we're a governmental nonprofit, part of county but independent", 'Faith-based organization']) {
    assert.equal(normalizeSector(raw), OTHER_SECTOR);
    assert.equal(isKnownSector(raw), false);
  }
  for (const raw of ['', '   ', null, undefined]) {
    assert.equal(normalizeSector(raw), OTHER_SECTOR);
    assert.equal(isKnownSector(raw), false);
  }
});

test('choosing "Other" on purpose is a recognised answer', () => {
  assert.equal(normalizeSector('Other:'), OTHER_SECTOR);
  assert.ok(isKnownSector('other'));
});
