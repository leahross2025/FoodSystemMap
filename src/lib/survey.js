// Survey results for the dashboard (/dashboard-simple): the answer options of each survey question
// and the counts behind every chart. Pure (no I/O), so it runs in Node (tests) and in the Worker.

import { DISTRICTS, districtLabel } from './districts.js';
import { SECTORS } from './sectors.js';

/** The bar for answers typed into the form's "Other:" box. */
export const WRITE_IN = 'Other (write-in)';

// Answer options of each question, in the order the Google Form lists them, written exactly as the
// form puts them in the sheet. Goals and objectives are the Roundtable Action Plan's standard lists;
// for the other questions these are the answers chosen by at least 3 respondents, so one-off typed
// answers count as WRITE_IN.
const GOALS = [
  'Improve affordability of healthy foods',
  'Increase equitable access to healthy foods',
  'Build market demand and consumption of healthy foods',
  'Support sustainability and resilience in food systems and supply chains',
];

const OBJECTIVES = [
  'Objective 1: Modernize the Food System (e.g. increasing equitable access, reducing food waste, supporting regenerative agricultural methods, etc.)shift toward less resource-intensive foods.',
  'Objective 2: Build a Smart & Connected Food System (e.g. use data and technology to reduce food waste, support food recovery, strengthen coordination among regional producers, etc.)',
  'Objective 3: Adopt a Dignity of Service Approach (e.g. using a human-centered approach to public benefit enrollment, program design, promotion, case management, etc.)',
  'Objective 4: Elevate Food as Medicine (e.g. medically tailored meals, prescribed nutrition, etc.)',
  'Objective 5: Bolster Nutrition Education & Support Healthy Eating (e.g. promote nutrition education, cooking workshops, etc.)',
  'Objective 6: Champion a Whole Person, Whole Community Approach (e.g. support other basic needs that lead to food and nutrition security, increase public benefit enrollment, etc.)',
];

const ACTIVITIES = [
  'Food Service (restaurants, schools, etc.)',
  'Food Production (farmer, fisher, etc.)',
  'Charitable Food Distribution (i.e., food bank, etc.)',
  'Food Distribution (private sector aggregation and distribution)',
  'Food Hub (mission driven aggregation, technical assistance and distribution at scale)',
  'Food Waste Recovery',
  'Nutrition Promotion',
  'Farmers Markets',
  'Research/Academia',
  'Convener/Connector',
  'Public Benefits Expansion & Enrollment',
  'Strengthening Food Systems',
  'Funder',
  'Policy/Advocacy',
  'Economic & Workforce Development',
  'Community Development',
  'Access to Land for Food Production',
  'Healthy Food Access',
  'Labor',
  'Food Economy',
  'Food Systems',
];

const CHALLENGES = [
  'Finding the right partners',
  'Lack of time or capacity to collaborate',
  'Difficulty coordinating efforts across organizations',
  'Limited knowledge of who is doing similar work',
  'Competition for funding/resources',
];

const CAPACITY = [
  'Webinars or training sessions on food systems topic areas',
  'Clear communication channels for coordination',
  'Data collection or impact measurement support',
  'Facilitated partnership development with key stakeholders',
];

const GROUPS = [
  'LA County Food Equity Roundtable',
  'LAFPC Leadership Circle',
  'LAFPC Working Group',
  'LA Food Equity Fund Grantee',
  'Food as Medicine Task Force',
  'Urgent Needs Calls (Fri calls in response to wildfires)',
];

/** Survey questions charted on the dashboard, in page order. `field` is the Org.survey key. */
export const QUESTIONS = [
  { field: 'topGoal', title: 'Goal most aligned', options: GOALS, single: true },
  { field: 'goals', title: 'Goals advanced', note: 'all that apply', options: GOALS },
  { field: 'topObjective', title: 'Objective most aligned', options: OBJECTIVES, single: true },
  { field: 'objectives', title: 'Objectives advanced', note: 'all that apply', options: OBJECTIVES },
  { field: 'activities', title: 'Organization activities', note: 'all that apply', options: ACTIVITIES },
  { field: 'challenges', title: 'Collaboration challenges', note: 'up to 3 answers each', options: CHALLENGES },
  { field: 'capacity', title: 'Most helpful capacity-building support', note: 'up to 3 answers each', options: CAPACITY },
  { field: 'groups', title: 'Food systems groups participation', note: 'all that apply', options: GROUPS },
];

// Typed answers that just mean "nothing" aren't counted as a write-in.
const NON_ANSWER = /^(n\/?a|none|none of the above|no|nothing|not sure|unknown|not applicable)\.?$/;

/**
 * The options chosen in one multiple-choice answer. Google Forms joins the chosen options with
 * ", ", and some options contain commas themselves, so known options are matched whole (longest
 * first, between answer separators); any other text the respondent typed counts once as WRITE_IN.
 * @param {string} cell          the answer as written in the sheet
 * @param {string[]} knownOptions  option texts as the form writes them
 * @returns {string[]}  chosen options in knownOptions order, then WRITE_IN if anything else was typed
 */
export function splitMultiSelect(cell, knownOptions) {
  // Pad with separators so every option, including the first and last, sits between ", " and ",".
  let rest = `, ${squash(cell)},`;
  const chosen = new Set();
  for (const option of [...knownOptions].sort((a, b) => b.length - a.length)) {
    const needle = `, ${squash(option)},`;
    for (let i = rest.indexOf(needle); i >= 0; i = rest.indexOf(needle)) {
      chosen.add(option);
      rest = rest.slice(0, i) + rest.slice(i + needle.length - 1); // keep the "," that followed it
    }
  }
  const picked = knownOptions.filter((option) => chosen.has(option));
  const typed = rest.split(',').some((text) => !isNothing(text.trim()));
  return typed ? [...picked, WRITE_IN] : picked;
}

/**
 * @typedef {object} Bar
 * @property {string} label
 * @property {number} count        respondents who gave this answer
 * @property {number} percent      count as a whole-number percentage of the chart's respondents
 * @property {string} [color]      sector color (sector chart only)
 * @property {string} [fullText]   the answer as worded on the form, when label is shortened
 * @property {boolean} [writeIn]   the WRITE_IN bar
 */

/**
 * @typedef {object} Section
 * @property {string} id
 * @property {string} title
 * @property {string} [note]   how to read the counts, e.g. "all that apply"
 * @property {number} n        respondents who answered (the base for percent)
 * @property {Bar[]} bars      most chosen first (sectors in legend order), WRITE_IN last
 */

/**
 * Everything the survey dashboard shows.
 * @param {import('./organizations.js').Org[]} respondents  survey respondents, duplicates already merged; other organizations are ignored
 * @returns {{ respondents: number, sectorsRepresented: number, hqDistricts: number, sections: Section[] }}
 *   hqDistricts: supervisorial districts (1–5) where at least one respondent has its headquarters
 */
export function summarize(respondents) {
  const orgs = respondents.filter((org) => org.isSurveyRespondent && org.survey);
  const n = orgs.length;
  const sectorCounts = tally(orgs.map((org) => org.sector));
  const hqCounts = tally(orgs.map((org) => org.districtLabel));
  const serving = orgs.filter((org) => org.otherDistricts.length);
  const servedCounts = tally(serving.flatMap((org) => org.otherDistricts));
  const districts = Object.values(DISTRICTS);
  const countywide = districtLabel('countywide');

  return {
    respondents: n,
    sectorsRepresented: SECTORS.filter((s) => sectorCounts.has(s.key)).length,
    hqDistricts: districts.filter((label) => hqCounts.has(label)).length,
    sections: [
      {
        id: 'sector',
        title: 'Respondents by sector',
        n,
        bars: SECTORS.map((s) => ({ ...bar(s.key, sectorCounts.get(s.key), n), color: s.color })),
      },
      ...QUESTIONS.map((question) => questionSection(question, orgs)),
      {
        id: 'hqDistrict',
        title: 'Headquarters district',
        n,
        // Every district gets a bar; Countywide, Outside LA County and Not specified only when used.
        bars: byCount(
          [1, 2, 3, 4, 5, 'countywide', 0, null]
            .map(districtLabel)
            .filter((label) => districts.includes(label) || hqCounts.has(label))
            .map((label) => bar(label, hqCounts.get(label), n)),
        ),
      },
      {
        id: 'districtsServed',
        title: 'Districts served',
        note: 'where they provide programs and services',
        n: serving.length,
        bars: byCount([...districts, countywide].map((label) => bar(label, servedCounts.get(label), serving.length))),
      },
    ],
  };
}

/** @returns {Section} */
function questionSection({ field, title, note, options, single }, orgs) {
  const counts = new Map();
  let n = 0;
  let pickedSeveral = 0;
  for (const org of orgs) {
    const answer = org.survey[field];
    if (!answer) continue;
    n++;
    const picked = splitMultiSelect(answer, options);
    if (picked.length > 1) pickedSeveral++;
    for (const option of picked) counts.set(option, (counts.get(option) ?? 0) + 1);
  }
  const bars = byCount(
    options.map((option) => {
      const label = shortLabel(option);
      return { ...bar(label, counts.get(option), n), ...(label !== option && { fullText: option }) };
    }),
  );
  if (counts.has(WRITE_IN)) bars.push({ ...bar(WRITE_IN, counts.get(WRITE_IN), n), writeIn: true });
  // A "most aligned" answer with several choices makes the percentages add up past 100%.
  if (single && pickedSeveral) note = `${pickedSeveral} chose more than one`;
  return { id: field, title, ...(note && { note }), n, bars };
}

/** "Objective 1: Modernize the Food System (e.g. …)…" → "Objective 1: Modernize the Food System" */
const shortLabel = (option) => option.replace(/\s*\(e\.g\..*$/, '');

const bar = (label, count = 0, n) => ({ label, count, percent: n ? Math.round((count / n) * 100) : 0 });

/** Most chosen first; ties keep their order. */
const byCount = (bars) => bars.sort((a, b) => b.count - a.count);

const tally = (values) => values.reduce((counts, v) => counts.set(v, (counts.get(v) ?? 0) + 1), new Map());

const squash = (text) => String(text ?? '').toLowerCase().replace(/\s+/g, ' ').replace(/ ?, ?/g, ', ').trim();

const isNothing = (text) => text.replace(/[^\p{L}\p{N}]/gu, '').length < 2 || NON_ANSWER.test(text);
