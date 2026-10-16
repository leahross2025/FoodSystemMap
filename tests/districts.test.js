import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import districtsGeojson from '../src/data/districts.json' with { type: 'json' };
import { districtLabel, makeDistrictLookup, NOT_SPECIFIED, OUTSIDE_COUNTY, parseDistrict, parseSPAs } from '../src/lib/districts.js';

test('parseDistrict reads the survey answers', () => {
  assert.equal(parseDistrict('1st District- Hilda Solis'), 1);
  assert.equal(parseDistrict('2nd District- Holly Mitchell'), 2);
  assert.equal(parseDistrict('3rd District- Lindsey Horvath'), 3);
  assert.equal(parseDistrict('4th District- Janice Hahn'), 4);
  assert.equal(parseDistrict('5th District- Kathryn Barger'), 5);
  assert.equal(parseDistrict('District 3'), 3);
  assert.equal(parseDistrict('Countywide'), 'countywide');
  assert.equal(parseDistrict(''), null);
  assert.equal(parseDistrict('not sure'), null);
});

test('districtLabel', () => {
  assert.equal(districtLabel(1), 'District 1 – Hilda Solis');
  assert.equal(districtLabel(5), 'District 5 – Kathryn Barger');
  assert.equal(districtLabel('countywide'), 'Countywide');
  assert.equal(districtLabel(0), OUTSIDE_COUNTY);
  assert.equal(districtLabel(null), NOT_SPECIFIED);
});

test('parseSPAs shortens the survey answers', () => {
  assert.deepEqual(parseSPAs('SPA 4- Metro LA (Boyle Heights, Central City, Downtown LA, Echo Park, El Sereno)'), ['SPA 4 – Metro LA']);
  assert.deepEqual(
    parseSPAs('SPA 1- Antelope Valley (Acton, Agua Dulce, and others), SPA 5- West (Bel Air, Beverly Hills), SPA 1- Antelope Valley (Acton)'),
    ['SPA 1 – Antelope Valley', 'SPA 5 – West'],
  );
  assert.deepEqual(parseSPAs('SPA 3- San Gabriel Valley (Alhambra, Pasadena, and others), Countywide'), ['Countywide']);
  assert.deepEqual(parseSPAs('SPA 6'), ['SPA 6']);
  assert.deepEqual(parseSPAs(''), []);
});

test('district lookup on the real boundaries', () => {
  const lookup = makeDistrictLookup(districtsGeojson);
  const places = [
    ['LA City Hall', 34.0537, -118.2428, 1],
    ['Compton', 33.8958, -118.2201, 2],
    ['Santa Monica', 34.0094, -118.4973, 3],
    ['Long Beach', 33.7683, -118.1956, 4],
    ['Avalon, Catalina Island', 33.3428, -118.3278, 4],
    ['Pasadena', 34.1478, -118.1445, 5],
    ['Lancaster', 34.6868, -118.1542, 5],
    ['Fillmore (Ventura County)', 34.4074, -118.9446, 0],
    ['San Francisco', 37.7749, -122.4194, 0],
  ];
  for (const [place, lat, lng, district] of places) assert.equal(lookup(lat, lng), district, place);
});

test('district lookup handles holes and multi-part districts', () => {
  const square = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  const lookup = makeDistrictLookup({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { DISTRICT: '3' }, geometry: { type: 'Polygon', coordinates: [square(-119, 34, -118, 35), square(-118.6, 34.4, -118.4, 34.6)] } },
      { type: 'Feature', properties: { DISTRICT: '4' }, geometry: { type: 'MultiPolygon', coordinates: [[square(-118.5, 33.3, -118.3, 33.5)], [square(-117.5, 33.3, -117.3, 33.5)]] } },
    ],
  });
  assert.equal(lookup(34.2, -118.8), 3);
  assert.equal(lookup(34.5, -118.5), 0); // in the hole
  assert.equal(lookup(33.4, -118.4), 4);
  assert.equal(lookup(33.4, -117.4), 4);
  assert.equal(lookup(36, -120), 0);
});

test('the browser and the server use the same district boundaries', () => {
  const served = JSON.parse(readFileSync(new URL('../public/districts.geojson', import.meta.url), 'utf8'));
  assert.deepEqual(served, districtsGeojson);
});
