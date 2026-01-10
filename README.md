# CleanStream - Stremio Addon

**Family-friendly viewing with smart scene skipping**

Skip unwanted scenes (nudity, violence, language, etc.) in movies and TV shows. Community-driven, open-source alternative to VidAngel/ClearPlay.

## 🚀 Quick Install

### Public Instance (Recommended)

**https://cleanstream.elfhosted.com**

1. Visit https://cleanstream.elfhosted.com/configure
2. Choose your filter settings
3. Click "Install in Stremio Desktop" or "Open in Stremio Web"

Or add directly in Stremio:
```
https://cleanstream.elfhosted.com/manifest.json
```

### Self-Hosted

See [Self-Hosting](#self-hosting) below.

## ⚠️ Current Status

**Working now:** Shows on-screen warnings before scenes you want to skip, telling you when to manually skip.

**Coming soon:** Auto-skip functionality via browser extension.

## Features

- 🎯 **Configurable filters** - Choose what to skip: nudity, violence, language, drugs, fear
- 📊 **Severity levels** - Filter by low/medium/high intensity
- 📚 **"CleanStream Ready" Catalog** - Browse movies with skip data in Stremio's Discover section
- 🎬 **376+ movies** - Pre-loaded with skip data from VideoSkip
- 🤝 **Community contributions** - Add skip timestamps for movies you watch
- 📥 **MCF compatible** - Import/export MovieContentFilter format
- 🗳️ **Voting system** - Upvote accurate timestamps, downvote mistakes
- 🐳 **Docker ready** - One command deployment with PostgreSQL + Redis

## How It Works

1. **Install the addon** from [cleanstream.elfhosted.com](https://cleanstream.elfhosted.com)
2. **Browse the catalog** - In Stremio's Discover section, look for **"CleanStream Ready"** to see movies with skip data
3. **Play a movie** - Select any movie and find a stream
4. **Enable skip subtitles** - Go to subtitles (CC) and select **"CleanStream (X skips)"**
5. **Watch for warnings** - You'll see on-screen alerts before scenes to skip

## Self-Hosting

### Docker (Recommended)

```bash
# Clone the repo
git clone https://github.com/ameen-roayan/stremio-cleanstream.git
cd stremio-cleanstream

# Start everything (app + PostgreSQL + Redis)
docker compose up -d

# Seed the database with VideoSkip data
docker exec cleanstream npx prisma db seed

# View logs
docker compose logs -f cleanstream
```

The addon will be available at `http://localhost:7000`

### Without Docker

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

### Public Instance
1. Open Stremio
2. Go to Addons
3. Enter: `https://cleanstream.elfhosted.com/manifest.json`
4. Click Install

Or visit https://cleanstream.elfhosted.com/configure for a guided setup.

### Self-Hosted
1. Open Stremio
2. Go to Addons
3. Enter: `http://localhost:7000/manifest.json`
4. Click Install

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

## Credits & Data Sources

- **[VideoSkip](https://videoskip.org)** - Initial skip timestamp data. Thanks to Francisco Ruiz and the VideoSkip community for building an amazing open database of skip timestamps.
- [MovieContentFilter](https://www.moviecontentfilter.com/) - MCF format specification
- [SponsorBlock](https://sponsor.ajay.app/) - Inspiration for community-driven content filtering
- [Stremio](https://stremio.com/) - Addon SDK
- [ElfHosted](https://elfhosted.com/) - Hosting infrastructure
