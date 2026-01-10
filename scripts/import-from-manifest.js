#!/usr/bin/env node
/**
 * Import from VideoSkip Manifest
 * 
 * Imports downloaded .skp files into the CleanStream database
 * Uses the manifest.json created by scrape-videoskip.js
 * 
 * Usage:
 *   node scripts/import-from-manifest.js                    # Import all
 *   node scripts/import-from-manifest.js --limit 10         # Import first 10
 *   node scripts/import-from-manifest.js --dry-run          # Show what would be imported
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const MANIFEST_PATH = './data/videoskip-imports/manifest.json';

// Category mapping
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
  'immodesty': 'nudity',
  'sensuality': 'sex',
  'disturbing': 'fear',
};

const SEVERITY_MAP = {
  '1': 'low',
  '2': 'medium',
  '3': 'high',
};

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
 * Parse timestamp to milliseconds
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
 * Parse .skp file content
 */
function parseSkpFile(content) {
  const segments = [];
  const lines = content.split('\n');
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    
    // Look for timestamp line with arrow: "0:47:26.35 --> 0:49:43.39"
    const timeMatch = line.match(/^(\d+:[\d:.]+)\s*-->\s*(\d+:[\d:.]+)$/);
    
    if (timeMatch) {
      const startTime = parseTimestamp(timeMatch[1]);
      const endTime = parseTimestamp(timeMatch[2]);
      
      // Next non-empty line should be the category/description
      i++;
      while (i < lines.length && lines[i].trim() === '') i++;
      
      if (i < lines.length) {
        const descLine = lines[i].trim();
        
        // Skip if it's JSON metadata or base64 image
        if (!descLine.startsWith('{') && !descLine.startsWith('data:')) {
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
 * Parse description line
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
  
  const words = line.toLowerCase().split(/\s+/);
  
  for (const word of words) {
    if (CATEGORY_MAP[word]) {
      result.category = CATEGORY_MAP[word];
    }
    if (SEVERITY_MAP[word]) {
      result.severity = SEVERITY_MAP[word];
    }
    if (CHANNEL_MAP[word]) {
      result.channel = CHANNEL_MAP[word];
    }
  }
  
  // Try to infer category from comment if not found
  if (!result.category && result.comment) {
    const commentLower = result.comment.toLowerCase();
    for (const [key, value] of Object.entries(CATEGORY_MAP)) {
      if (commentLower.includes(key)) {
        result.category = value;
        break;
      }
    }
  }
  
  return result;
}

/**
 * Import a single movie
 */
async function importMovie(movie, dryRun = false) {
  if (!movie.imdb_id) {
    return { status: 'skipped', reason: 'no IMDB ID' };
  }
  
  // Normalize path separators for cross-platform compatibility
  const filepath = movie.filepath.replace(/\\/g, '/');
  
  if (!fs.existsSync(filepath)) {
    return { status: 'skipped', reason: 'file not found' };
  }
  
  const content = fs.readFileSync(filepath, 'utf-8');
  const segments = parseSkpFile(content);
  
  if (segments.length === 0) {
    return { status: 'skipped', reason: 'no valid segments' };
  }
  
  if (dryRun) {
    return { status: 'would_import', segments: segments.length };
  }
  
  // Create or update title
  const dbTitle = await prisma.title.upsert({
    where: { imdbId: movie.imdb_id },
    update: {
      title: movie.title,
      year: movie.year,
    },
    create: {
      imdbId: movie.imdb_id,
      title: movie.title,
      year: movie.year,
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
    
    // Check for duplicate
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
  
  return { status: 'imported', imported, skipped };
}

/**
 * Main
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;
  
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         Import VideoSkip Data into CleanStream             ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  if (dryRun) {
    console.log('=== DRY RUN MODE - No changes will be made ===\n');
  }
  
  // Load manifest
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`Manifest not found: ${MANIFEST_PATH}`);
    console.error('Run scrape-videoskip.js first to download skip files.');
    process.exit(1);
  }
  
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  console.log(`Manifest: ${manifest.total_files} movies from ${manifest.source}`);
  console.log(`Scraped: ${manifest.scraped_at}\n`);
  
  // Filter movies with IMDB IDs
  let movies = manifest.movies.filter(m => m.imdb_id);
  console.log(`Movies with IMDB ID: ${movies.length}`);
  
  if (limit) {
    movies = movies.slice(0, limit);
    console.log(`Limited to: ${limit}`);
  }
  
  console.log('\n--- Starting Import ---\n');
  
  const stats = {
    imported: 0,
    skipped: 0,
    failed: 0,
    totalSegments: 0,
  };
  
  for (let i = 0; i < movies.length; i++) {
    const movie = movies[i];
    const progress = `[${i + 1}/${movies.length}]`;
    
    process.stdout.write(`${progress} ${movie.title} (${movie.imdb_id})... `);
    
    try {
      const result = await importMovie(movie, dryRun);
      
      if (result.status === 'imported') {
        stats.imported++;
        stats.totalSegments += result.imported;
        console.log(`✓ ${result.imported} segments`);
      } else if (result.status === 'would_import') {
        stats.imported++;
        stats.totalSegments += result.segments;
        console.log(`would import ${result.segments} segments`);
      } else {
        stats.skipped++;
        console.log(`skipped (${result.reason})`);
      }
    } catch (error) {
      stats.failed++;
      console.log(`✗ error: ${error.message}`);
    }
  }
  
  console.log('\n=== Import Complete ===');
  console.log(`Imported: ${stats.imported} movies`);
  console.log(`Skipped: ${stats.skipped} movies`);
  console.log(`Failed: ${stats.failed} movies`);
  console.log(`Total segments: ${stats.totalSegments}`);
  
  await prisma.$disconnect();
}

main().catch(console.error);
