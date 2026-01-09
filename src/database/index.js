/**
 * CleanStream Database
 * Simple JSON-based storage for skip data
 * Can be upgraded to SQLite/PostgreSQL for production
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.CLEANSTREAM_DATA_DIR || path.join(__dirname, '../../data/filters');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Get filters for a specific IMDB ID
 * @param {string} imdbId - IMDB ID (e.g., 'tt1234567')
 * @returns {object|null} Filter data or null if not found
 */
function getFilters(imdbId) {
  const filePath = path.join(DATA_DIR, `${imdbId}.json`);
  
  if (!fs.existsSync(filePath)) {
    return null;
  }
  
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading filters for ${imdbId}:`, error);
    return null;
  }
}

/**
 * Save filters for a specific IMDB ID
 * @param {string} imdbId - IMDB ID
 * @param {object} filterData - Filter data to save
 */
function saveFilters(imdbId, filterData) {
  const filePath = path.join(DATA_DIR, `${imdbId}.json`);
  
  try {
    fs.writeFileSync(filePath, JSON.stringify(filterData, null, 2));
    return true;
  } catch (error) {
    console.error(`Error saving filters for ${imdbId}:`, error);
    return false;
  }
}

/**
 * Add a new skip segment to a movie/show
 * @param {string} imdbId - IMDB ID
 * @param {object} segment - Skip segment data
 */
function addSegment(imdbId, segment) {
  let filterData = getFilters(imdbId) || createEmptyFilterData(imdbId);
  
  // Generate segment ID
  segment.id = `seg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  segment.addedAt = new Date().toISOString();
  segment.votes = { up: 0, down: 0 };
  
  filterData.segments.push(segment);
  filterData.updatedAt = new Date().toISOString();
  filterData.version++;
  
  saveFilters(imdbId, filterData);
  return segment;
}

/**
 * Create empty filter data structure
 * @param {string} imdbId - IMDB ID
 */
function createEmptyFilterData(imdbId) {
  return {
    imdbId,
    title: null,
    year: null,
    type: null, // 'movie' or 'series'
    segments: [],
    releases: [], // Different release versions (theatrical, streaming, etc.)
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * List all available filter files
 */
function listAllFilters() {
  try {
    const files = fs.readdirSync(DATA_DIR);
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  } catch (error) {
    console.error('Error listing filters:', error);
    return [];
  }
}

/**
 * Vote on a segment
 * @param {string} imdbId - IMDB ID
 * @param {string} segmentId - Segment ID
 * @param {string} voteType - 'up' or 'down'
 */
function voteSegment(imdbId, segmentId, voteType) {
  const filterData = getFilters(imdbId);
  if (!filterData) return false;
  
  const segment = filterData.segments.find(s => s.id === segmentId);
  if (!segment) return false;
  
  if (voteType === 'up') {
    segment.votes.up++;
  } else if (voteType === 'down') {
    segment.votes.down++;
  }
  
  filterData.updatedAt = new Date().toISOString();
  saveFilters(imdbId, filterData);
  return true;
}

/**
 * Get statistics
 */
function getStats() {
  const filters = listAllFilters();
  let totalSegments = 0;
  
  filters.forEach(imdbId => {
    const data = getFilters(imdbId);
    if (data) {
      totalSegments += data.segments.length;
    }
  });
  
  return {
    totalMovies: filters.length,
    totalSegments,
  };
}

module.exports = {
  getFilters,
  saveFilters,
  addSegment,
  createEmptyFilterData,
  listAllFilters,
  voteSegment,
  getStats,
  DATA_DIR,
};
