/**
 * Redis Cache Module
 * 
 * Provides caching layer for skip data to reduce database load
 * Falls back gracefully when Redis is unavailable
 */

const Redis = require('ioredis');

let redis = null;
let isConnected = false;

// Cache TTL in seconds
const CACHE_TTL = {
  filters: 3600,      // 1 hour for filter data
  skips: 1800,        // 30 min for processed skips
  stats: 300,         // 5 min for stats
  titles: 600,        // 10 min for title lists
};

/**
 * Initialize Redis connection
 */
async function initialize() {
  const redisUrl = process.env.REDIS_URL;
  
  if (!redisUrl) {
    console.log('[Cache] REDIS_URL not set, caching disabled');
    return false;
  }
  
  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      lazyConnect: true,
      // Don't block app if Redis is down
      enableOfflineQueue: false,
    });
    
    // Event handlers
    redis.on('connect', () => {
      console.log('[Cache] Connected to Redis');
      isConnected = true;
    });
    
    redis.on('error', (err) => {
      console.error('[Cache] Redis error:', err.message);
      isConnected = false;
    });
    
    redis.on('close', () => {
      console.log('[Cache] Redis connection closed');
      isConnected = false;
    });
    
    // Attempt connection
    await redis.connect();
    await redis.ping();
    
    isConnected = true;
    console.log('[Cache] Redis ready');
    return true;
  } catch (error) {
    console.warn('[Cache] Failed to connect to Redis:', error.message);
    isConnected = false;
    return false;
  }
}

/**
 * Check if cache is available
 */
function isAvailable() {
  return isConnected && redis !== null;
}

/**
 * Get value from cache
 * @param {string} key Cache key
 * @returns {any|null} Cached value or null
 */
async function get(key) {
  if (!isAvailable()) return null;
  
  try {
    const value = await redis.get(key);
    if (value) {
      return JSON.parse(value);
    }
    return null;
  } catch (error) {
    console.warn('[Cache] Get error:', error.message);
    return null;
  }
}

/**
 * Set value in cache
 * @param {string} key Cache key
 * @param {any} value Value to cache
 * @param {number} ttl TTL in seconds (optional)
 */
async function set(key, value, ttl = CACHE_TTL.filters) {
  if (!isAvailable()) return false;
  
  try {
    await redis.setex(key, ttl, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn('[Cache] Set error:', error.message);
    return false;
  }
}

/**
 * Delete value from cache
 * @param {string} key Cache key
 */
async function del(key) {
  if (!isAvailable()) return false;
  
  try {
    await redis.del(key);
    return true;
  } catch (error) {
    console.warn('[Cache] Delete error:', error.message);
    return false;
  }
}

/**
 * Delete multiple keys by pattern
 * @param {string} pattern Key pattern (e.g., "filters:*")
 */
async function delPattern(pattern) {
  if (!isAvailable()) return false;
  
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    return true;
  } catch (error) {
    console.warn('[Cache] Delete pattern error:', error.message);
    return false;
  }
}

/**
 * Invalidate cache for a specific IMDB ID
 * @param {string} imdbId IMDB ID
 */
async function invalidateTitle(imdbId) {
  await delPattern(`filters:${imdbId}*`);
  await delPattern(`skips:${imdbId}*`);
}

/**
 * Cache keys helper
 */
const keys = {
  filters: (imdbId) => `filters:${imdbId}`,
  skips: (imdbId, configHash) => `skips:${imdbId}:${configHash}`,
  stats: () => 'stats:global',
  titles: (page) => `titles:list:${page}`,
};

/**
 * Health check
 */
async function healthCheck() {
  if (!isAvailable()) {
    return { status: 'unavailable', type: 'redis' };
  }
  
  try {
    const start = Date.now();
    await redis.ping();
    const latency = Date.now() - start;
    return { status: 'healthy', type: 'redis', latencyMs: latency };
  } catch (error) {
    return { status: 'unhealthy', type: 'redis', error: error.message };
  }
}

/**
 * Graceful shutdown
 */
async function disconnect() {
  if (redis) {
    await redis.quit();
    redis = null;
    isConnected = false;
    console.log('[Cache] Disconnected from Redis');
  }
}

/**
 * Get cache stats
 */
async function getStats() {
  if (!isAvailable()) return null;
  
  try {
    const info = await redis.info('stats');
    const memory = await redis.info('memory');
    return { info, memory };
  } catch (error) {
    return null;
  }
}

module.exports = {
  initialize,
  isAvailable,
  get,
  set,
  del,
  delPattern,
  invalidateTitle,
  keys,
  healthCheck,
  disconnect,
  getStats,
  CACHE_TTL,
};
