#!/usr/bin/env node
/**
 * CleanStream - Stremio Addon Server
 * Family-friendly viewing with smart scene skipping
 * 
 * Usage:
 *   npm start                  - Start the server
 *   npm start -- --install     - Install to local Stremio
 * 
 * Environment Variables:
 *   DATABASE_URL    - PostgreSQL connection string (optional, falls back to JSON)
 *   PORT            - Server port (default: 7000)
 *   CLEANSTREAM_BASE_URL - Public URL of the server
 */

const { serveHTTP, getRouter } = require('stremio-addon-sdk');
const cors = require('cors');
const express = require('express');

const { builder, manifest } = require('./addon/manifest');
const { subtitlesHandler } = require('./addon/subtitlesHandler');
const { catalogHandler } = require('./addon/catalogHandler');
const apiRoutes = require('./api/routes');
const db = require('./database');
const cache = require('./cache');

// Configuration
const PORT = process.env.PORT || 7000;
const BASE_URL = process.env.CLEANSTREAM_BASE_URL || `http://localhost:${PORT}`;

// Register the catalog handler
builder.defineCatalogHandler(catalogHandler);

// Register the subtitles handler
builder.defineSubtitlesHandler(subtitlesHandler);

// Get the addon interface
const addonInterface = builder.getInterface();

// Create Express app
const app = express();

// Enable CORS for all routes
app.use(cors());

// Redirect root to configure page
app.get('/', (req, res) => {
  res.redirect('/configure');
});

// Mount API routes
app.use('/api', apiRoutes);

// Serve a simple configuration page
app.get('/configure', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CleanStream - Configure</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #fff;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
    }
    .container { max-width: 600px; margin: 0 auto; }
    h1 { text-align: center; margin-bottom: 10px; }
    .subtitle { text-align: center; color: #8892b0; margin-bottom: 30px; }
    .card {
      background: rgba(255,255,255,0.05);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .filter-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .filter-row:last-child { border-bottom: none; }
    .filter-label { font-weight: 500; }
    .filter-desc { font-size: 0.85em; color: #8892b0; }
    select {
      background: rgba(255,255,255,0.1);
      color: #fff;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 14px;
      cursor: pointer;
    }
    .install-btn {
      display: block;
      width: 100%;
      padding: 15px;
      background: #64ffda;
      color: #1a1a2e;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      text-align: center;
      text-decoration: none;
      margin-top: 20px;
    }
    .install-btn:hover { background: #4fd1c5; }
    .note {
      text-align: center;
      font-size: 0.85em;
      color: #8892b0;
      margin-top: 20px;
    }
    .stats { text-align: center; margin-bottom: 30px; }
    .stats span {
      display: inline-block;
      padding: 8px 16px;
      background: rgba(100, 255, 218, 0.1);
      border-radius: 20px;
      margin: 0 5px;
      font-size: 0.9em;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎬 CleanStream</h1>
    <p class="subtitle">Family-friendly viewing with smart scene skipping</p>
    
    <div class="stats" id="stats">Loading stats...</div>
    
    <div class="card">
      <h3>Filter Settings</h3>
      <p style="color: #8892b0; font-size: 0.9em;">Choose what content you want to skip. Higher settings skip more content.</p>
      
      <div class="filter-row">
        <div>
          <div class="filter-label">🔞 Nudity</div>
          <div class="filter-desc">Bare skin, nudity</div>
        </div>
        <select id="nudity">
          <option value="off">Off</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high" selected>High (all)</option>
        </select>
      </div>
      
      <div class="filter-row">
        <div>
          <div class="filter-label">💋 Sexual Content</div>
          <div class="filter-desc">Sexual scenes, intimacy</div>
        </div>
        <select id="sex">
          <option value="off">Off</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high" selected>High (all)</option>
        </select>
      </div>
      
      <div class="filter-row">
        <div>
          <div class="filter-label">⚔️ Violence</div>
          <div class="filter-desc">Fighting, blood, gore</div>
        </div>
        <select id="violence">
          <option value="off">Off</option>
          <option value="low">Low</option>
          <option value="medium" selected>Medium</option>
          <option value="high">High (all)</option>
        </select>
      </div>
      
      <div class="filter-row">
        <div>
          <div class="filter-label">🤬 Language</div>
          <div class="filter-desc">Profanity, slurs</div>
        </div>
        <select id="language">
          <option value="off" selected>Off</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High (all)</option>
        </select>
      </div>
      
      <div class="filter-row">
        <div>
          <div class="filter-label">💊 Drugs</div>
          <div class="filter-desc">Drug/alcohol use</div>
        </div>
        <select id="drugs">
          <option value="off" selected>Off</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High (all)</option>
        </select>
      </div>
      
      <div class="filter-row">
        <div>
          <div class="filter-label">👻 Frightening</div>
          <div class="filter-desc">Scary scenes, jumpscares</div>
        </div>
        <select id="fear">
          <option value="off" selected>Off</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High (all)</option>
        </select>
      </div>
    </div>
    
    <a id="installBtn" class="install-btn" href="#">
      📥 Install in Stremio Desktop
    </a>
    
    <a id="webBtn" class="install-btn" href="#" style="background: #3498db; margin-top: 10px;">
      🌐 Open in Stremio Web
    </a>
    
    <div class="manifest-url" style="margin-top: 20px;">
      <label style="font-size: 0.9em; color: #8892b0;">Manifest URL (copy for manual install):</label>
      <div style="display: flex; gap: 8px; margin-top: 8px;">
        <input type="text" id="manifestUrl" readonly style="flex: 1; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 10px; border-radius: 6px; font-family: monospace; font-size: 0.85em;">
        <button onclick="copyManifest()" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 10px 16px; border-radius: 6px; cursor: pointer;">📋 Copy</button>
      </div>
    </div>
    
    <p class="note">
      Works on Desktop, Android, iOS, and Web.
    </p>
    
    <div class="card" style="margin-top: 30px;">
      <h3>🤝 Contribute</h3>
      <p style="color: #8892b0; font-size: 0.9em;">
        Help make more movies family-friendly! You can contribute skip data via our API.
      </p>
      <p style="font-family: monospace; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 6px; font-size: 0.85em;">
        POST ${BASE_URL}/api/contribute/{imdbId}
      </p>
    </div>
  </div>
  
  <script>
    const BASE_URL = '${BASE_URL}';
    
    // Load stats
    fetch('/api/stats')
      .then(r => r.json())
      .then(stats => {
        document.getElementById('stats').innerHTML = 
          '<span>🎬 ' + stats.totalMovies + ' titles</span>' +
          '<span>⏭️ ' + stats.totalSegments + ' skips</span>';
      })
      .catch(() => {
        document.getElementById('stats').innerHTML = '<span>Community-driven filters</span>';
      });
    
    // Generate install URL with config
    function updateInstallUrl() {
      const config = {
        nudity: document.getElementById('nudity').value,
        sex: document.getElementById('sex').value,
        violence: document.getElementById('violence').value,
        language: document.getElementById('language').value,
        drugs: document.getElementById('drugs').value,
        fear: document.getElementById('fear').value,
      };
      
      // Encode config into the manifest URL
      const configStr = encodeURIComponent(JSON.stringify(config));
      const manifestUrl = BASE_URL + '/' + configStr + '/manifest.json';
      const installUrl = 'stremio://' + manifestUrl.replace(/^https?:\\/\\//, '');
      const webUrl = 'https://web.stremio.com/#/addons?addon=' + encodeURIComponent(manifestUrl);
      
      document.getElementById('installBtn').href = installUrl;
      document.getElementById('webBtn').href = webUrl;
      document.getElementById('manifestUrl').value = manifestUrl;
    }
    
    function copyManifest() {
      const input = document.getElementById('manifestUrl');
      input.select();
      document.execCommand('copy');
      
      const btn = event.target;
      btn.textContent = '✓ Copied!';
      setTimeout(() => btn.textContent = '📋 Copy', 1500);
    }
    
    // Update on any change
    document.querySelectorAll('select').forEach(sel => {
      sel.addEventListener('change', updateInstallUrl);
    });
    
    // Initial update
    updateInstallUrl();
  </script>
</body>
</html>
  `);
});

// Mount the Stremio addon router
// Handle configuration in URL (e.g., /{"nudity":"high"}/manifest.json)
app.get('/:config/manifest.json', (req, res) => {
  try {
    const config = JSON.parse(decodeURIComponent(req.params.config));
    // Return manifest with embedded config hint
    res.json({
      ...manifest,
      behaviorHints: {
        ...manifest.behaviorHints,
        // Store user config for use in handlers
        userConfig: config,
      },
    });
  } catch (e) {
    res.json(manifest);
  }
});

// Mount Stremio SDK router for all other addon routes
app.use(getRouter(addonInterface));

// Start server
async function startServer() {
  // Initialize database (runs migrations if DATABASE_URL is set)
  const dbInitialized = await db.initialize();
  
  if (dbInitialized) {
    console.log('✅ PostgreSQL connected and migrations applied');
  } else if (process.env.DATABASE_URL) {
    console.warn('⚠️  DATABASE_URL set but connection failed, check your database');
  } else {
    console.log('ℹ️  No DATABASE_URL set, using JSON file storage');
  }

  // Initialize Redis cache
  const cacheInitialized = await cache.initialize();
  
  if (cacheInitialized) {
    console.log('✅ Redis cache connected');
  } else if (process.env.REDIS_URL) {
    console.warn('⚠️  REDIS_URL set but connection failed, caching disabled');
  } else {
    console.log('ℹ️  No REDIS_URL set, caching disabled');
  }

  app.listen(PORT, () => {
    console.log('');
    console.log('🎬 CleanStream - Stremio Addon');
    console.log('═══════════════════════════════════════════');
    console.log(`✅ Server running at: ${BASE_URL}`);
    console.log(`📦 Addon manifest:    ${BASE_URL}/manifest.json`);
    console.log(`⚙️  Configure:         ${BASE_URL}/configure`);
    console.log(`📊 API endpoint:      ${BASE_URL}/api`);
    console.log(`💾 Storage:           ${dbInitialized ? 'PostgreSQL' : 'JSON files'}`);
    console.log(`⚡ Cache:             ${cacheInitialized ? 'Redis' : 'disabled'}`);
    console.log('');
    console.log('📥 Install in Stremio:');
    console.log(`   stremio://${BASE_URL.replace(/^https?:\/\//, '')}/manifest.json`);
    console.log('');
    console.log('🤝 Contribute skip data:');
    console.log(`   POST ${BASE_URL}/api/contribute/{imdbId}`);
    console.log('');
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  await cache.disconnect();
  await db.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  await cache.disconnect();
  await db.disconnect();
  process.exit(0);
});

// Start the server
startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

module.exports = app;
