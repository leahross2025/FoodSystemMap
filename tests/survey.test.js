import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import districtsGeojson from '../src/data/districts.json' with { type: 'json' };
import geocodeCache from '../src/data/geocode-cache.json' with { type: 'json' };
import { resolveColumns } from '../src/lib/columns.js';
import { DISTRICTS, makeDistrictLookup, NOT_SPECIFIED } from '../src/lib/districts.js';
import { buildDataset, parseCSV } from '../src/lib/organizations.js';
import { SECTORS } from '../src/lib/sectors.js';
import { QUESTIONS, splitMultiSelect, summarize, WRITE_IN } from '../src/lib/survey.js';

const optionsOf = (field) => QUESTIONS.find((q) => q.field === field).options;
const sectionOf = (summary, id) => summary.sections.find((s) => s.id === id);
const countsOf = (summary, id) => Object.fromEntries(sectionOf(summary, id).bars.map((b) => [b.label, b.count]));

describe('splitMultiSelect', () => {
  const activities = optionsOf('activities');

  test('keeps options that contain commas whole', () => {
    assert.deepEqual(
      splitMultiSelect('Food Production (farmer, fisher, etc.), Charitable Food Distribution (i.e., food bank, etc.), Labor', activities),
      ['Food Production (farmer, fisher, etc.)', 'Charitable Food Distribution (i.e., food bank, etc.)', 'Labor'],
    );
    const objectives = optionsOf('objectives');
    assert.deepEqual(splitMultiSelect(`${objectives[3]}, ${objectives[5]}`, objectives), [objectives[3], objectives[5]]);
  });

  test('matches whole answers only, longest option first', () => {
    assert.deepEqual(splitMultiSelect('Strengthening Food Systems, Food Systems', activities), ['Strengthening Food Systems', 'Food Systems']);
    assert.deepEqual(splitMultiSelect('Strengthening Food Systems', activities), ['Strengthening Food Systems']);
    assert.deepEqual(splitMultiSelect('Funder, Labor organizing', activities), ['Funder', WRITE_IN]);
    // An option made of another option plus more after a comma beats the shorter one.
    assert.deepEqual(
      splitMultiSelect('Food Hub, Food Bank, Pantry', ['Food Bank', 'Food Bank, Pantry', 'Food Hub']),
      ['Food Bank, Pantry', 'Food Hub'],
    );
  });

  test('counts typed "Other" text once, even when it has commas', () => {
    assert.deepEqual(
      splitMultiSelect('Food Systems, Farmer support/services, ecological farming, farm to market, policy', activities),
      ['Food Systems', WRITE_IN],
    );
    assert.deepEqual(splitMultiSelect('Communications', activities), [WRITE_IN]);
  });

  test('ignores blanks and typed non-answers', () => {
    const groups = optionsOf('groups');
    for (const cell of ['', ' ', 'none', 'N/A', 'n/a.', 'None of the above', 'Not sure', 'Unknown', '-', null]) {
      assert.deepEqual(splitMultiSelect(cell, groups), [], String(cell));
    }
    assert.deepEqual(splitMultiSelect('LAFPC Working Group, none', groups), ['LAFPC Working Group']);
  });

  test('tolerates spacing and capitalization changes; lists each option once, in form order', () => {
    assert.deepEqual(splitMultiSelect('labor,Funder ,  FUNDER', activities), ['Funder', 'Labor']);
  });
});

describe('summarize (tests/fixtures/sheet.csv)', () => {
  const { headers, rows } = parseCSV(readFileSync(new URL('./fixtures/sheet.csv', import.meta.url), 'utf8'));
  const { organizations } = buildDataset(headers, rows, { geocodeCache, districtLookup: makeDistrictLookup(districtsGeojson) });
  const respondents = organizations.filter((o) => o.isSurveyRespondent);
  const summary = summarize(respondents);
  const section = (id) => sectionOf(summary, id);
  const counts = (id) => countsOf(summary, id);

  test('counts each of the 83 responding organizations once', () => {
    assert.equal(summary.respondents, 83);
    assert.equal(summary.sectorsRepresented, 6);
    assert.equal(summary.hqDistricts, 5);
    for (const s of summary.sections) assert.equal(s.n, 83, s.id);
    // Farms and other map-only organizations are ignored.
    assert.deepEqual(summarize(organizations), summary);
  });

  test('has a chart for every dashboard section, in page order', () => {
    assert.deepEqual(summary.sections.map((s) => s.id), [
      'sector', 'topGoal', 'goals', 'topObjective', 'objectives', 'activities', 'challenges', 'capacity', 'groups', 'hqDistrict', 'districtsServed',
    ]);
  });

  test('respondents by sector: every sector in legend order and color', () => {
    const { bars } = section('sector');
    assert.deepEqual(bars.map((b) => b.label), SECTORS.map((s) => s.key));
    assert.deepEqual(bars.map((b) => b.color), SECTORS.map((s) => s.color));
    assert.deepEqual(bars.map((b) => b.count), [59, 5, 10, 0, 5, 0, 0, 3, 1]);
    assert.deepEqual(bars.map((b) => b.percent), [71, 6, 12, 0, 6, 0, 0, 4, 1]);
  });

  test('goals', () => {
    assert.deepEqual(section('topGoal').bars.map((b) => [b.label, b.count, b.percent]), [
      ['Increase equitable access to healthy foods', 66, 80],
      ['Support sustainability and resilience in food systems and supply chains', 11, 13],
      ['Build market demand and consumption of healthy foods', 4, 5],
      ['Improve affordability of healthy foods', 2, 2],
    ]);
    assert.equal(section('topGoal').note, undefined);
    assert.deepEqual(section('goals').bars.map((b) => b.count), [78, 50, 46, 31]);
    assert.equal(section('goals').note, 'all that apply');
  });

  test('objectives get short labels, keeping the form wording for hover', () => {
    const top = section('topObjective');
    assert.deepEqual(top.bars.map((b) => [b.label, b.count]), [
      ['Objective 1: Modernize the Food System', 28],
      ['Objective 6: Champion a Whole Person, Whole Community Approach', 25],
      ['Objective 2: Build a Smart & Connected Food System', 14],
      ['Objective 5: Bolster Nutrition Education & Support Healthy Eating', 14],
      ['Objective 4: Elevate Food as Medicine', 9],
      ['Objective 3: Adopt a Dignity of Service Approach', 7],
    ]);
    // "Most aligned" was meant to be one answer, but some respondents picked several.
    assert.equal(top.note, '11 chose more than one');
    assert.match(top.bars[0].fullText, /^Objective 1: Modernize the Food System \(e\.g\. increasing equitable access, /);
    assert.deepEqual(section('objectives').bars.map((b) => b.count), [50, 49, 45, 44, 34, 30]);
    // Labels that weren't shortened carry no separate full text.
    assert.ok(section('goals').bars.every((b) => !('fullText' in b)));
  });

  test('activities: options containing commas are counted whole', () => {
    assert.equal(counts('activities')['Charitable Food Distribution (i.e., food bank, etc.)'], 34);
    assert.equal(counts('activities')['Strengthening Food Systems'], 34);
    assert.equal(counts('activities')['Food Systems'], 32);
    assert.ok(section('activities').bars.every((b) => !/^(food bank|etc\.)/i.test(b.label)));
  });

  test('other questions', () => {
    assert.deepEqual(counts('challenges'), {
      'Competition for funding/resources': 48,
      'Difficulty coordinating efforts across organizations': 32,
      'Lack of time or capacity to collaborate': 31,
      'Finding the right partners': 29,
      'Limited knowledge of who is doing similar work': 19,
      [WRITE_IN]: 16,
    });
    assert.deepEqual(section('capacity').bars.map((b) => b.count), [58, 44, 43, 35, 10]);
    assert.equal(counts('groups')['LA County Food Equity Roundtable'], 49);
  });

  test('typed answers become one "Other (write-in)" bar, shown last', () => {
    for (const [id, count] of [['activities', 6], ['challenges', 16], ['capacity', 10], ['groups', 24]]) {
      const { bars } = section(id);
      assert.deepEqual(bars.at(-1), { label: WRITE_IN, count, percent: Math.round((count / 83) * 100), writeIn: true }, id);
      assert.equal(bars.filter((b) => b.writeIn).length, 1, id);
    }
    for (const id of ['topGoal', 'goals', 'topObjective', 'objectives']) {
      assert.ok(!section(id).bars.some((b) => b.writeIn), id);
    }
  });

  test('bars are sorted by count', () => {
    for (const s of summary.sections.filter((s) => s.id !== 'sector')) {
      const values = s.bars.filter((b) => !b.writeIn).map((b) => b.count);
      assert.deepEqual(values, [...values].sort((a, b) => b - a), s.id);
    }
  });

  test('every answer chosen by 3 or more respondents has its own bar', () => {
    for (const { field, options } of QUESTIONS) {
      const typed = new Map();
      for (const org of respondents) {
        let rest = org.survey[field];
        for (const option of [...options].sort((a, b) => b.length - a.length)) rest = rest.split(option).join('');
        for (const piece of new Set(rest.split(', ').map((p) => p.trim().toLowerCase()).filter(Boolean))) {
          typed.set(piece, (typed.get(piece) ?? 0) + 1);
        }
      }
      for (const [piece, n] of typed) assert.ok(n < 3, `${field}: "${piece}" typed ${n} times`);
    }
  });

  test('districts', () => {
    assert.deepEqual(section('hqDistrict').bars.map((b) => [b.label, b.count]), [
      [DISTRICTS[1], 31],
      [DISTRICTS[2], 19],
      [DISTRICTS[3], 17],
      [DISTRICTS[5], 9],
      [DISTRICTS[4], 7],
    ]);
    assert.deepEqual(section('districtsServed').bars.map((b) => [b.label, b.count]), [
      ['Countywide', 43],
      [DISTRICTS[1], 29],
      [DISTRICTS[2], 28],
      [DISTRICTS[4], 24],
      [DISTRICTS[3], 21],
      [DISTRICTS[5], 18],
    ]);
  });

  test('counting every survey row, before duplicates are merged, gives the raw sheet totals', () => {
    // Each survey row on its own: 88 responses from 83 organizations.
    const cols = resolveColumns(headers);
    const responses = rows.filter((r) => cols.get(r, 'timestamp')).map((r) => buildDataset(headers, [r]).organizations[0]);
    const raw = summarize(responses);
    assert.equal(raw.respondents, 88);
    assert.equal(countsOf(raw, 'topGoal')['Increase equitable access to healthy foods'], 70);
    assert.deepEqual(sectionOf(raw, 'goals').bars.map((b) => b.count), [83, 54, 47, 31]);
    assert.equal(countsOf(raw, 'activities')['Charitable Food Distribution (i.e., food bank, etc.)'], 39);
  });
});

describe('summarize', () => {
  const blankSurvey = { groups: '', goals: '', topGoal: '', objectives: '', topObjective: '', activities: '', challenges: '', capacity: '' };
  const respondent = ({ survey, ...fields } = {}) => ({
    isSurveyRespondent: true,
    sector: 'Nonprofit/CBO',
    district: 1,
    districtLabel: DISTRICTS[1],
    otherDistricts: [],
    survey: { ...blankSurvey, ...survey },
    ...fields,
  });

  test('percentages are of the respondents who answered that question', () => {
    const summary = summarize([
      respondent({ survey: { challenges: 'Finding the right partners, Funding' } }),
      respondent({ survey: { challenges: 'Finding the right partners' } }),
      respondent({ survey: { challenges: 'Competition for funding/resources' } }),
      respondent(),
    ]);
    const challenges = sectionOf(summary, 'challenges');
    assert.equal(challenges.n, 3);
    assert.deepEqual(challenges.bars.map((b) => [b.label, b.count, b.percent]), [
      ['Finding the right partners', 2, 67],
      ['Competition for funding/resources', 1, 33],
      ['Lack of time or capacity to collaborate', 0, 0],
      ['Difficulty coordinating efforts across organizations', 0, 0],
      ['Limited knowledge of who is doing similar work', 0, 0],
      [WRITE_IN, 1, 33],
    ]);
    assert.equal(sectionOf(summary, 'goals').n, 0);
    assert.equal(sectionOf(summary, 'sector').n, 4);
  });

  test('districts: Countywide, outside the county and unknown appear only when used', () => {
    const summary = summarize([
      respondent({ otherDistricts: [DISTRICTS[2], 'Countywide'] }),
      respondent({ district: 'countywide', districtLabel: 'Countywide' }),
      respondent({ district: null, districtLabel: NOT_SPECIFIED }),
    ]);
    assert.deepEqual(countsOf(summary, 'hqDistrict'), {
      [DISTRICTS[1]]: 1,
      Countywide: 1,
      [NOT_SPECIFIED]: 1,
      [DISTRICTS[2]]: 0,
      [DISTRICTS[3]]: 0,
      [DISTRICTS[4]]: 0,
      [DISTRICTS[5]]: 0,
    });
    assert.equal(summary.hqDistricts, 1);
    assert.equal(sectionOf(summary, 'districtsServed').n, 1);
    assert.deepEqual(sectionOf(summary, 'districtsServed').bars.map((b) => [b.label, b.percent]).slice(0, 3), [
      [DISTRICTS[2], 100],
      ['Countywide', 100],
      [DISTRICTS[1], 0],
    ]);
  });

  test('works with no respondents', () => {
    const summary = summarize([]);
    assert.deepEqual([summary.respondents, summary.sectorsRepresented, summary.hqDistricts], [0, 0, 0]);
    for (const s of summary.sections) {
      assert.equal(s.n, 0);
      assert.ok(s.bars.every((b) => b.count === 0 && b.percent === 0), s.id);
    }
  });
});
