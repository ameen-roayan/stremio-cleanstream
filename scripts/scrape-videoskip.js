#!/usr/bin/env node
/**
 * VideoSkip Exchange Scraper
 * 
 * Scrapes the VideoSkip Exchange website and downloads all available .skp files
 * 
 * Usage:
 *   node scripts/scrape-videoskip.js              # Scrape and download all
 *   node scripts/scrape-videoskip.js --list-only  # Just list available movies
 *   node scripts/scrape-videoskip.js --limit 50   # Limit to 50 movies
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://videoskip.herokuapp.com';
const DOWNLOAD_DIR = './data/videoskip-imports';

// Ensure download directory exists
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

/**
 * Fetch HTML from URL
 */
function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    
    client.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Handle redirect
        const redirectUrl = res.headers.location.startsWith('http') 
          ? res.headers.location 
          : BASE_URL + res.headers.location;
        return fetchHTML(redirectUrl).then(resolve).catch(reject);
      }
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

/**
 * Download file to disk
 */
function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(filepath);
    
    client.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(filepath);
        const redirectUrl = res.headers.location.startsWith('http') 
          ? res.headers.location 
          : BASE_URL + res.headers.location;
        return downloadFile(redirectUrl, filepath).then(resolve).catch(reject);
      }
      
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(filepath);
      });
    }).on('error', (err) => {
      file.close();
      fs.unlinkSync(filepath);
      reject(err);
    });
  });
}

/**
 * Parse movie list from browse page
 */
function parseMovieList(html) {
  const movies = [];
  const lines = html.split('\n');
  
  for (const line of lines) {
    // Match: <a href="/exchange/videos/733/"><b>A Beautiful Life (2023)</b></a>
    const match = line.match(/href="\/exchange\/videos\/(\d+)\/"[^>]*><b>([^<]+)<\/b><\/a>/);
    if (match) {
      const id = match[1];
      let title = match[2].trim();
      
      // Decode HTML entities
      title = title.replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
      
      // Skip series entries
      if (title.includes('(series)')) continue;
      
      // Try to extract year from title like "Movie Name (2023)"
      const yearMatch = title.match(/\((\d{4})\)\s*$/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
      const cleanTitle = yearMatch ? title.replace(/\s*\(\d{4}\)\s*$/, '').trim() : title;
      
      movies.push({
        vsId: id,
        title: cleanTitle,
        year,
        fullTitle: title,
      });
    }
  }
  
  return movies;
}

/**
 * Get IMDB ID and download URL from movie detail page
 */
async function getMovieDetails(vsId) {
  try {
    // Fetch the video page
    const html = await fetchHTML(`${BASE_URL}/exchange/videos/${vsId}/`);
    
    // Look for IMDB link
    const imdbMatch = html.match(/imdb\.com\/title\/(tt\d+)/);
    const imdbId = imdbMatch ? imdbMatch[1] : null;
    
    // Look for TMDB ID
    const tmdbMatch = html.match(/themoviedb\.org\/movie\/(\d+)/);
    const tmdbId = tmdbMatch ? tmdbMatch[1] : null;
    
    // Look for the skip download URL - pattern: /exchange/skip/{skipId}/download/
    const skipMatch = html.match(/\/exchange\/skip\/(\d+)\/download\//);
    let downloadUrl = null;
    
    if (skipMatch) {
      downloadUrl = `${BASE_URL}/exchange/skip/${skipMatch[1]}/download/`;
    } else {
      // Fallback - try to find any skip ID on the page
      const altSkipMatch = html.match(/\/exchange\/skip\/(\d+)\//);
      if (altSkipMatch) {
        downloadUrl = `${BASE_URL}/exchange/skip/${altSkipMatch[1]}/download/`;
      }
    }
    
    return {
      imdbId,
      tmdbId,
      downloadUrl,
    };
  } catch (error) {
    console.error(`Failed to get details for ${vsId}:`, error.message);
    return { imdbId: null, tmdbId: null, downloadUrl: null };
  }
}

/**
 * Scrape all movie pages (A-Z)
 */
async function scrapeAllMovies() {
  const allMovies = [];
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  letters.push('misc'); // For numbers/special characters
  
  console.log('Scraping movie list from VideoSkip Exchange...\n');
  
  for (const letter of letters) {
    process.stdout.write(`Fetching page ${letter}... `);
    
    try {
      const url = `${BASE_URL}/exchange/browsevideos/${letter}/`;
      const html = await fetchHTML(url);
      
      if (!html || html.length < 100) {
        console.log('empty response');
        continue;
      }
      
      const movies = parseMovieList(html);
      allMovies.push(...movies);
      console.log(`found ${movies.length} movies`);
    } catch (error) {
      console.log(`error: ${error.message}`);
    }
    
    // Rate limiting
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Also scrape recent/popular pages
  const extraPages = [
    '/exchange/recent-movie-skips/',
    '/exchange/most-downloaded-movie-skips/',
    '/exchange/recent-uploaded-movie-skips/',
  ];
  
  for (const page of extraPages) {
    try {
      const html = await fetchHTML(BASE_URL + page);
      const movies = parseMovieList(html);
      
      // Add only new movies
      for (const movie of movies) {
        if (!allMovies.find(m => m.vsId === movie.vsId)) {
          allMovies.push(movie);
        }
      }
    } catch (error) {
      // Ignore errors on extra pages
    }
    
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Deduplicate
  const uniqueMovies = [];
  const seen = new Set();
  
  for (const movie of allMovies) {
    if (!seen.has(movie.vsId)) {
      seen.add(movie.vsId);
      uniqueMovies.push(movie);
    }
  }
  
  return uniqueMovies;
}

/**
 * Download skip files for movies
 */
async function downloadSkipFiles(movies, limit = null) {
  const toDownload = limit ? movies.slice(0, limit) : movies;
  const results = [];
  
  console.log(`\nDownloading ${toDownload.length} skip files...\n`);
  
  for (let i = 0; i < toDownload.length; i++) {
    const movie = toDownload[i];
    const progress = `[${i + 1}/${toDownload.length}]`;
    
    process.stdout.write(`${progress} ${movie.fullTitle}... `);
    
    try {
      // Get movie details (IMDB ID, download URL)
      const details = await getMovieDetails(movie.vsId);
      
      // Skip if no download URL found
      if (!details.downloadUrl) {
        console.log('no download URL found');
        continue;
      }
      
      // Create filename
      const safeTitle = movie.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
      const filename = `${movie.vsId}_${safeTitle}${movie.year ? '_' + movie.year : ''}.skp`;
      const filepath = path.join(DOWNLOAD_DIR, filename);
      
      // Download the file
      await downloadFile(details.downloadUrl, filepath);
      
      // Verify file has content and is valid
      const stats = fs.statSync(filepath);
      const content = fs.readFileSync(filepath, 'utf8');
      
      // Check if it's a valid skip file (contains timestamps)
      if (stats.size < 50 || !content.includes('-->')) {
        fs.unlinkSync(filepath);
        console.log('invalid file (no timestamps)');
        continue;
      }
      
      results.push({
        ...movie,
        ...details,
        filepath,
        filesize: stats.size,
      });
      
      console.log(`OK (${details.imdbId || 'no IMDB'})`);
    } catch (error) {
      console.log(`error: ${error.message}`);
    }
    
    // Rate limiting - be nice to their server
    await new Promise(r => setTimeout(r, 1000));
  }
  
  return results;
}

/**
 * Generate import manifest
 */
function generateManifest(results) {
  const manifest = {
    scraped_at: new Date().toISOString(),
    source: 'VideoSkip Exchange',
    source_url: 'https://videoskip.org/exchange/',
    total_files: results.length,
    movies: results.map(r => ({
      videoskip_id: r.vsId,
      title: r.title,
      year: r.year,
      imdb_id: r.imdbId,
      tmdb_id: r.tmdbId,
      filepath: r.filepath,
      filesize: r.filesize,
    })),
  };
  
  const manifestPath = path.join(DOWNLOAD_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  
  return manifestPath;
}

/**
 * Main
 */
async function main() {
  const args = process.argv.slice(2);
  const listOnly = args.includes('--list-only');
  const debug = args.includes('--debug');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;
  
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           VideoSkip Exchange Scraper                       ║');
  console.log('║   Downloads skip files for import into CleanStream         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  // Debug mode - fetch one page and show content
  if (debug) {
    console.log('DEBUG MODE - Fetching page A...\n');
    const html = await fetchHTML(`${BASE_URL}/exchange/browsevideos/A/`);
    console.log('HTML length:', html.length);
    console.log('\n--- First 2000 chars ---\n');
    console.log(html.substring(0, 2000));
    console.log('\n--- Lines containing "videos" ---\n');
    const lines = html.split('\n');
    for (const line of lines) {
      if (line.includes('videos') || line.includes('Videos')) {
        console.log(line.trim().substring(0, 150));
      }
    }
    return;
  }
  
  // Scrape movie list
  const movies = await scrapeAllMovies();
  
  console.log(`\n=== Found ${movies.length} movies with skip files ===\n`);
  
  if (listOnly) {
    // Just print the list
    console.log('ID    | Year | Title');
    console.log('------|------|' + '-'.repeat(50));
    
    for (const movie of movies) {
      console.log(`${movie.vsId.padEnd(5)} | ${(movie.year || '????').toString().padEnd(4)} | ${movie.title}`);
    }
    
    console.log(`\nTotal: ${movies.length} movies`);
    console.log('\nRun without --list-only to download skip files');
    return;
  }
  
  // Download skip files
  const results = await downloadSkipFiles(movies, limit);
  
  // Generate manifest
  const manifestPath = generateManifest(results);
  
  console.log('\n=== Scrape Complete ===');
  console.log(`Downloaded: ${results.length} skip files`);
  console.log(`Location: ${DOWNLOAD_DIR}/`);
  console.log(`Manifest: ${manifestPath}`);
  
  // Print movies with IMDB IDs (ready for import)
  const withImdb = results.filter(r => r.imdbId);
  console.log(`\nReady for import (have IMDB ID): ${withImdb.length} movies`);
  
  if (withImdb.length > 0) {
    console.log('\nTo import into CleanStream database:');
    console.log('  node scripts/import-from-manifest.js');
  }
}

main().catch(err => {
  console.error('\nFatal error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
