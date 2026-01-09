/**
 * Database Seed Script
 * Imports sample filter data into PostgreSQL
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const sampleData = [
  {
    imdbId: 'tt0133093',
    title: 'The Matrix',
    year: 1999,
    type: 'movie',
    segments: [
      {
        startMs: 2700000,
        endMs: 2760000,
        category: 'violence',
        severity: 'high',
        channel: 'both',
        comment: 'Lobby shootout scene - intense gunfire and combat',
      },
      {
        startMs: 6300000,
        endMs: 6420000,
        category: 'violence',
        severity: 'high',
        channel: 'both',
        comment: 'Subway fight scene - martial arts combat',
      },
      {
        startMs: 7200000,
        endMs: 7320000,
        category: 'violence',
        severity: 'medium',
        channel: 'both',
        comment: 'Helicopter rescue scene - action violence',
      },
    ],
  },
  {
    imdbId: 'tt0120338',
    title: 'Titanic',
    year: 1997,
    type: 'movie',
    segments: [
      {
        startMs: 3720000,
        endMs: 3780000,
        category: 'nudity',
        severity: 'high',
        channel: 'video',
        comment: 'Drawing scene - artistic nudity',
      },
      {
        startMs: 4200000,
        endMs: 4320000,
        category: 'sex',
        severity: 'medium',
        channel: 'both',
        comment: 'Car scene - implied sexual content',
      },
      {
        startMs: 9000000,
        endMs: 9600000,
        category: 'fear',
        severity: 'high',
        channel: 'both',
        comment: 'Ship sinking - intense disaster scenes',
      },
      {
        startMs: 10200000,
        endMs: 10500000,
        category: 'violence',
        severity: 'medium',
        channel: 'both',
        comment: 'People falling from ship - disturbing imagery',
      },
    ],
  },
];

async function seed() {
  console.log('Seeding database...');

  for (const data of sampleData) {
    // Create or update title
    const title = await prisma.title.upsert({
      where: { imdbId: data.imdbId },
      update: {
        title: data.title,
        year: data.year,
        type: data.type,
      },
      create: {
        imdbId: data.imdbId,
        title: data.title,
        year: data.year,
        type: data.type,
      },
    });

    console.log(`Created/updated title: ${data.title} (${data.imdbId})`);

    // Delete existing segments for this title
    await prisma.segment.deleteMany({
      where: { titleId: title.id },
    });

    // Create segments
    for (const seg of data.segments) {
      await prisma.segment.create({
        data: {
          titleId: title.id,
          startMs: seg.startMs,
          endMs: seg.endMs,
          category: seg.category,
          subcategory: seg.category,
          severity: seg.severity,
          channel: seg.channel,
          comment: seg.comment,
          contributor: 'seed',
        },
      });
    }

    console.log(`  Added ${data.segments.length} segments`);
  }

  console.log('Seeding complete!');
}

seed()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
