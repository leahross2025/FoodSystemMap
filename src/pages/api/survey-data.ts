import Papa from 'papaparse';
import { SHEET_CSV_URL } from '../../config/googleSheets.js';

export const prerender = false;

function cleanSPA(spaString: string): string {
  if (!spaString || spaString.trim() === '') return '';
  if (spaString.toLowerCase().includes('countywide')) return 'Countywide';
  const spas = spaString.split(',').map(spa => {
    const match = spa.trim().match(/^SPA\s*(\d+)/i);
    return match ? `SPA ${match[1]}` : null;
  }).filter(Boolean);
  return [...new Set(spas)].join(', ');
}

export const GET = async () => {
  try {
    const sheetResponse = await fetch(SHEET_CSV_URL);
    if (!sheetResponse.ok) {
      throw new Error(`Failed to fetch sheet: ${sheetResponse.status} ${sheetResponse.statusText}`);
    }
    const csvText = await sheetResponse.text();

    const parsed = Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: true,
    });

    const organizations = parsed.data.map((row, i) => {
      const rawDistrict = (row['Primary Supervisorial District  (based on headquarters address) '] || '').trim();
      const isMapOnly = !row['Sector']?.trim() && !rawDistrict;
      const primaryDistrict = isMapOnly ? 'Other' : (rawDistrict || 'Unknown');
      return {
      id: `org-${i}`,
      name: row['Organization Name'] || 'Unknown',
      mapOnly: isMapOnly,
      sector: row['Sector'] || 'Unknown',
      address: row['Main Org Street Address (headquarters)'] || '',
      zipCode: row['Main Org Zip Code'] || '',
      primaryDistrict,
      otherDistricts: row['Other Supervisorial District(s) Served (all districts where programs and services are provided) '] || '',
      primarySPA: cleanSPA(row['Primary SPA (service planning area)(Based on headquarters address)'] || ''),
      additionalSPAs: cleanSPA(row['Additional SPA(s) (service planning area) Served  (all districts where programs and services are provided) - Mark any or all '] || ''),
      mission: row['Organization Mission Statement '] || '',
      primaryActivity: row['Provide one sentence descriptor of your primary activity'] || '',
      website: row['Website'] || '',
      contact: {
        email: row['Email Address'] || '',
        name: row['Your Name (First/Last)'] || '',
      },
      };
    });

    const output = {
      organizations,
      metadata: {
        totalOrganizations: organizations.length,
        lastUpdated: new Date().toISOString(),
        sectors: [...new Set(organizations.map(o => o.sector))],
        districts: [...new Set(organizations.map(o => o.primaryDistrict))],
      },
    };

    return new Response(JSON.stringify(output), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
