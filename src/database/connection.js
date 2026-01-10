/**
 * Database Connection & Migration Handler
 * 
 * Uses Prisma for:
 * - Type-safe database access
 * - Automatic migrations with advisory locks (safe for multi-replica)
 * - Connection pooling
 */

const { PrismaClient } = require('@prisma/client');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);

// Singleton Prisma client
let prisma = null;

/**
 * Get the Prisma client instance
 */
function getClient() {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' 
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
    });
  }
  return prisma;
}

/**
 * Run database migrations
 * Prisma uses advisory locks internally, making this safe for multi-replica deployments
 * 
 * @returns {Promise<boolean>} Success status
 */
async function runMigrations() {
  console.log('[Database] Running migrations...');
  
  try {
    // Prisma migrate deploy is safe for production and handles concurrent deployments
    // It uses PostgreSQL advisory locks to prevent race conditions
    const { stdout, stderr } = await execAsync('npx prisma migrate deploy', {
      env: { ...process.env },
      timeout: 60000, // 60 second timeout
    });
    
    if (stdout) console.log('[Database] Migration output:', stdout);
    if (stderr && !stderr.includes('Already in sync')) {
      console.warn('[Database] Migration warnings:', stderr);
    }
    
    console.log('[Database] Migrations complete');
    return true;
  } catch (error) {
    // Check if it's just "already in sync" which is fine
    if (error.stderr && error.stderr.includes('Already in sync')) {
      console.log('[Database] Already in sync, no migrations needed');
      return true;
    }
    
    console.error('[Database] Migration failed:', error.message);
    
    // In multi-replica setup, another replica might be running migrations
    // Wait and retry once
    if (error.message.includes('lock') || error.message.includes('concurrent')) {
      console.log('[Database] Lock detected, waiting for other replica...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      try {
        await execAsync('npx prisma migrate deploy', {
          env: { ...process.env },
          timeout: 60000,
        });
        console.log('[Database] Retry successful');
        return true;
      } catch (retryError) {
        console.error('[Database] Retry failed:', retryError.message);
        return false;
      }
    }
    
    return false;
  }
}

/**
 * Generate Prisma client (for development)
 */
async function generateClient() {
  try {
    await execAsync('npx prisma generate');
    console.log('[Database] Prisma client generated');
    return true;
  } catch (error) {
    console.error('[Database] Failed to generate client:', error.message);
    return false;
  }
}

/**
 * Auto-seed database if empty
 * Only seeds if there are no titles in the database and seed-data.json exists
 */
async function autoSeed() {
  const client = getClient();
  
  try {
    // Check if database already has data
    const titleCount = await client.title.count();
    if (titleCount > 0) {
      console.log(`[Database] Database already has ${titleCount} titles, skipping seed`);
      return true;
    }
    
    // Check if seed file exists
    const seedFile = path.join(process.cwd(), 'data', 'seed-data.json');
    if (!fs.existsSync(seedFile)) {
      console.log('[Database] No seed-data.json found, skipping seed');
      return true;
    }
    
    console.log('[Database] Database is empty, auto-seeding from seed-data.json...');
    
    const data = JSON.parse(fs.readFileSync(seedFile, 'utf-8'));
    console.log(`[Database] Found ${data.length} titles to import`);
    
    let importedTitles = 0;
    let importedSegments = 0;
    
    for (const t of data) {
      if (!t.imdbId) continue;
      
      const title = await client.title.upsert({
        where: { imdbId: t.imdbId },
        update: { title: t.title, year: t.year },
        create: { 
          imdbId: t.imdbId, 
          title: t.title, 
          year: t.year, 
          type: t.type || 'movie' 
        }
      });
      
      for (const s of t.segments || []) {
        await client.segment.create({
          data: {
            titleId: title.id,
            startMs: s.startMs,
            endMs: s.endMs,
            category: s.category,
            severity: s.severity,
            subcategory: s.subcategory || s.category,
            comment: s.comment,
            contributor: s.contributor || 'videoskip'
          }
        });
        importedSegments++;
      }
      
      importedTitles++;
      if (importedTitles % 50 === 0) {
        console.log(`[Database] Imported ${importedTitles} titles...`);
      }
    }
    
    console.log(`[Database] Seed complete: ${importedTitles} titles, ${importedSegments} segments`);
    return true;
  } catch (error) {
    console.error('[Database] Auto-seed failed:', error.message);
    return false;
  }
}

/**
 * Initialize database connection and run migrations
 */
async function initialize() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.warn('[Database] DATABASE_URL not set, using fallback JSON storage');
    return false;
  }
  
  console.log('[Database] Initializing PostgreSQL connection...');
  
  // Run migrations first
  const migrated = await runMigrations();
  if (!migrated) {
    console.error('[Database] Failed to run migrations, app may not function correctly');
  }
  
  // Connect client
  const client = getClient();
  
  try {
    await client.$connect();
    console.log('[Database] Connected to PostgreSQL');
    
    // Auto-seed if database is empty
    await autoSeed();
    
    return true;
  } catch (error) {
    console.error('[Database] Connection failed:', error.message);
    return false;
  }
}

/**
 * Graceful shutdown
 */
async function disconnect() {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
    console.log('[Database] Disconnected from PostgreSQL');
  }
}

/**
 * Health check
 */
async function healthCheck() {
  try {
    const client = getClient();
    await client.$queryRaw`SELECT 1`;
    return { status: 'healthy', type: 'postgresql' };
  } catch (error) {
    return { status: 'unhealthy', type: 'postgresql', error: error.message };
  }
}

module.exports = {
  getClient,
  initialize,
  disconnect,
  runMigrations,
  generateClient,
  healthCheck,
  autoSeed,
};
