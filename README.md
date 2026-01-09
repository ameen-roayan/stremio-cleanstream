# CleanStream - Stremio Addon

**Family-friendly viewing with smart scene skipping**

Skip unwanted scenes (nudity, violence, language, etc.) in movies and TV shows. Community-driven, open-source alternative to VidAngel/ClearPlay.

## Features

- 🎯 **Configurable filters** - Choose what to skip: nudity, violence, language, drugs, fear
- 📊 **Severity levels** - Filter by low/medium/high intensity
- 🤝 **Community contributions** - Add skip timestamps for movies you watch
- 📥 **MCF compatible** - Import/export MovieContentFilter format
- 🗳️ **Voting system** - Upvote accurate timestamps, downvote mistakes
- 🐳 **Docker ready** - One command deployment with PostgreSQL + Redis

## Quick Start

### Local Development (with Docker)

```bash
# Clone the repo
git clone https://github.com/ameen-roayan/stremio-cleanstream.git
cd stremio-cleanstream

# Start everything (app + PostgreSQL + Redis)
docker compose up -d

# View logs
docker compose logs -f cleanstream
```

The addon will be available at `http://localhost:7000`

### Local Development (without Docker)

```bash
npm install
npm run dev
```

This runs with JSON file storage (no database required).

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `7000` |
| `DATABASE_URL` | PostgreSQL connection string | (uses JSON files if not set) |
| `REDIS_URL` | Redis connection string | (caching disabled if not set) |
| `CLEANSTREAM_BASE_URL` | Public URL of the server | `http://localhost:7000` |

### Example

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/cleanstream
REDIS_URL=redis://localhost:6379
CLEANSTREAM_BASE_URL=https://cleanstream.example.com
```

## Database

CleanStream uses PostgreSQL with Prisma ORM:

- **Migrations run automatically** on app startup
- **Multi-replica safe** - Uses PostgreSQL advisory locks
- **Falls back to JSON files** when no DATABASE_URL is set

### Manual Migration Commands

```bash
# Create a new migration (development)
npm run db:migrate:dev -- --name add_new_feature

# Apply migrations (production)
npm run db:migrate

# Open Prisma Studio (GUI)
npm run db:studio
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check (includes DB + Redis status) |
| `/api/filters` | GET | List all available titles |
| `/api/filters/:imdbId` | GET | Get filter data for a title |
| `/api/skips/:imdbId` | GET | Get processed skips with user config |
| `/api/contribute/:imdbId` | POST | Add a new skip segment |
| `/api/vote/:imdbId/:segmentId` | POST | Vote on a segment |
| `/api/stats` | GET | Get contribution statistics |

## Contributing Skip Data

### Via API

```bash
curl -X POST http://localhost:7000/api/contribute/tt0133093 \
  -H "Content-Type: application/json" \
  -d '{
    "startMs": 3600000,
    "endMs": 3660000,
    "category": "violence",
    "severity": "high",
    "comment": "Fight scene in lobby"
  }'
```

### Via CLI

```bash
npm run contribute
```

## Install in Stremio

1. Open Stremio
2. Go to Addons
3. Enter: `http://localhost:7000/manifest.json`
4. Click Install

Or use the deep link:
```
stremio://localhost:7000/manifest.json
```

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Stremio   │────▶│ CleanStream │────▶│ PostgreSQL  │
│   Client    │     │   Addon     │     │             │
└─────────────┘     └──────┬──────┘     └─────────────┘
                          │
                          ▼
                   ┌─────────────┐
                   │    Redis    │
                   │   (Cache)   │
                   └─────────────┘
```

## License

MIT - See [LICENSE](LICENSE)

## Acknowledgments

- [MovieContentFilter](https://www.moviecontentfilter.com/) for the MCF format
- [SponsorBlock](https://sponsor.ajay.app/) for inspiration on community-driven content filtering
- [Stremio](https://stremio.com/) for the addon SDK
