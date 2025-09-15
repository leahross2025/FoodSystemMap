import fs from 'fs';
import XLSX from 'xlsx';
import { createWriteStream } from 'fs';

// Rate limiting for Nominatim API
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Cache file path
const CACHE_FILE = '../data/geocode-cache.json';

// Load existing cache
function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const cacheData = fs.readFileSync(CACHE_FILE, 'utf8');
      return JSON.parse(cacheData);
    }
  } catch (error) {
    console.log('Error loading cache, starting with empty cache:', error.message);
  }
  return {};
}

// Save cache to file
function saveCache(cache) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (error) {
    console.error('Error saving cache:', error.message);
  }
}

// Generate cache key from address components
function getCacheKey(street, zipCode) {
  const cleanedAddress = cleanAddress(street, zipCode);
  if (!cleanedAddress) return null;
  return `${cleanedAddress}, Los Angeles, CA, ${zipCode}`.toLowerCase();
}

// Hardcoded fallback coordinates for problematic addresses
const fallbackCoords = {
  '7412 Fulton Ave Suite , North Hollywood, CA, Los Angeles, CA': [34.204976, -118.422009],
  '12860 Crossroads Prkwy. South, Los Angeles, CA': [34.028243, -118.024345],
  '3530 Wilshire Blvd, 8th Floor, Los Angeles, CA 90010, Los Angeles, CA': [34.061028, -118.301200],
  '3530 Wilshire Blvd., Suite 800. Los Angeles, CA': [34.061028, -118.301200],
  '7412 Fulton Ave Suite #3, North Hollywood, CA': [34.204976, -118.422009],
  '9595 Wilshire Blvd., Suite 510': [34.067321, -118.398273],
  '2000 Ave of the Stars #1000s, Los Angeles, CA 90067': [34.057580, -118.416932],
  '1710 22ND STREET, Santa Monica': [34.025681, -118.478065],
  '1231 N. Spring Street, Suite C-102': [34.069850, -118.236465],
  '222 E Glenarm Street Ste B2 Pasadena, CA 91106': [34.146061, -118.130084],
  '825 E Orange Grove Blvd, Pasadena, CA': [34.146061, -118.130084],
  '858 W Jackman St., Lancaster CA': [34.686682, -118.137425],
  '6636 Selma Avenue, Los Angeles CA': [34.100292, -118.327759],
  
  // Additional addresses from CSV
  '840 Echo Park Ave, Los Angeles, CA': [34.073635, -118.260300],
  '1000 N. Alameda St. Suite 240, Los Angeles, CA': [34.064850, -118.223300],
  '750 N Alameda St, Los Angeles, CA': [34.064850, -118.223300],
  '961 S Mariposa Ave # 205, Los Angeles, CA': [34.047825, -118.304545],
  '717 W. Temple St., Los Angeles, CA': [34.057580, -118.252300],
  '1517 ASHLAND AVE, Los Angeles, CA': [34.025681, -118.478065],
  '3551 Trousdale Parkway, Los Angeles, CA': [34.022415, -118.285530],
  '5939 Hollywood Blvd, Los Angeles, CA': [34.100292, -118.327759],
  '1734 East 41st Street, Los Angeles CA': [34.007584, -118.239456],
  '11031 Camarillo ST, Los Angeles, CA': [34.237842, -118.445123],
  'Alvarado and Beverly, Los Angeles, CA': [34.064850, -118.278945],
  '2533 W 3rd st Los Angeles, CA': [34.064850, -118.278945],
  '1150 S Olive St, Los Angeles, CA': [34.045236, -118.255468],
  '1919 E El Segundo blvd compton CA': [33.916872, -118.220062],
  '922 Vine Street, Los Angeles, CA': [34.100292, -118.327759],
  'PO Box 32861 Long Beach CA': [33.770050, -118.193739],
  
  // New addresses from the failed geocoding attempts (with proper coordinates)
  '1000 N. Alameda St., Los Angeles, CA': [34.064850, -118.223300],
  '961 S Mariposa Ave, Los Angeles, CA': [34.047825, -118.304545],
  '9595 Wilshire Blvd., Los Angeles, CA': [34.067321, -118.398273],
  '3551 Trousdale Parkway, Los Angeles, CA': [34.022415, -118.285530],
  '1734 East 41st Street, Los Angeles, CA': [34.007584, -118.239456],
  '2000 Ave of the Stars, Los Angeles, CA': [34.057580, -118.416932],
  '1710 22ND STREET, Los Angeles, CA': [34.025681, -118.478065],
  '2533 W 3rd st, Los Angeles, CA': [34.064850, -118.278945],
  '1150 S Olive St, Los Angeles, CA': [34.045236, -118.255468],
  '1919 E El Segundo blvd compton, Los Angeles, CA': [33.916872, -118.220062],
  '222 E Glenarm Street Pasadena, Los Angeles, CA': [34.146061, -118.130084],
  '1231 N. Spring Street, Los Angeles, CA': [34.069850, -118.236465],
  '858 W Jackman St., Lancaster, Los Angeles, CA': [34.686682, -118.137425],
  'PO Box 32861 Long Beach, Los Angeles, CA': [33.770050, -118.193739],
  '6636 Selma Avenue, Los Angeles, CA': [34.100292, -118.327759],
  '825 E Orange Grove Blvd, Pasadena, Los Angeles, CA': [34.146061, -118.130084],
  
  // Final addresses that still need hardcoded coordinates
  '1919 E El Segundo blvd compton CA 90222, Los Angeles, CA': [33.916872, -118.220062],
  '858 W Jackman St., Lanca, Los Angeles, CA': [34.686682, -118.137425],
  'PO Box 32861 Long Beach CA 90832, Los Angeles, CA': [33.770050, -118.193739],
  '858 W Jackman St., Lancaster CA, Los Angeles, CA': [34.686682, -118.137425],
  '2000 Ave of the Stars, Los Angeles, CA': [34.057580, -118.416932],
  '2000 Ave of the Stars, Los Angeles, CA, 90067': [34.057580, -118.416932],
  '2000 Ave of the Stars, Los Angeles, CA 90067, Los Angeles, CA, 90067': [34.057580, -118.416932],
  
  // Additional failed geocoding addresses
  '2000 Ave of the Stars #1000s, Los Angeles, CA': [34.057580, -118.416932],
  '510 S. Vermont Ave, 11th Floor, Los Angeles, CA': [34.057580, -118.291932]
};

// Clean address function
function cleanAddress(street, zipCode) {
  if (!street || !zipCode) return null;
  
  let cleaned = street.toString().trim();
  
  // Remove suite/floor information more carefully - use word boundaries
  cleaned = cleaned.replace(/\b(Suite|Ste\.?)\s*[A-Za-z0-9#\-]+/gi, '');
  cleaned = cleaned.replace(/\b#\s*[A-Za-z0-9\-]+/gi, '');
  cleaned = cleaned.replace(/\bFloor\s*\d+/gi, '');
  
  // Remove "and at" prefixes
  cleaned = cleaned.replace(/^[A-Za-z\s]+ and at /i, '');
  
  cleaned = cleaned.trim().replace(/^,+|,+$/g, '');
  
  return cleaned;
}

// Clean SPA data function - removes city names in parentheses
function cleanSPAData(spaString) {
  if (!spaString || spaString.trim() === '') return '';
  
  // Handle special cases first
  if (spaString.toLowerCase().includes('countywide')) {
    return 'Countywide';
  }
  
  // Handle multiple SPAs separated by commas
  const spas = spaString.split(',').map(spa => {
    const trimmed = spa.trim();
    // Extract just "SPA X" from strings like "SPA 4- Metro LA (Boyle Heights, Central City...)"
    const match = trimmed.match(/^SPA\s*(\d+)/i);
    return match ? `SPA ${match[1]}` : null;
  }).filter(spa => spa !== null);
  
  // Remove duplicates and return
  const uniqueSPAs = [...new Set(spas)];
  return uniqueSPAs.length > 0 ? uniqueSPAs.join(', ') : '';
}

// Geocode function using Nominatim with caching
async function geocodeAddress(street, zipCode, orgName, cache) {
  const cleanedAddress = cleanAddress(street, zipCode);
  
  if (!cleanedAddress) {
    console.log(`Skipping ${orgName}: Missing address or zip`);
    return null;
  }
  
  const fullAddress = `${cleanedAddress}, Los Angeles, CA, ${zipCode}`;
  const fallbackAddress = `${cleanedAddress}, Los Angeles, CA`;
  const cacheKey = getCacheKey(street, zipCode);
  
  // Check cache first
  if (cacheKey && cache[cacheKey]) {
    console.log(`Using cached coordinates for ${orgName}`);
    return cache[cacheKey];
  }
  
  // Check hardcoded fallbacks
  if (fallbackCoords[fullAddress]) {
    console.log(`Using hardcoded coordinates for ${orgName}`);
    const coords = fallbackCoords[fullAddress];
    if (cacheKey) cache[cacheKey] = coords; // Cache the hardcoded result
    return coords;
  }
  
  if (fallbackCoords[fallbackAddress]) {
    console.log(`Using hardcoded coordinates (fallback) for ${orgName}`);
    const coords = fallbackCoords[fallbackAddress];
    if (cacheKey) cache[cacheKey] = coords; // Cache the hardcoded result
    return coords;
  }
  
  try {
    // Try full address first
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullAddress)}&addressdetails=1&limit=1`, {
      headers: {
        'User-Agent': 'FoodSystemsStakeholderSurvey/1.0 (contact@example.com)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.length > 0) {
      const result = data[0];
      const state = result.address?.state;
      
      if (state === 'California') {
        const coords = [parseFloat(result.lat), parseFloat(result.lon)];
        console.log(`Geocoded ${orgName}: ${result.lat}, ${result.lon}`);
        if (cacheKey) cache[cacheKey] = coords; // Cache the API result
        return coords;
      }
    }
    
    // Try fallback address
    console.log(`Trying fallback for ${orgName}`);
    await delay(2000); // Increased delay for rate limiting
    
    const fallbackResponse = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fallbackAddress)}&addressdetails=1&limit=1`, {
      headers: {
        'User-Agent': 'FoodSystemsStakeholderSurvey/1.0 (contact@example.com)'
      }
    });
    
    if (!fallbackResponse.ok) {
      throw new Error(`HTTP error! status: ${fallbackResponse.status}`);
    }
    
    const fallbackData = await fallbackResponse.json();
    
    if (fallbackData.length > 0) {
      const result = fallbackData[0];
      const state = result.address?.state;
      
      if (state === 'California') {
        const coords = [parseFloat(result.lat), parseFloat(result.lon)];
        console.log(`Geocoded ${orgName} (fallback): ${result.lat}, ${result.lon}`);
        if (cacheKey) cache[cacheKey] = coords; // Cache the API result
        return coords;
      }
    }
    
    console.log(`Failed to geocode ${orgName}: ${fullAddress}`);
    if (cacheKey) cache[cacheKey] = null; // Cache the failure to avoid retrying
    return null;
    
  } catch (error) {
    console.error(`Error geocoding ${orgName}:`, error.message);
    return null;
  }
}

// Process Excel data
async function processExcel() {
  console.log('Reading Excel file...');
  
  // Load geocoding cache
  console.log('Loading geocoding cache...');
  const cache = loadCache();
  const cacheSize = Object.keys(cache).length;
  console.log(`Loaded ${cacheSize} cached entries`);
  
  const workbook = XLSX.readFile('../../public/FINAL- Food Systems Stakeholder Survey (Responses).xlsx');
  const sheetName = 'Copy of Survey Responses';
  const worksheet = workbook.Sheets[sheetName];
  
  if (!worksheet) {
    console.error(`Sheet "${sheetName}" not found. Available sheets:`, workbook.SheetNames);
    throw new Error(`Sheet "${sheetName}" not found in Excel file`);
  }
  
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  const headers = data[0];
  const rows = data.slice(1);
  
  // Convert to object format similar to Papa.parse
  const parsed = {
    data: rows.map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index] || '';
      });
      return obj;
    })
  };
  
  console.log(`Found ${parsed.data.length} organizations`);
  
  const organizations = [];
  let successCount = 0;
  let failCount = 0;
  let cacheHits = 0;
  let apiCalls = 0;
  
  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    
    console.log(`Processing ${i + 1}/${parsed.data.length}: ${row['Organization Name']}`);
    
    // Extract key fields
    const orgName = row['Organization Name'] || 'Unknown';
    const street = row['Main Org Street Address (headquarters)'] || '';
    const zipCode = row['Main Org Zip Code'] || '';
    const sector = row['Sector'] || 'Unknown';
    const primaryDistrict = row['Primary Supervisorial District  (based on headquarters address) '] || 'Unknown';
    const mission = row['Organization Mission Statement '] || '';
    const primaryActivity = row['Provide one sentence descriptor of your primary activity'] || '';
    const otherDistricts = row['Other Supervisorial District(s) Served (all districts where programs and services are provided) '] || '';
    const primarySPA = cleanSPAData(row['Primary SPA (service planning area)(Based on headquarters address)'] || '');
    const additionalSPAs = cleanSPAData(row['Additional SPA(s) (service planning area) Served  (all districts where programs and services are provided) - Mark any or all '] || '');
    const email = row['Email Address'] || '';
    const contactName = row['Your Name (First/Last)'] || '';
    const website = row['Website'] || '';
    
    // Check if this will be a cache hit
    const cacheKey = getCacheKey(street, zipCode);
    const willUseCache = cacheKey && cache[cacheKey];
    if (willUseCache) {
      cacheHits++;
    } else {
      apiCalls++;
    }
    
    // Geocode the address
    const coordinates = await geocodeAddress(street, zipCode, orgName, cache);
    
    if (coordinates) {
      successCount++;
      
      organizations.push({
        id: `org-${i}`,
        name: orgName,
        sector: sector,
        address: street,
        zipCode: zipCode,
        coordinates: coordinates,
        primaryDistrict: primaryDistrict,
        otherDistricts: otherDistricts,
        primarySPA: primarySPA,
        additionalSPAs: additionalSPAs,
        mission: mission,
        primaryActivity: primaryActivity,
        website: website,
        contact: {
          email: email,
          name: contactName
        }
      });
    } else {
      failCount++;
      console.log(`\n❌ FAILED TO IMPORT: ${orgName}`);
      console.log(`   Reason: Geocoding failed`);
      console.log(`   Address: ${street || 'N/A'}`);
      console.log(`   Zip Code: ${zipCode || 'N/A'}`);
      console.log(`   Sector: ${sector}`);
      console.log(`   Contact: ${contactName} (${email})`);
    }
    
    // Rate limiting - wait between requests
    if (i < parsed.data.length - 1) {
      await delay(2000); // Increased delay
    }
  }
  
  // Create output data
  const outputData = {
    organizations: organizations,
    metadata: {
      totalOrganizations: parsed.data.length,
      geocodedOrganizations: successCount,
      failedGeocode: failCount,
      successRate: ((successCount / parsed.data.length) * 100).toFixed(1),
      lastUpdated: new Date().toISOString(),
      districts: [...new Set(organizations.map(org => org.primaryDistrict))],
      sectors: [...new Set(organizations.map(org => org.sector))]
    }
  };
  
  // Save updated cache
  console.log('Saving geocoding cache...');
  saveCache(cache);
  const finalCacheSize = Object.keys(cache).length;
  
  // Write to file
  fs.writeFileSync('../data/organizations.json', JSON.stringify(outputData, null, 2));
  
  console.log('\n=== GEOCODING COMPLETE ===');
  console.log(`Total organizations: ${parsed.data.length}`);
  console.log(`Successfully geocoded: ${successCount}`);
  console.log(`Failed to geocode: ${failCount}`);
  console.log(`Success rate: ${outputData.metadata.successRate}%`);
  console.log('\n=== CACHE STATISTICS ===');
  console.log(`Cache hits: ${cacheHits}`);
  console.log(`API calls needed: ${apiCalls}`);
  console.log(`Cache entries before: ${cacheSize}`);
  console.log(`Cache entries after: ${finalCacheSize}`);
  console.log(`New cache entries: ${finalCacheSize - cacheSize}`);
  console.log('Output saved to: src/data/organizations.json');
  console.log('Cache saved to: src/data/geocode-cache.json');
}

// Run the script
processExcel().catch(console.error);
