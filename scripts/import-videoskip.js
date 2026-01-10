#!/usr/bin/env node
/**
 * VideoSkip Importer
 * 
 * Downloads and imports skip files from VideoSkip Exchange into CleanStream database
 * 
 * Usage:
 *   node scripts/import-videoskip.js                    # Import all available
 *   node scripts/import-videoskip.js --movie "Matrix"   # Search and import specific movie
 *   node scripts/import-videoskip.js --id 776           # Import by VideoSkip ID
 *   node scripts/import-videoskip.js --list             # List available movies
 */

const https = require('https');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// VideoSkip category mapping to CleanStream categories
const CATEGORY_MAP = {
  'sex': 'sex',
  'nud': 'nudity',
  'nude': 'nudity',
  'nudity': 'nudity',
  'viol': 'violence',
  'violence': 'violence',
  'gore': 'violence',
  'lang': 'language',
  'language': 'language',
  'profanity': 'language',
  'drug': 'drugs',
  'drugs': 'drugs',
  'alcohol': 'drugs',
  'smoking': 'drugs',
  'fear': 'fear',
  'scary': 'fear',
  'intense': 'fear',
  'frightening': 'fear',
  // Additional categories
  'immodesty': 'nudity',
  'sensuality': 'sex',
  'disturbing': 'fear',
};

// Severity mapping (VideoSkip uses 1-3, we use low/medium/high)
const SEVERITY_MAP = {
  '1': 'low',
  '2': 'medium', 
  '3': 'high',
};

// Channel mapping
const CHANNEL_MAP = {
  'video': 'video',
  'image': 'video',
  'blank': 'video',
  'blur': 'video',
  'audio': 'audio',
  'word': 'audio',
  'mute': 'audio',
  'skip': 'both',
};

/**
 * Parse VideoSkip .skp file format
 * Format is similar to VTT:
 * 
 * 0:14:08.27 --> 0:14:14
 * nude image 1 (male, from behind)
 * 
 * @param {string} content - Raw .skp file content
 * @returns {Array} Parsed segments
 */
function parseSkpFile(content) {
  const segments = [];
  const lines = content.split('\n');
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    
    // Look for timestamp line: "0:14:08.27 --> 0:14:14"
    const timeMatch = line.match(/^(\d+:?\d*:\d+\.?\d*)\s*-->\s*(\d+:?\d*:\d+\.?\d*)$/);
    
    if (timeMatch) {
      const startTime = parseTimestamp(timeMatch[1]);
      const endTime = parseTimestamp(timeMatch[2]);
      
      // Next line should be the category/description
      i++;
      if (i < lines.length) {
        const descLine = lines[i].trim();
        
        if (descLine && !descLine.match(/^\d+:?\d*:\d+/)) {
          const parsed = parseDescriptionLine(descLine);
          
          if (parsed.category) {
            segments.push({
              startMs: startTime,
              endMs: endTime,
              category: parsed.category,
              severity: parsed.severity,
              channel: parsed.channel,
              comment: parsed.comment,
            });
          }
        }
      }
    }
    
    i++;
  }
  
  return segments;
}

/**
 * Parse timestamp string to milliseconds
 * Handles formats: "1:23:45.67", "23:45.67", "45.67"
 */
function parseTimestamp(ts) {
  const parts = ts.split(':');
  let hours = 0, minutes = 0, seconds = 0;
  
  if (parts.length === 3) {
    hours = parseInt(parts[0], 10);
    minutes = parseInt(parts[1], 10);
    seconds = parseFloat(parts[2]);
  } else if (parts.length === 2) {
    minutes = parseInt(parts[0], 10);
    seconds = parseFloat(parts[1]);
  } else {
    seconds = parseFloat(parts[0]);
  }
  
  return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
}

/**
 * Parse description line like "nude image 1 (male, from behind)"
 */
function parseDescriptionLine(line) {
  const result = {
    category: null,
    severity: 'medium',
    channel: 'both',
    comment: null,
  };
  
  // Extract comment in parentheses
  const commentMatch = line.match(/\(([^)]+)\)/);
  if (commentMatch) {
    result.comment = commentMatch[1];
    line = line.replace(/\([^)]+\)/, '').trim();
  }
  
  // Split remaining words
  const words = line.toLowerCase().split(/\s+/);
  
  for (const word of words) {
    // Check for category
    if (CATEGORY_MAP[word]) {
      result.category = CATEGORY_MAP[word];
    }
    
    // Check for severity (1, 2, 3)
    if (SEVERITY_MAP[word]) {
      result.severity = SEVERITY_MAP[word];
    }
    
    // Check for channel
    if (CHANNEL_MAP[word]) {
      result.channel = CHANNEL_MAP[word];
    }
  }
  
  // Default category if none found
  if (!result.category) {
    // Try to infer from comment
    if (result.comment) {
      const commentLower = result.comment.toLowerCase();
      for (const [key, value] of Object.entries(CATEGORY_MAP)) {
        if (commentLower.includes(key)) {
          result.category = value;
          break;
        }
      }
    }
  }
  
  return result;
}

/**
 * Fetch JSON from URL
 */
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${url}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Fetch text from URL
 */
function fetchText(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : require('http');
    client.get(url, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchText(res.headers.location).then(resolve).catch(reject);
      }
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

/**
 * Search VideoSkip exchange for movies
 */
async function searchVideoSkip(query) {
  console.log(`Searching VideoSkip for: ${query}`);
  
  // VideoSkip uses TMDB for search, we'll scrape their browse page
  // For now, let's use a known list of popular movies with skip files
  const popularMovies = [
    { id: 776, title: 'Oppenheimer', year: 2023, tmdbId: 872585, imdbId: 'tt15398776' },
    { id: 769, title: 'Game of Thrones S1E1', year: 2011, tmdbId: 1399, imdbId: 'tt0944947' },
    { id: 4602, title: 'X-Men', year: 2000, tmdbId: 36657, imdbId: 'tt0120903' },
    { id: 4470, title: 'Train Dreams', year: 2025, tmdbId: 1064213, imdbId: 'tt21371282' },
  ];
  
  const results = popularMovies.filter(m => 
    m.title.toLowerCase().includes(query.toLowerCase())
  );
  
  return results;
}

/**
 * Get skip file content from VideoSkip
 */
async function getSkipFile(videoSkipId) {
  // VideoSkip skip files are available at their exchange
  // Format: https://videoskip.org/exchange/skip/{id}/
  // The actual .skp file download link is on that page
  
  try {
    // Try direct download URL pattern
    const url = `https://videoskip.herokuapp.com/exchange/download/${videoSkipId}/`;
    console.log(`Fetching skip file from: ${url}`);
    
    const content = await fetchText(url);
    return content;
  } catch (error) {
    console.error(`Failed to fetch skip file ${videoSkipId}:`, error.message);
    return null;
  }
}

/**
 * Import a single movie's skip data
 */
async function importMovie(imdbId, title, year, skpContent) {
  console.log(`\nImporting: ${title} (${year}) - ${imdbId}`);
  
  // Parse the skip file
  const segments = parseSkpFile(skpContent);
  
  if (segments.length === 0) {
    console.log('  No valid segments found');
    return { imported: 0 };
  }
  
  console.log(`  Found ${segments.length} segments`);
  
  // Create or update title
  const dbTitle = await prisma.title.upsert({
    where: { imdbId },
    update: { title, year },
    create: {
      imdbId,
      title,
      year,
      type: 'movie',
    },
  });
  
  // Import segments
  let imported = 0;
  let skipped = 0;
  
  for (const seg of segments) {
    if (!seg.category) {
      skipped++;
      continue;
    }
    
    // Check for duplicate (same start time and category)
    const existing = await prisma.segment.findFirst({
      where: {
        titleId: dbTitle.id,
        startMs: seg.startMs,
        category: seg.category,
      },
    });
    
    if (existing) {
      skipped++;
      continue;
    }
    
    await prisma.segment.create({
      data: {
        titleId: dbTitle.id,
        startMs: seg.startMs,
        endMs: seg.endMs,
        category: seg.category,
        subcategory: seg.category,
        severity: seg.severity,
        channel: seg.channel,
        comment: seg.comment,
        contributor: 'videoskip-import',
      },
    });
    
    imported++;
  }
  
  console.log(`  Imported: ${imported}, Skipped: ${skipped}`);
  
  return { imported, skipped };
}

/**
 * Import from a local .skp file
 */
async function importFromFile(filePath, imdbId, title, year) {
  const fs = require('fs');
  
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return;
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  await importMovie(imdbId, title, year, content);
}

/**
 * Bulk import from VideoSkip exchange
 */
async function bulkImport(limit = 10) {
  console.log(`\nBulk importing up to ${limit} movies from VideoSkip...\n`);
  
  // List of known movies with skip files on VideoSkip
  // You can expand this list or scrape the exchange
  const knownMovies = [
    { vsId: 776, imdbId: 'tt15398776', title: 'Oppenheimer', year: 2023 },
    { vsId: 4602, imdbId: 'tt0120903', title: 'X-Men', year: 2000 },
    { vsId: 869, imdbId: 'tt0993846', title: 'The Wolf of Wall Street', year: 2013 },
    // Add more as needed
  ];
  
  let totalImported = 0;
  let processed = 0;
  
  for (const movie of knownMovies.slice(0, limit)) {
    try {
      const skpContent = await getSkipFile(movie.vsId);
      
      if (skpContent) {
        const result = await importMovie(
          movie.imdbId,
          movie.title,
          movie.year,
          skpContent
        );
        totalImported += result.imported;
      }
      
      processed++;
      
      // Rate limiting
      await new Promise(r => setTimeout(r, 1000));
    } catch (error) {
      console.error(`Error importing ${movie.title}:`, error.message);
    }
  }
  
  console.log(`\n=== Import Complete ===`);
  console.log(`Processed: ${processed} movies`);
  console.log(`Total segments imported: ${totalImported}`);
}

/**
 * Main CLI
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
VideoSkip Importer for CleanStream

Usage:
  node scripts/import-videoskip.js [options]

Options:
  --list              List popular movies with skip files
  --search <query>    Search for a movie
  --import <vsId>     Import by VideoSkip ID
  --file <path>       Import from local .skp file
  --imdb <id>         IMDB ID for the movie (used with --file)
  --title <name>      Movie title (used with --file)
  --year <year>       Release year (used with --file)
  --bulk [limit]      Bulk import from exchange (default: 10)
  --help              Show this help

Examples:
  node scripts/import-videoskip.js --list
  node scripts/import-videoskip.js --search "Oppenheimer"
  node scripts/import-videoskip.js --file ./oppenheimer.skp --imdb tt15398776 --title "Oppenheimer" --year 2023
  node scripts/import-videoskip.js --bulk 20
`);
    return;
  }
  
  try {
    if (args.includes('--list')) {
      console.log('\nPopular movies with VideoSkip files:\n');
      console.log('ID    | IMDB ID     | Title');
      console.log('------|-------------|------------------');
      console.log('776   | tt15398776  | Oppenheimer (2023)');
      console.log('4602  | tt0120903   | X-Men (2000)');
      console.log('869   | tt0993846   | The Wolf of Wall Street (2013)');
      console.log('769   | tt0944947   | Game of Thrones S1E1');
      console.log('\nVisit https://videoskip.org/exchange/ for full list');
      return;
    }
    
    if (args.includes('--search')) {
      const idx = args.indexOf('--search');
      const query = args[idx + 1];
      const results = await searchVideoSkip(query);
      console.log('\nSearch results:');
      results.forEach(r => console.log(`  ${r.id}: ${r.title} (${r.year}) - ${r.imdbId}`));
      return;
    }
    
    if (args.includes('--file')) {
      const fileIdx = args.indexOf('--file');
      const filePath = args[fileIdx + 1];
      
      const imdbIdx = args.indexOf('--imdb');
      const titleIdx = args.indexOf('--title');
      const yearIdx = args.indexOf('--year');
      
      if (imdbIdx === -1 || titleIdx === -1 || yearIdx === -1) {
        console.error('Error: --file requires --imdb, --title, and --year');
        process.exit(1);
      }
      
      await importFromFile(
        filePath,
        args[imdbIdx + 1],
        args[titleIdx + 1],
        parseInt(args[yearIdx + 1], 10)
      );
      return;
    }
    
    if (args.includes('--bulk')) {
      const idx = args.indexOf('--bulk');
      const limit = args[idx + 1] ? parseInt(args[idx + 1], 10) : 10;
      await bulkImport(limit);
      return;
    }
    
    // Default: show help
    console.log('Use --help for usage information');
    
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
