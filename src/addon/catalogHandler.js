/**
 * Stremio Catalog Handler
 * Provides a "CleanStream Ready" catalog showing movies with skip data
 */

const db = require('../database');

const TMDB_API_KEY = process.env.TMDB_API_KEY || '998d6fef6df9a4e1c2a5ff6631ec5af9';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

// Cache for TMDB lookups
const posterCache = new Map();

/**
 * Fetch poster URL from TMDB by IMDB ID
 */
async function fetchPosterFromTMDB(imdbId) {
  // Check cache first
  if (posterCache.has(imdbId)) {
    return posterCache.get(imdbId);
  }

  try {
    const response = await fetch(
      `https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`
    );
    const data = await response.json();
    
    let posterPath = null;
    if (data.movie_results && data.movie_results.length > 0) {
      posterPath = data.movie_results[0].poster_path;
    } else if (data.tv_results && data.tv_results.length > 0) {
      posterPath = data.tv_results[0].poster_path;
    }

    const posterUrl = posterPath ? `${TMDB_IMAGE_BASE}${posterPath}` : null;
    posterCache.set(imdbId, posterUrl);
    return posterUrl;
  } catch (error) {
    console.error(`[CleanStream] TMDB fetch error for ${imdbId}:`, error.message);
    return null;
  }
}

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

    // Fetch posters from TMDB (in parallel, with limit)
    const metasWithPosters = await Promise.all(
      titles.map(async (title) => {
        const poster = title.posterUrl || await fetchPosterFromTMDB(title.imdbId);
        return {
          id: title.imdbId,
          type: 'movie',
          name: title.title || title.imdbId,
          poster: poster || `https://via.placeholder.com/300x450/1a1a2e/00d4aa?text=${encodeURIComponent(title.title || title.imdbId)}`,
          description: `CleanStream: ${title.segmentCount || 0} skip segments available`,
          year: title.year,
          releaseInfo: title.year ? String(title.year) : undefined,
        };
      })
    );

    return { metas: metasWithPosters };
  } catch (error) {
    console.error('[CleanStream] Catalog error:', error);
    return { metas: [] };
  }
}

module.exports = { catalogHandler };
