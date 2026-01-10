# 🎬 CleanStream

**Family-friendly viewing for Stremio** - Skip nudity, violence, and other unwanted scenes automatically.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

## What is CleanStream?

CleanStream is a free, open-source Stremio addon that helps you watch movies and TV shows with your family by automatically marking scenes you might want to skip. It's community-driven - anyone can contribute skip data for any movie or show.

**Key Features:**
- 🎯 **Customizable filters** - Choose what to skip: nudity, violence, language, drugs, and more
- 📊 **Severity levels** - Fine-tune how sensitive your filters are (low/medium/high)
- 🤝 **Community-driven** - Everyone can contribute skip timestamps
- 🆓 **Free forever** - No subscriptions, no ads, no tracking
- 📱 **Works everywhere** - Desktop, Android, iOS, Web

## Quick Start

### 1. Install the Addon

**From Web:**
1. Go to https://your-cleanstream-server.com/configure
2. Adjust your filter settings
3. Click "Install in Stremio"

**Manual Install:**
Add this URL in Stremio's addon section:
```
https://your-cleanstream-server.com/manifest.json
```

### 2. Watch Movies

1. Open any movie/show in Stremio
2. Look for the "CleanStream" subtitle track
3. Select it to see skip suggestions
4. Press → to skip flagged scenes

## Self-Hosting

### Docker (Recommended)

```bash
docker run -d \
  --name cleanstream \
  -p 7000:7000 \
  -v cleanstream-data:/app/data \
  -e CLEANSTREAM_BASE_URL=https://your-domain.com \
  cleanstream/cleanstream-stremio
```

### Manual Installation

```bash
# Clone the repository
git clone https://github.com/cleanstream/cleanstream-stremio.git
cd cleanstream-stremio

# Install dependencies
npm install

# Start the server
npm start
```

The server will start at `http://localhost:7000`

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `7000` | Server port |
| `CLEANSTREAM_BASE_URL` | `http://localhost:7000` | Public URL of your server |
| `CLEANSTREAM_DATA_DIR` | `./data/filters` | Where to store filter data |

## API Reference

### Get Skip Data

```bash
# Get skips with default settings
GET /api/skips/tt0120338

# Get skips with custom settings
GET /api/skips/tt0120338?nudity=high&violence=medium

# Get as VTT subtitle
GET /api/skips/tt0120338/vtt

# Get as JSON
GET /api/skips/tt0120338/json

# Get as MCF format
GET /api/skips/tt0120338/mcf
```

### Contribute Skip Data

```bash
# Add a single segment
POST /api/contribute/tt0120338
Content-Type: application/json

{
  "startMs": 3780000,
  "endMs": 3840000,
  "category": "nudity",
  "severity": "high",
  "comment": "Drawing scene"
}

# Import MCF file
POST /api/contribute/tt0120338/mcf
Content-Type: text/plain

WEBVTT MovieContentFilter 1.1.0
...
```

### Vote on Segments

```bash
POST /api/vote/tt0120338/seg_abc123
Content-Type: application/json

{
  "vote": "up"  // or "down"
}
```

## Contributing Skip Data

### Using the CLI

```bash
# Add segments interactively
npm run contribute add tt0120338

# List existing segments
npm run contribute list tt0120338

# Export to MCF format
npm run contribute export tt0120338 > titanic.mcf
```

### Using the API

See the [API Reference](#api-reference) above.

### MCF Format

CleanStream supports the [MovieContentFilter (MCF)](https://www.moviecontentfilter.com/specification) format for interoperability:

```
WEBVTT MovieContentFilter 1.1.0

NOTE
TITLE Titanic
YEAR 1997
TYPE movie
IMDB http://www.imdb.com/title/tt0120338/

NOTE
START 00:00:00.000
END 03:14:00.000

01:03:00.000 --> 01:04:00.000
nudity=high=video # Drawing scene

01:07:00.000 --> 01:09:00.000
sex=medium # Car scene
```

## Filter Categories

| Category | Description | Subcategories |
|----------|-------------|---------------|
| `nudity` | Bare skin, nudity | toplessness, fullNudity, etc. |
| `sex` | Sexual content | kissing, coitus, objectification |
| `violence` | Fighting, gore | punching, weapons, murder |
| `language` | Profanity | swearing, blasphemy |
| `drugs` | Substance use | alcohol, cigarettes |
| `fear` | Scary scenes | death, ghosts, jumpscares |
| `discrimination` | Offensive content | racism, sexism |

Each segment has a severity: `low`, `medium`, or `high`.

## How It Works

1. **User watches a movie** in Stremio
2. **CleanStream addon** checks if we have skip data for that movie (by IMDB ID)
3. **User's preferences** are applied (e.g., skip all nudity, only high violence)
4. **Skip markers** are displayed as a subtitle track
5. **User can skip** by pressing the forward button when prompted

## Roadmap

- [ ] Web-based contribution interface
- [ ] Integration with external databases
- [ ] Machine learning for automatic scene detection
- [ ] Browser extension for watching outside Stremio
- [ ] Mobile app for contributing timestamps

## Similar Projects

- [VidAngel](https://www.vidangel.com/) - Commercial filtering service
- [ClearPlay](https://www.clearplay.com/) - DVD/streaming filters
- [MovieContentFilter](https://www.moviecontentfilter.com/) - Open-source format spec

## License

MIT License - see [LICENSE](LICENSE)

## Acknowledgments

- [Stremio](https://www.stremio.com/) for the amazing platform
- [MovieContentFilter](https://www.moviecontentfilter.com/) for the MCF format specification
- All our contributors! 💜

---

**Made with ❤️ by the CleanStream community**
