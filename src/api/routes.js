/**
 * CleanStream API Routes
 * Provides REST API for skip data, contributions, and statistics
 */

const express = require('express');
const db = require('../database');
const cache = require('../cache');
const { generateSkips, generateSkipVTT, generateSkipJSON } = require('../utils/skipGenerator');
const { parseMCF, generateMCF, mcfToDBSegments, dbToMCFSegments } = require('../utils/mcf');

const router = express.Router();

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/health', async (req, res) => {
  const [dbHealth, cacheHealth] = await Promise.all([
    db.healthCheck(),
    cache.healthCheck(),
  ]);
  
  const isHealthy = dbHealth.status === 'healthy' || !process.env.DATABASE_URL;
  
  res.status(isHealthy ? 200 : 503).json({ 
    status: isHealthy ? 'ok' : 'degraded', 
    version: '1.0.0',
    database: dbHealth,
    cache: cacheHealth,
  });
});

/**
 * GET /api/stats
 * Get statistics about available filter data
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await db.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

/**
 * GET /api/filters
 * List all available filter IDs
 */
router.get('/filters', async (req, res) => {
  try {
    const titles = await db.listTitles({ limit: 100 });
    res.json({ count: titles.length, filters: titles });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list filters' });
  }
});

/**
 * GET /api/filters/:imdbId
 * Get raw filter data for a specific movie/show
 */
router.get('/filters/:imdbId', async (req, res) => {
  try {
    const { imdbId } = req.params;
    const filterData = await db.getFilters(imdbId);
    
    if (!filterData) {
      return res.status(404).json({ error: 'No filter data found for this ID' });
    }
    
    res.json(filterData);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get filter data' });
  }
});

/**
 * GET /api/skips/:imdbId
 * Get processed skip data with user preferences applied
 */
router.get('/skips/:imdbId', async (req, res) => {
  try {
    const { imdbId } = req.params;
    
    // Default config for family-friendly viewing
    const defaultConfig = {
      nudity: 'high',
      sex: 'high',
      violence: 'medium',
      language: 'off',
      drugs: 'off',
      fear: 'off',
    };
    
    // Parse user config from query params
    let userConfig = { ...defaultConfig };
    if (req.query.config) {
      try {
        userConfig = { ...defaultConfig, ...JSON.parse(req.query.config) };
      } catch (e) {
        // Use individual query params as fallback
        userConfig = {
          ...defaultConfig,
          nudity: req.query.nudity || defaultConfig.nudity,
          sex: req.query.sex || defaultConfig.sex,
          violence: req.query.violence || defaultConfig.violence,
          language: req.query.language || defaultConfig.language,
          drugs: req.query.drugs || defaultConfig.drugs,
          fear: req.query.fear || defaultConfig.fear,
        };
      }
    } else if (Object.keys(req.query).some(k => ['nudity', 'sex', 'violence', 'language', 'drugs', 'fear'].includes(k))) {
      // Individual query params provided
      userConfig = {
        ...defaultConfig,
        nudity: req.query.nudity || defaultConfig.nudity,
        sex: req.query.sex || defaultConfig.sex,
        violence: req.query.violence || defaultConfig.violence,
        language: req.query.language || defaultConfig.language,
        drugs: req.query.drugs || defaultConfig.drugs,
        fear: req.query.fear || defaultConfig.fear,
      };
    }
    
    const skips = await generateSkips(imdbId, userConfig);
    const filterData = await db.getFilters(imdbId);
    
    res.json(generateSkipJSON(skips, imdbId, filterData?.metadata || {}));
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate skips' });
  }
});

/**
 * GET /api/skips/:imdbId/vtt
 * Get skip data as VTT subtitle format
 */
router.get('/skips/:imdbId/vtt', async (req, res) => {
  const { imdbId } = req.params;
  
  let userConfig = {};
  if (req.query.config) {
    try {
      userConfig = JSON.parse(req.query.config);
    } catch (e) {
      userConfig = {};
    }
  }
  
  const skips = await generateSkips(imdbId, userConfig);
  const vtt = generateSkipVTT(skips, imdbId);
  
  res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send(vtt);
});

/**
 * GET /api/skips/:imdbId/json
 * Get skip data as JSON
 */
router.get('/skips/:imdbId/json', async (req, res) => {
  const { imdbId } = req.params;
  
  let userConfig = {};
  if (req.query.config) {
    try {
      userConfig = JSON.parse(req.query.config);
    } catch (e) {
      userConfig = {};
    }
  }
  
  const skips = await generateSkips(imdbId, userConfig);
  const filterData = await db.getFilters(imdbId);
  
  res.json(generateSkipJSON(skips, imdbId, filterData?.metadata || {}));
});

/**
 * GET /api/skips/:imdbId/mcf
 * Get skip data in MCF format
 */
router.get('/skips/:imdbId/mcf', async (req, res) => {
  const { imdbId } = req.params;
  const filterData = await db.getFilters(imdbId);
  
  if (!filterData) {
    return res.status(404).json({ error: 'No filter data found for this ID' });
  }
  
  const mcfData = {
    metadata: {
      title: filterData.title,
      year: filterData.year,
      type: filterData.type,
      imdb: `https://www.imdb.com/title/${imdbId}/`,
    },
    markers: {
      start: 0,
      end: null,
    },
    segments: dbToMCFSegments(filterData.segments),
  };
  
  const mcf = generateMCF(mcfData);
  
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${imdbId}.mcf"`);
  res.send(mcf);
});

/**
 * POST /api/contribute/:imdbId
 * Add a new skip segment (community contribution)
 */
router.post('/contribute/:imdbId', express.json(), (req, res) => {
  const { imdbId } = req.params;
  const { startMs, endMs, category, subcategory, severity, channel, comment, contributor } = req.body;
  
  // Validate required fields
  if (!startMs || !endMs || !category || !severity) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['startMs', 'endMs', 'category', 'severity'],
    });
  }
  
  // Validate severity
  if (!['low', 'medium', 'high'].includes(severity)) {
    return res.status(400).json({ error: 'Invalid severity. Must be: low, medium, or high' });
  }
  
  // Validate category
  const validCategories = ['nudity', 'sex', 'violence', 'language', 'drugs', 'fear', 'discrimination', 'dispensable', 'commercial'];
  if (!validCategories.includes(category)) {
    return res.status(400).json({ error: 'Invalid category', validCategories });
  }
  
  // Add the segment
  const segment = db.addSegment(imdbId, {
    startMs: parseInt(startMs),
    endMs: parseInt(endMs),
    category,
    subcategory: subcategory || category,
    severity,
    channel: channel || 'both',
    comment: comment || null,
    contributor: contributor || 'anonymous',
  });
  
  res.status(201).json({
    message: 'Segment added successfully',
    segment,
  });
});

/**
 * POST /api/contribute/:imdbId/mcf
 * Import an MCF file (bulk contribution)
 */
router.post('/contribute/:imdbId/mcf', express.text({ type: '*/*' }), (req, res) => {
  const { imdbId } = req.params;
  
  try {
    const mcfData = parseMCF(req.body);
    const segments = mcfToDBSegments(mcfData.segments);
    
    // Get or create filter data
    let filterData = db.getFilters(imdbId) || db.createEmptyFilterData(imdbId);
    
    // Update metadata if provided
    if (mcfData.metadata) {
      filterData.title = mcfData.metadata.title || filterData.title;
      filterData.year = mcfData.metadata.year || filterData.year;
      filterData.type = mcfData.metadata.type || filterData.type;
    }
    
    // Add all segments
    let addedCount = 0;
    for (const seg of segments) {
      db.addSegment(imdbId, {
        ...seg,
        contributor: req.query.contributor || 'mcf-import',
      });
      addedCount++;
    }
    
    res.status(201).json({
      message: 'MCF imported successfully',
      segmentsAdded: addedCount,
    });
  } catch (error) {
    res.status(400).json({ error: `Invalid MCF format: ${error.message}` });
  }
});

/**
 * POST /api/vote/:imdbId/:segmentId
 * Vote on a segment (for community moderation)
 */
router.post('/vote/:imdbId/:segmentId', express.json(), (req, res) => {
  const { imdbId, segmentId } = req.params;
  const { vote } = req.body; // 'up' or 'down'
  
  if (!['up', 'down'].includes(vote)) {
    return res.status(400).json({ error: 'Vote must be "up" or "down"' });
  }
  
  const success = db.voteSegment(imdbId, segmentId, vote);
  
  if (!success) {
    return res.status(404).json({ error: 'Segment not found' });
  }
  
  res.json({ message: 'Vote recorded' });
});

/**
 * PUT /api/filters/:imdbId/metadata
 * Update metadata for a movie/show
 */
router.put('/filters/:imdbId/metadata', express.json(), (req, res) => {
  const { imdbId } = req.params;
  const { title, year, type } = req.body;
  
  let filterData = db.getFilters(imdbId);
  
  if (!filterData) {
    filterData = db.createEmptyFilterData(imdbId);
  }
  
  if (title) filterData.title = title;
  if (year) filterData.year = parseInt(year);
  if (type) filterData.type = type;
  
  filterData.updatedAt = new Date().toISOString();
  db.saveFilters(imdbId, filterData);
  
  res.json({ message: 'Metadata updated', filterData });
});

module.exports = router;
