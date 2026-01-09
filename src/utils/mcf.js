/**
 * MCF (MovieContentFilter) Format Parser/Generator
 * Based on the MCF 1.1.0 specification
 * https://www.moviecontentfilter.com/specification
 */

// Category mappings from MCF spec
const CATEGORIES = {
  // Nudity
  nudity: 'nudity',
  bareButtocks: 'nudity',
  exposedGenitalia: 'nudity',
  fullNudity: 'nudity',
  toplessness: 'nudity',
  
  // Sex
  sex: 'sex',
  adultery: 'sex',
  analSex: 'sex',
  coitus: 'sex',
  kissing: 'sex',
  masturbation: 'sex',
  objectification: 'sex',
  oralSex: 'sex',
  premaritalSex: 'sex',
  promiscuity: 'sex',
  prostitution: 'sex',
  
  // Violence
  violence: 'violence',
  choking: 'violence',
  crueltyToAnimals: 'violence',
  culturalViolence: 'violence',
  desecration: 'violence',
  emotionalViolence: 'violence',
  kicking: 'violence',
  massacre: 'violence',
  murder: 'violence',
  punching: 'violence',
  rape: 'violence',
  slapping: 'violence',
  slavery: 'violence',
  stabbing: 'violence',
  torture: 'violence',
  warfare: 'violence',
  weapons: 'violence',
  
  // Language
  language: 'language',
  blasphemy: 'language',
  nameCalling: 'language',
  sexualDialogue: 'language',
  swearing: 'language',
  vulgarity: 'language',
  
  // Drugs
  drugs: 'drugs',
  alcohol: 'drugs',
  antipsychotics: 'drugs',
  cigarettes: 'drugs',
  depressants: 'drugs',
  gambling: 'drugs',
  hallucinogens: 'drugs',
  stimulants: 'drugs',
  
  // Fear
  fear: 'fear',
  accident: 'fear',
  acrophobia: 'fear',
  aliens: 'fear',
  arachnophobia: 'fear',
  claustrophobia: 'fear',
  death: 'fear',
  explosion: 'fear',
  fire: 'fear',
  ghosts: 'fear',
  vampires: 'fear',
  
  // Discrimination
  discrimination: 'discrimination',
  racism: 'discrimination',
  sexism: 'discrimination',
  homophobia: 'discrimination',
  
  // Dispensable
  dispensable: 'dispensable',
  tedious: 'dispensable',
  
  // Commercial
  commercial: 'commercial',
  productPlacement: 'commercial',
};

// Severity levels
const SEVERITIES = ['low', 'medium', 'high'];

// Channel types
const CHANNELS = ['both', 'video', 'audio'];

/**
 * Parse MCF format string to structured data
 * @param {string} mcfContent - MCF file content
 * @returns {object} Parsed filter data
 */
function parseMCF(mcfContent) {
  const lines = mcfContent.split(/\r?\n/);
  
  // Validate header
  if (!lines[0].startsWith('WEBVTT MovieContentFilter')) {
    throw new Error('Invalid MCF format: missing header');
  }
  
  const result = {
    version: lines[0].split(' ')[2] || '1.1.0',
    metadata: {},
    markers: {
      start: null,
      end: null,
    },
    segments: [],
  };
  
  let i = 2; // Skip header and blank line
  let inNote = false;
  let currentCue = null;
  
  while (i < lines.length) {
    const line = lines[i].trim();
    
    // Parse NOTE sections
    if (line === 'NOTE') {
      inNote = true;
      i++;
      continue;
    }
    
    if (inNote) {
      if (line === '') {
        inNote = false;
      } else if (line.startsWith('TITLE ')) {
        result.metadata.title = line.substring(6);
      } else if (line.startsWith('YEAR ')) {
        result.metadata.year = parseInt(line.substring(5));
      } else if (line.startsWith('TYPE ')) {
        result.metadata.type = line.substring(5);
      } else if (line.startsWith('SEASON ')) {
        result.metadata.season = parseInt(line.substring(7));
      } else if (line.startsWith('EPISODE ')) {
        result.metadata.episode = parseInt(line.substring(8));
      } else if (line.startsWith('IMDB ')) {
        result.metadata.imdb = line.substring(5);
      } else if (line.startsWith('SOURCE ')) {
        result.metadata.source = line.substring(7);
      } else if (line.startsWith('RELEASE ')) {
        result.metadata.release = line.substring(8);
      } else if (line.startsWith('START ')) {
        result.markers.start = parseTimestamp(line.substring(6));
      } else if (line.startsWith('END ')) {
        result.markers.end = parseTimestamp(line.substring(4));
      }
      i++;
      continue;
    }
    
    // Parse timestamp line (cue start)
    if (line.includes(' --> ')) {
      const [startTime, endTime] = line.split(' --> ');
      currentCue = {
        startTime: parseTimestamp(startTime),
        endTime: parseTimestamp(endTime),
        filters: [],
      };
      i++;
      continue;
    }
    
    // Parse filter entries
    if (currentCue && line !== '') {
      const filter = parseFilterLine(line);
      if (filter) {
        currentCue.filters.push(filter);
      }
    }
    
    // End of cue (blank line)
    if (line === '' && currentCue) {
      if (currentCue.filters.length > 0) {
        result.segments.push(currentCue);
      }
      currentCue = null;
    }
    
    i++;
  }
  
  // Don't forget last cue if no trailing newline
  if (currentCue && currentCue.filters.length > 0) {
    result.segments.push(currentCue);
  }
  
  return result;
}

/**
 * Parse a filter line like "violence=high=video # comment"
 */
function parseFilterLine(line) {
  // Split off comment
  const [filterPart, comment] = line.split(' # ');
  const parts = filterPart.split('=');
  
  if (parts.length < 2) return null;
  
  return {
    category: parts[0],
    parentCategory: CATEGORIES[parts[0]] || parts[0],
    severity: parts[1],
    channel: parts[2] || 'both',
    comment: comment || null,
  };
}

/**
 * Parse WebVTT timestamp to milliseconds
 * @param {string} timestamp - Format: HH:MM:SS.mmm
 */
function parseTimestamp(timestamp) {
  const match = timestamp.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
  if (!match) return 0;
  
  const hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const seconds = parseInt(match[3]);
  const ms = parseInt(match[4]);
  
  return (hours * 3600 + minutes * 60 + seconds) * 1000 + ms;
}

/**
 * Format milliseconds to WebVTT timestamp
 * @param {number} ms - Milliseconds
 */
function formatTimestamp(ms) {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

/**
 * Generate MCF format from structured data
 * @param {object} data - Structured filter data
 */
function generateMCF(data) {
  let mcf = 'WEBVTT MovieContentFilter 1.1.0\n\n';
  
  // Add metadata
  if (data.metadata && Object.keys(data.metadata).length > 0) {
    mcf += 'NOTE\n';
    if (data.metadata.title) mcf += `TITLE ${data.metadata.title}\n`;
    if (data.metadata.year) mcf += `YEAR ${data.metadata.year}\n`;
    if (data.metadata.type) mcf += `TYPE ${data.metadata.type}\n`;
    if (data.metadata.season) mcf += `SEASON ${data.metadata.season}\n`;
    if (data.metadata.episode) mcf += `EPISODE ${data.metadata.episode}\n`;
    if (data.metadata.imdb) mcf += `IMDB ${data.metadata.imdb}\n`;
    if (data.metadata.release) mcf += `RELEASE ${data.metadata.release}\n`;
    mcf += '\n';
  }
  
  // Add markers
  if (data.markers) {
    mcf += 'NOTE\n';
    if (data.markers.start !== null) mcf += `START ${formatTimestamp(data.markers.start)}\n`;
    if (data.markers.end !== null) mcf += `END ${formatTimestamp(data.markers.end)}\n`;
    mcf += '\n';
  }
  
  // Add segments
  for (const segment of data.segments || []) {
    mcf += `${formatTimestamp(segment.startTime)} --> ${formatTimestamp(segment.endTime)}\n`;
    
    for (const filter of segment.filters || []) {
      let line = `${filter.category}=${filter.severity}`;
      if (filter.channel && filter.channel !== 'both') {
        line += `=${filter.channel}`;
      }
      if (filter.comment) {
        line += ` # ${filter.comment}`;
      }
      mcf += line + '\n';
    }
    
    mcf += '\n';
  }
  
  return mcf;
}

/**
 * Convert internal database format to MCF-compatible segments
 */
function dbToMCFSegments(dbSegments) {
  return dbSegments.map(seg => ({
    startTime: seg.startMs,
    endTime: seg.endMs,
    filters: [{
      category: seg.subcategory || seg.category,
      parentCategory: seg.category,
      severity: seg.severity,
      channel: seg.channel || 'both',
      comment: seg.comment || null,
    }],
  }));
}

/**
 * Convert MCF segments to internal database format
 */
function mcfToDBSegments(mcfSegments) {
  const dbSegments = [];
  
  for (const seg of mcfSegments) {
    for (const filter of seg.filters) {
      dbSegments.push({
        startMs: seg.startTime,
        endMs: seg.endTime,
        category: filter.parentCategory || CATEGORIES[filter.category] || filter.category,
        subcategory: filter.category,
        severity: filter.severity,
        channel: filter.channel || 'both',
        comment: filter.comment,
      });
    }
  }
  
  return dbSegments;
}

module.exports = {
  parseMCF,
  generateMCF,
  parseTimestamp,
  formatTimestamp,
  dbToMCFSegments,
  mcfToDBSegments,
  CATEGORIES,
  SEVERITIES,
  CHANNELS,
};
