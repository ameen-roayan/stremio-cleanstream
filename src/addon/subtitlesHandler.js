/**
 * Stremio Subtitles Handler
 * Delivers skip data as a "subtitle" track that users can select
 */

const { generateSkips, generateSkipVTT, generateSkipJSON } = require('../utils/skipGenerator');
const db = require('../database');

/**
 * Parse user configuration from the Stremio config URL
 * Stremio passes config as part of the addon URL
 */
function parseUserConfig(config) {
  // Default configuration - sensible defaults for family viewing
  // Lower threshold = more filtering (skip more content)
  const defaults = {
    nudity: 'low',     // Skip all nudity (low, medium, high)
    sex: 'low',        // Skip all sexual content
    violence: 'medium', // Skip medium+ violence
    language: 'off',   // Don't skip language by default
    drugs: 'off',      // Don't skip drug content by default
    fear: 'off',       // Don't skip scary scenes by default
  };
  
  if (!config) return defaults;
  
  // Handle both object config and string config
  if (typeof config === 'string') {
    try {
      return { ...defaults, ...JSON.parse(config) };
    } catch (e) {
      return defaults;
    }
  }
  
  return { ...defaults, ...config };
}

/**
 * Handle subtitle requests from Stremio
 * @param {object} args - { type, id, config }
 */
async function subtitlesHandler({ type, id, config }) {
  console.log(`[CleanStream] Subtitle request for ${type}:${id}`);
  
  // Parse IMDB ID from the request
  // Format: tt1234567 or tt1234567:1:2 (for series with season:episode)
  const parts = id.split(':');
  const imdbId = parts[0];
  
  // Check if we have filter data for this content
  const filterData = await db.getFilters(imdbId);
  
  if (!filterData || !filterData.segments || filterData.segments.length === 0) {
    console.log(`[CleanStream] No filter data found for ${imdbId}`);
    return { subtitles: [] };
  }
  
  // Parse user preferences
  const userConfig = parseUserConfig(config);
  
  // Generate skips based on user preferences
  const skips = await generateSkips(imdbId, userConfig);
  
  if (skips.length === 0) {
    console.log(`[CleanStream] No applicable skips for ${imdbId} with current settings`);
    return { subtitles: [] };
  }
  
  console.log(`[CleanStream] Found ${skips.length} skips for ${imdbId}`);
  
  // Generate subtitle tracks
  const subtitles = [];
  
  // Main CleanStream subtitle with skip markers
  const baseUrl = process.env.CLEANSTREAM_BASE_URL || 'http://localhost:7000';
  
  // VTT format with visual indicators
  subtitles.push({
    id: `cleanstream-vtt-${imdbId}`,
    url: `${baseUrl}/api/skips/${imdbId}/vtt?config=${encodeURIComponent(JSON.stringify(userConfig))}`,
    lang: `CleanStream (${skips.length} skips)`,
  });
  
  // JSON format for programmatic access
  subtitles.push({
    id: `cleanstream-json-${imdbId}`,
    url: `${baseUrl}/api/skips/${imdbId}/json?config=${encodeURIComponent(JSON.stringify(userConfig))}`,
    lang: 'CleanStream Data (JSON)',
  });
  
  return { subtitles };
}

module.exports = { subtitlesHandler, parseUserConfig };
