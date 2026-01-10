/**
 * Database Repository
 * 
 * Abstraction layer for database operations
 * Supports both PostgreSQL (via Prisma) and fallback JSON storage
 */

const { getClient } = require('./connection');
const jsonDb = require('./jsonStorage');

/**
 * Check if PostgreSQL is available
 */
function isPostgresAvailable() {
  return !!process.env.DATABASE_URL;
}

/**
 * Get or create a title record
 */
async function getOrCreateTitle(imdbId, metadata = {}) {
  if (!isPostgresAvailable()) {
    return jsonDb.getFilters(imdbId) || jsonDb.createEmptyFilterData(imdbId);
  }
  
  const prisma = getClient();
  
  let title = await prisma.title.findUnique({
    where: { imdbId },
    include: {
      segments: {
        orderBy: { startMs: 'asc' },
      },
      releases: true,
    },
  });
  
  if (!title) {
    title = await prisma.title.create({
      data: {
        imdbId,
        title: metadata.title,
        year: metadata.year,
        type: metadata.type,
        runtime: metadata.runtime,
      },
      include: {
        segments: true,
        releases: true,
      },
    });
  }
  
  return title;
}

/**
 * Get filters/segments for a title
 */
async function getFilters(imdbId) {
  if (!isPostgresAvailable()) {
    return jsonDb.getFilters(imdbId);
  }
  
  const prisma = getClient();
  
  const title = await prisma.title.findUnique({
    where: { imdbId },
    include: {
      segments: {
        orderBy: { startMs: 'asc' },
      },
      releases: true,
    },
  });
  
  if (!title) return null;
  
  // Transform to match expected format
  return {
    imdbId: title.imdbId,
    title: title.title,
    year: title.year,
    type: title.type,
    runtime: title.runtime,
    segments: title.segments.map(seg => ({
      id: seg.id,
      startMs: seg.startMs,
      endMs: seg.endMs,
      category: seg.category,
      subcategory: seg.subcategory,
      severity: seg.severity,
      channel: seg.channel,
      comment: seg.comment,
      contributor: seg.contributor,
      votes: { up: seg.upvotes, down: seg.downvotes },
      verified: seg.verified,
      createdAt: seg.createdAt,
    })),
    releases: title.releases,
    createdAt: title.createdAt,
    updatedAt: title.updatedAt,
  };
}

/**
 * Add a segment to a title
 */
async function addSegment(imdbId, segmentData) {
  if (!isPostgresAvailable()) {
    return jsonDb.addSegment(imdbId, segmentData);
  }
  
  const prisma = getClient();
  
  // Ensure title exists
  const title = await getOrCreateTitle(imdbId, {
    title: segmentData.titleName,
    year: segmentData.year,
    type: segmentData.type,
  });
  
  const segment = await prisma.segment.create({
    data: {
      titleId: title.id,
      startMs: segmentData.startMs,
      endMs: segmentData.endMs,
      category: segmentData.category,
      subcategory: segmentData.subcategory || segmentData.category,
      severity: segmentData.severity || 'high',
      channel: segmentData.channel || 'both',
      comment: segmentData.comment,
      contributor: segmentData.contributor || 'anonymous',
      contributorIp: segmentData.contributorIp,
    },
  });
  
  return {
    id: segment.id,
    startMs: segment.startMs,
    endMs: segment.endMs,
    category: segment.category,
    subcategory: segment.subcategory,
    severity: segment.severity,
    channel: segment.channel,
    comment: segment.comment,
    contributor: segment.contributor,
    votes: { up: 0, down: 0 },
    createdAt: segment.createdAt,
  };
}

/**
 * Update title metadata
 */
async function updateTitleMetadata(imdbId, metadata) {
  if (!isPostgresAvailable()) {
    const data = jsonDb.getFilters(imdbId) || jsonDb.createEmptyFilterData(imdbId);
    Object.assign(data, metadata);
    data.updatedAt = new Date().toISOString();
    jsonDb.saveFilters(imdbId, data);
    return data;
  }
  
  const prisma = getClient();
  
  const title = await prisma.title.upsert({
    where: { imdbId },
    update: {
      title: metadata.title,
      year: metadata.year,
      type: metadata.type,
      runtime: metadata.runtime,
    },
    create: {
      imdbId,
      title: metadata.title,
      year: metadata.year,
      type: metadata.type,
      runtime: metadata.runtime,
    },
  });
  
  return title;
}

/**
 * Vote on a segment
 */
async function voteSegment(imdbId, segmentId, voteType, visitorId) {
  if (!isPostgresAvailable()) {
    return jsonDb.voteSegment(imdbId, segmentId, voteType);
  }
  
  const prisma = getClient();
  
  // Check for existing vote
  const existingVote = await prisma.vote.findUnique({
    where: {
      visitorId_segmentId: {
        visitorId,
        segmentId,
      },
    },
  });
  
  if (existingVote) {
    // Already voted
    if (existingVote.voteType === voteType) {
      return { success: false, reason: 'already_voted' };
    }
    
    // Changing vote
    await prisma.$transaction([
      prisma.vote.update({
        where: {
          visitorId_segmentId: { visitorId, segmentId },
        },
        data: { voteType },
      }),
      prisma.segment.update({
        where: { id: segmentId },
        data: {
          upvotes: voteType === 'up' ? { increment: 1 } : { decrement: 1 },
          downvotes: voteType === 'down' ? { increment: 1 } : { decrement: 1 },
        },
      }),
    ]);
    
    return { success: true, changed: true };
  }
  
  // New vote
  await prisma.$transaction([
    prisma.vote.create({
      data: {
        visitorId,
        segmentId,
        voteType,
      },
    }),
    prisma.segment.update({
      where: { id: segmentId },
      data: {
        [voteType === 'up' ? 'upvotes' : 'downvotes']: { increment: 1 },
      },
    }),
  ]);
  
  return { success: true };
}

/**
 * Delete a segment
 */
async function deleteSegment(segmentId) {
  if (!isPostgresAvailable()) {
    // Not implemented for JSON storage
    return false;
  }
  
  const prisma = getClient();
  
  await prisma.segment.delete({
    where: { id: segmentId },
  });
  
  return true;
}

/**
 * Verify a segment (admin function)
 */
async function verifySegment(segmentId, verifiedBy) {
  if (!isPostgresAvailable()) {
    return false;
  }
  
  const prisma = getClient();
  
  await prisma.segment.update({
    where: { id: segmentId },
    data: {
      verified: true,
      verifiedBy,
      verifiedAt: new Date(),
    },
  });
  
  return true;
}

/**
 * Get statistics
 */
async function getStats() {
  if (!isPostgresAvailable()) {
    return jsonDb.getStats();
  }
  
  const prisma = getClient();
  
  const [titleCount, segmentCount, verifiedCount] = await Promise.all([
    prisma.title.count(),
    prisma.segment.count(),
    prisma.segment.count({ where: { verified: true } }),
  ]);
  
  return {
    totalTitles: titleCount,
    totalSegments: segmentCount,
    verifiedSegments: verifiedCount,
  };
}

/**
 * List all titles with filters
 */
async function listTitles(options = {}) {
  if (!isPostgresAvailable()) {
    const ids = jsonDb.listAllFilters();
    return ids.map(id => ({ imdbId: id }));
  }
  
  const prisma = getClient();
  const { limit = 100, offset = 0, hasSegments = true, sortBy = 'recent' } = options;
  
  // Determine orderBy based on sortBy
  let orderBy;
  switch (sortBy) {
    case 'popular':
      // Sort by segment count (most skips first)
      orderBy = { segments: { _count: 'desc' } };
      break;
    case 'year':
      // Sort by release year (newest first)
      orderBy = { year: 'desc' };
      break;
    case 'title':
      // Sort alphabetically
      orderBy = { title: 'asc' };
      break;
    case 'recent':
    default:
      // Sort by recently added/updated
      orderBy = { updatedAt: 'desc' };
      break;
  }
  
  const titles = await prisma.title.findMany({
    where: hasSegments ? {
      segments: { some: {} },
    } : undefined,
    take: limit,
    skip: offset,
    orderBy: orderBy,
    include: {
      _count: {
        select: { segments: true },
      },
    },
  });
  
  return titles.map(t => ({
    imdbId: t.imdbId,
    title: t.title,
    year: t.year,
    type: t.type,
    segmentCount: t._count.segments,
  }));
}

/**
 * Search titles
 */
async function searchTitles(query) {
  if (!isPostgresAvailable()) {
    // Basic search for JSON storage
    const ids = jsonDb.listAllFilters();
    return ids.filter(id => id.includes(query)).map(id => ({ imdbId: id }));
  }
  
  const prisma = getClient();
  
  const titles = await prisma.title.findMany({
    where: {
      OR: [
        { imdbId: { contains: query, mode: 'insensitive' } },
        { title: { contains: query, mode: 'insensitive' } },
      ],
    },
    take: 20,
    include: {
      _count: {
        select: { segments: true },
      },
    },
  });
  
  return titles;
}

/**
 * Bulk import segments (for MCF imports)
 */
async function bulkImportSegments(imdbId, segments, metadata = {}) {
  if (!isPostgresAvailable()) {
    // Fall back to individual inserts for JSON
    for (const seg of segments) {
      jsonDb.addSegment(imdbId, seg);
    }
    return { imported: segments.length };
  }
  
  const prisma = getClient();
  
  // Ensure title exists
  const title = await getOrCreateTitle(imdbId, metadata);
  
  // Bulk create segments
  const result = await prisma.segment.createMany({
    data: segments.map(seg => ({
      titleId: title.id,
      startMs: seg.startMs,
      endMs: seg.endMs,
      category: seg.category,
      subcategory: seg.subcategory || seg.category,
      severity: seg.severity || 'high',
      channel: seg.channel || 'both',
      comment: seg.comment,
      contributor: seg.contributor || 'bulk-import',
    })),
    skipDuplicates: true,
  });
  
  return { imported: result.count };
}

module.exports = {
  isPostgresAvailable,
  getOrCreateTitle,
  getFilters,
  addSegment,
  updateTitleMetadata,
  voteSegment,
  deleteSegment,
  verifySegment,
  getStats,
  listTitles,
  searchTitles,
  bulkImportSegments,
};
