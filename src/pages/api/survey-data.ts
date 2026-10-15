// Organizations and summary counts as JSON, from the live sheet (or the saved snapshot).
// Raw survey answers and contact emails are left out.
import type { APIRoute } from 'astro';
import { loadData } from '../../lib/data.server.js';
import { SECTORS } from '../../lib/sectors.js';

export const prerender = false;

export const GET: APIRoute = async () => {
  const { organizations, report } = await loadData();
  const body = {
    organizations: organizations.map(({ survey, email, ...org }) => org),
    metadata: {
      sheetRows: report.sheetRows,
      uniqueOrganizations: report.uniqueOrganizations,
      surveyRespondents: report.surveyRespondents,
      mapOnly: report.mapOnly,
      onMap: report.onMap,
      source: report.source,
      fetchedAt: report.fetchedAt,
      sectors: SECTORS.map((s) => s.key),
    },
  };
  return Response.json(body, { headers: { 'Cache-Control': 'public, max-age=300' } });
};
