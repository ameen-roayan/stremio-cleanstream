/**
 * Stremio Catalog Handler
 * Provides a "CleanStream Ready" catalog showing movies with skip data
 */

const db = require('../database');

/**
 * Handle catalog requests from Stremio
 * @param {object} args - { type, id, extra }
 */
async function catalogHandler({ type, id, extra }) {
  console.log(`[CleanStream] Catalog request: ${type}/${id}`, extra);

  if (type !== 'movie') {
    return { metas: [] };
  }

  // Determine sort order based on catalog id
  let sortBy = 'recent'; // default
  if (id === 'cleanstream-recent') sortBy = 'recent';
  else if (id === 'cleanstream-popular') sortBy = 'popular';
  else if (id === 'cleanstream-year') sortBy = 'year';
  else if (id === 'cleanstream-all' || id === 'cleanstream-movies') sortBy = 'title';

  const skip = extra?.skip ? parseInt(extra.skip) : 0;
  const search = extra?.search;

  try {
    let titles;

    if (search) {
      // Search mode
      titles = await db.searchTitles(search);
    } else {
      // Browse mode - get titles with segments
      titles = await db.listTitles({
        limit: 100,
        offset: skip,
        hasSegments: true,
        sortBy: sortBy,
      });
    }

    console.log(`[CleanStream] Found ${titles.length} titles (sorted by ${sortBy})`);

    // Convert to Stremio meta format
    const metas = titles.map(title => ({
      id: title.imdbId,
      type: 'movie',
      name: title.title || title.imdbId,
      poster: title.posterUrl || generatePosterUrl(title.imdbId),
      description: `CleanStream: ${title.segmentCount || 0} skip segments available`,
      year: title.year,
      releaseInfo: title.year ? String(title.year) : undefined,
    }));

    return { metas };
  } catch (error) {
    console.error('[CleanStream] Catalog error:', error);
    return { metas: [] };
  }
}

/**
 * Generate a poster URL from IMDB ID
 * Uses a placeholder or could integrate with TMDB/OMDB
 */
function generatePosterUrl(imdbId) {
  // Placeholder poster - could be replaced with actual TMDB lookup
  return `https://via.placeholder.com/300x450/1a1a2e/00d4aa?text=${imdbId}`;
}

module.exports = { catalogHandler };
