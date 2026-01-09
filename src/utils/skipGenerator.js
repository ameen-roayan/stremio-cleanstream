/**
 * Skip Generator
 * Generates skip instructions based on user preferences and available filter data
 */

const db = require('../database');
const { CATEGORIES } = require('./mcf');

// Severity level ordering for comparison
const SEVERITY_LEVELS = {
  off: 0,
  low: 1,
  medium: 2,
  high: 3,
};

/**
 * Generate skip segments for a movie/show based on user preferences
 * @param {string} imdbId - IMDB ID
 * @param {object} userConfig - User's filter preferences
 * @returns {array} Array of skip segments
 */
function generateSkips(imdbId, userConfig = {}) {
  const filterData = db.getFilters(imdbId);
  
  if (!filterData || !filterData.segments || filterData.segments.length === 0) {
    return [];
  }
  
  // Default config - skip nothing
  const config = {
    nudity: 'off',
    sex: 'off',
    violence: 'off',
    language: 'off',
    drugs: 'off',
    fear: 'off',
    discrimination: 'off',
    dispensable: 'off',
    commercial: 'off',
    ...userConfig,
  };
  
  const skips = [];
  
  for (const segment of filterData.segments) {
    const category = segment.category;
    const severity = segment.severity;
    const userThreshold = config[category];
    
    // Skip if user hasn't enabled this category
    if (!userThreshold || userThreshold === 'off') {
      continue;
    }
    
    // Include segment if its severity meets or exceeds user threshold
    // e.g., if user sets "medium", include "medium" and "high" severity segments
    if (SEVERITY_LEVELS[severity] >= SEVERITY_LEVELS[userThreshold]) {
      skips.push({
        id: segment.id,
        startMs: segment.startMs,
        endMs: segment.endMs,
        startTime: formatTimeForDisplay(segment.startMs),
        endTime: formatTimeForDisplay(segment.endMs),
        duration: segment.endMs - segment.startMs,
        category,
        subcategory: segment.subcategory,
        severity,
        channel: segment.channel || 'both',
        description: segment.comment || generateDescription(category, severity),
      });
    }
  }
  
  // Sort by start time and merge overlapping segments
  return mergeOverlappingSkips(skips.sort((a, b) => a.startMs - b.startMs));
}

/**
 * Merge overlapping skip segments
 */
function mergeOverlappingSkips(skips) {
  if (skips.length < 2) return skips;
  
  const merged = [skips[0]];
  
  for (let i = 1; i < skips.length; i++) {
    const current = skips[i];
    const last = merged[merged.length - 1];
    
    // Check if overlapping or adjacent (within 500ms)
    if (current.startMs <= last.endMs + 500) {
      // Extend the last segment
      last.endMs = Math.max(last.endMs, current.endMs);
      last.endTime = formatTimeForDisplay(last.endMs);
      last.duration = last.endMs - last.startMs;
      
      // Combine descriptions
      if (current.category !== last.category) {
        last.description = `${last.description}, ${current.category}`;
      }
    } else {
      merged.push(current);
    }
  }
  
  return merged;
}

/**
 * Generate human-readable description
 */
function generateDescription(category, severity) {
  const descriptions = {
    nudity: 'Nudity',
    sex: 'Sexual content',
    violence: 'Violence',
    language: 'Strong language',
    drugs: 'Drug/alcohol use',
    fear: 'Frightening scene',
    discrimination: 'Discriminatory content',
    dispensable: 'Skippable scene',
    commercial: 'Product placement',
  };
  
  return descriptions[category] || category;
}

/**
 * Format milliseconds for display (MM:SS)
 */
function formatTimeForDisplay(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Generate a VTT file with skip markers
 * This is a creative approach - we embed skip data as subtitles
 * that can be parsed by a companion script/extension
 */
function generateSkipVTT(skips, imdbId) {
  let vtt = 'WEBVTT CleanStream Skip Data\n';
  vtt += `X-CLEANSTREAM-VERSION: 1.0.0\n`;
  vtt += `X-CLEANSTREAM-IMDB: ${imdbId}\n`;
  vtt += `X-CLEANSTREAM-TOTAL-SKIPS: ${skips.length}\n\n`;
  
  skips.forEach((skip, index) => {
    // Add 1 second before each skip as a warning
    const warningStart = Math.max(0, skip.startMs - 3000);
    const warningEnd = skip.startMs;
    
    vtt += `${index + 1}-warning\n`;
    vtt += `${formatVTTTimestamp(warningStart)} --> ${formatVTTTimestamp(warningEnd)}\n`;
    vtt += `<c.cleanstream-warning>⏭️ Scene skip in 3s (${skip.description})</c>\n\n`;
    
    // Add skip marker during the scene
    vtt += `${index + 1}-skip\n`;
    vtt += `${formatVTTTimestamp(skip.startMs)} --> ${formatVTTTimestamp(skip.endMs)}\n`;
    vtt += `<c.cleanstream-skip>⏭️ Press → to skip (${skip.description})</c>\n\n`;
  });
  
  return vtt;
}

/**
 * Generate JSON skip data for programmatic use
 */
function generateSkipJSON(skips, imdbId, metadata = {}) {
  return {
    version: '1.0.0',
    imdbId,
    metadata,
    generatedAt: new Date().toISOString(),
    totalSkips: skips.length,
    totalSkipTime: skips.reduce((sum, s) => sum + s.duration, 0),
    skips,
  };
}

/**
 * Format VTT timestamp
 */
function formatVTTTimestamp(ms) {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

module.exports = {
  generateSkips,
  generateSkipVTT,
  generateSkipJSON,
  mergeOverlappingSkips,
  formatTimeForDisplay,
  formatVTTTimestamp,
  SEVERITY_LEVELS,
};
