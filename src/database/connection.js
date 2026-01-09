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
};
