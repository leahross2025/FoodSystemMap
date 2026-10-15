import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanAddress, geocodeCacheKey, normalizeWebsite, parseManualCoords } from '../src/lib/address.js';

test('cleanAddress drops suites, a trailing ", USA" and "X and at" prefixes', () => {
  assert.equal(cleanAddress('1231 N. Spring Street, Suite C-102'), '1231 N. Spring Street');
  assert.equal(cleanAddress('4996 Foothill Rd, Carpinteria, CA 93013, USA'), '4996 Foothill Rd, Carpinteria, CA 93013');
  assert.equal(cleanAddress('Downtown and at 3530 Wilshire Blvd, Los Angeles'), '3530 Wilshire Blvd, Los Angeles');
  assert.equal(cleanAddress(''), null);
  assert.equal(cleanAddress('   '), null);
  assert.equal(cleanAddress(null), null);
});

test('geocodeCacheKey matches the keys already in src/data/geocode-cache.json', () => {
  // Real sheet addresses and the keys they were cached under.
  assert.equal(geocodeCacheKey('7412 Fulton Ave Suite #3, North Hollywood, CA', '91605'), '7412 fulton ave , north hollywood, ca, los angeles, ca, 91605');
  assert.equal(geocodeCacheKey('4996 Foothill Rd, Carpinteria, CA 93013, USA', '93013'), '4996 foothill rd, carpinteria, ca 93013, los angeles, ca, 93013');
  assert.equal(geocodeCacheKey('9595 Wilshire Blvd., Suite 510', '90212'), '9595 wilshire blvd., los angeles, ca, 90212');
  assert.equal(geocodeCacheKey('961 S Mariposa Ave # 205', '90006'), '961 s mariposa ave # 205, los angeles, ca, 90006');
});

test('geocodeCacheKey: zip is optional, address is not', () => {
  assert.equal(geocodeCacheKey('200 N Spring St', ''), '200 n spring st, los angeles, ca');
  assert.equal(geocodeCacheKey('', '90012'), null);
});

test('parseManualCoords accepts good coordinates', () => {
  assert.deepEqual(parseManualCoords('34.0522', '-118.2437'), { coords: [34.0522, -118.2437], issue: null });
  assert.deepEqual(parseManualCoords(' 34.0522° N ', '-118.2437°'), { coords: [34.0522, -118.2437], issue: null });
  assert.deepEqual(parseManualCoords(34.0522, -118.2437), { coords: [34.0522, -118.2437], issue: null });
});

test('parseManualCoords: blank cells are simply no coordinates', () => {
  assert.deepEqual(parseManualCoords('', ''), { coords: null, issue: null });
  assert.deepEqual(parseManualCoords(' ', undefined), { coords: null, issue: null });
});

test('parseManualCoords repairs swapped lat/lng and a missing minus sign, with a note', () => {
  const swapped = parseManualCoords('-118.2437', '34.0522');
  assert.deepEqual(swapped.coords, [34.0522, -118.2437]);
  assert.match(swapped.issue, /swapped/);
  const positive = parseManualCoords('34.0522', '118.2437');
  assert.deepEqual(positive.coords, [34.0522, -118.2437]);
  assert.match(positive.issue, /negative/);
});

test('parseManualCoords rejects incomplete, non-numeric and far-away values', () => {
  for (const [lat, lng] of [['34.05', ''], ['', '-118.24'], ['abc', '-118.24']]) {
    const { coords, issue } = parseManualCoords(lat, lng);
    assert.equal(coords, null);
    assert.match(issue, /missing or not a number/);
  }
  const nyc = parseManualCoords('40.7128', '-74.0060');
  assert.equal(nyc.coords, null);
  assert.match(nyc.issue, /outside California/);
});

test('normalizeWebsite turns domains and URLs into links', () => {
  assert.equal(normalizeWebsite('example.org'), 'https://example.org/');
  assert.equal(normalizeWebsite(' www.example.org/about-us '), 'https://www.example.org/about-us');
  assert.equal(normalizeWebsite('http://example.org'), 'http://example.org/');
  assert.equal(normalizeWebsite('HTTPS://Example.org/Path?x=1'), 'https://example.org/Path?x=1');
});

test('normalizeWebsite keeps social profile links with an @ handle', () => {
  assert.equal(normalizeWebsite('https://www.youtube.com/@FoodForward'), 'https://www.youtube.com/@FoodForward');
  assert.equal(normalizeWebsite('tiktok.com/@foodforward'), 'https://tiktok.com/@foodforward');
});

test('normalizeWebsite rejects emails and anything that is not a web link', () => {
  for (const raw of ['', null, undefined, 'N/A', 'none', 'see Kumu', 'info@example.org', 'first.last@example.org', 'mailto:info@example.org', 'https://info@example.org', 'javascript:alert(1)', 'ftp://example.org']) {
    assert.equal(normalizeWebsite(raw), '', String(raw));
  }
});
