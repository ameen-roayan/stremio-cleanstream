#!/usr/bin/env node
/**
 * CleanStream Contribution CLI
 * Easy way to add skip segments to the database
 * 
 * Usage:
 *   node contribute.js add <imdbId>
 *   node contribute.js import <imdbId> <mcf-file>
 *   node contribute.js list <imdbId>
 *   node contribute.js export <imdbId>
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const db = require('../database');
const { parseMCF, generateMCF, mcfToDBSegments, dbToMCFSegments } = require('../utils/mcf');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

async function addSegment(imdbId) {
  console.log(`\n📝 Adding segment to ${imdbId}\n`);
  
  // Get movie metadata if not exists
  let filterData = db.getFilters(imdbId);
  if (!filterData) {
    console.log('Creating new filter file for this title.');
    const title = await question('Movie/Show title: ');
    const year = await question('Year: ');
    const type = await question('Type (movie/series): ');
    
    filterData = db.createEmptyFilterData(imdbId);
    filterData.title = title;
    filterData.year = parseInt(year);
    filterData.type = type;
    db.saveFilters(imdbId, filterData);
  }
  
  console.log(`\n📺 ${filterData.title} (${filterData.year})\n`);
  
  // Get segment details
  console.log('Enter timestamp in format MM:SS or HH:MM:SS');
  const startTimeStr = await question('Start time: ');
  const endTimeStr = await question('End time: ');
  
  console.log('\nCategories: nudity, sex, violence, language, drugs, fear, discrimination, dispensable, commercial');
  const category = await question('Category: ');
  
  console.log('\nSeverity levels: low, medium, high');
  const severity = await question('Severity: ');
  
  console.log('\nChannels: both, video, audio');
  const channel = await question('Channel (default: both): ') || 'both';
  
  const comment = await question('Comment (optional): ');
  const contributor = await question('Your name (optional): ') || 'cli-contributor';
  
  // Parse timestamps
  const startMs = parseTimeToMs(startTimeStr);
  const endMs = parseTimeToMs(endTimeStr);
  
  if (startMs >= endMs) {
    console.error('❌ End time must be after start time');
    rl.close();
    return;
  }
  
  // Add segment
  const segment = db.addSegment(imdbId, {
    startMs,
    endMs,
    category,
    subcategory: category,
    severity,
    channel,
    comment: comment || null,
    contributor,
  });
  
  console.log(`\n✅ Segment added: ${segment.id}`);
  console.log(`   ${formatMs(startMs)} - ${formatMs(endMs)} | ${category} (${severity})`);
  
  const another = await question('\nAdd another segment? (y/n): ');
  if (another.toLowerCase() === 'y') {
    await addSegment(imdbId);
  }
  
  rl.close();
}

async function importMCF(imdbId, mcfPath) {
  console.log(`\n📥 Importing MCF file for ${imdbId}\n`);
  
  const mcfContent = fs.readFileSync(mcfPath, 'utf8');
  const mcfData = parseMCF(mcfContent);
  const segments = mcfToDBSegments(mcfData.segments);
  
  // Get or create filter data
  let filterData = db.getFilters(imdbId) || db.createEmptyFilterData(imdbId);
  
  // Update metadata
  if (mcfData.metadata) {
    filterData.title = mcfData.metadata.title || filterData.title;
    filterData.year = mcfData.metadata.year || filterData.year;
    filterData.type = mcfData.metadata.type || filterData.type;
  }
  
  // Add segments
  let count = 0;
  for (const seg of segments) {
    db.addSegment(imdbId, {
      ...seg,
      contributor: 'mcf-import',
    });
    count++;
  }
  
  console.log(`✅ Imported ${count} segments from MCF file`);
  rl.close();
}

function listSegments(imdbId) {
  const filterData = db.getFilters(imdbId);
  
  if (!filterData) {
    console.log(`❌ No filter data found for ${imdbId}`);
    return;
  }
  
  console.log(`\n📺 ${filterData.title || imdbId} (${filterData.year || 'N/A'})`);
  console.log(`   Type: ${filterData.type || 'N/A'}`);
  console.log(`   Segments: ${filterData.segments.length}\n`);
  
  if (filterData.segments.length === 0) {
    console.log('   No segments yet.');
    return;
  }
  
  filterData.segments.forEach((seg, i) => {
    console.log(`${i + 1}. [${formatMs(seg.startMs)} - ${formatMs(seg.endMs)}]`);
    console.log(`   ${seg.category} (${seg.severity}) - ${seg.channel}`);
    if (seg.comment) console.log(`   "${seg.comment}"`);
    console.log(`   👍 ${seg.votes?.up || 0} / 👎 ${seg.votes?.down || 0}`);
    console.log('');
  });
  
  rl.close();
}

function exportMCF(imdbId) {
  const filterData = db.getFilters(imdbId);
  
  if (!filterData) {
    console.log(`❌ No filter data found for ${imdbId}`);
    rl.close();
    return;
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
  
  // Output to stdout
  console.log(mcf);
  
  rl.close();
}

function parseTimeToMs(timeStr) {
  const parts = timeStr.split(':').map(Number);
  
  if (parts.length === 2) {
    // MM:SS
    return (parts[0] * 60 + parts[1]) * 1000;
  } else if (parts.length === 3) {
    // HH:MM:SS
    return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  }
  
  return 0;
}

function formatMs(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Main CLI logic
const args = process.argv.slice(2);
const command = args[0];
const imdbId = args[1];

console.log('═══════════════════════════════════════════');
console.log('🎬 CleanStream Contribution CLI');
console.log('═══════════════════════════════════════════');

switch (command) {
  case 'add':
    if (!imdbId) {
      console.log('Usage: node contribute.js add <imdbId>');
      console.log('Example: node contribute.js add tt0120338');
      rl.close();
    } else {
      addSegment(imdbId);
    }
    break;
    
  case 'import':
    const mcfPath = args[2];
    if (!imdbId || !mcfPath) {
      console.log('Usage: node contribute.js import <imdbId> <mcf-file>');
      rl.close();
    } else {
      importMCF(imdbId, mcfPath);
    }
    break;
    
  case 'list':
    if (!imdbId) {
      console.log('Usage: node contribute.js list <imdbId>');
      rl.close();
    } else {
      listSegments(imdbId);
    }
    break;
    
  case 'export':
    if (!imdbId) {
      console.log('Usage: node contribute.js export <imdbId> > output.mcf');
      rl.close();
    } else {
      exportMCF(imdbId);
    }
    break;
    
  default:
    console.log('\nCommands:');
    console.log('  add <imdbId>              - Add a new skip segment interactively');
    console.log('  import <imdbId> <file>    - Import from MCF file');
    console.log('  list <imdbId>             - List all segments');
    console.log('  export <imdbId>           - Export to MCF format');
    console.log('\nExample:');
    console.log('  node contribute.js add tt0120338');
    console.log('  node contribute.js list tt0133093');
    rl.close();
}
