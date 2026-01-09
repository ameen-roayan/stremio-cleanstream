# Contributing Skip Segments to Stremio Core

## Step-by-Step Guide

This guide walks you through contributing a **Skip Segments** feature to Stremio, enabling addons to provide timestamps for content that users might want to skip (intros, nudity, violence, etc.).

---

## Overview

**What we're building:**
- Extend the Stremio addon protocol to support `skipSegments`
- Modify `stremio-video` to auto-skip when playback enters a segment
- Add UI controls for enabling/disabling skip behavior

**Repositories involved:**
1. **stremio-addon-sdk** - Define the new data structure
2. **stremio-video** - Implement skip logic in the player
3. **stremio-web** - Add UI controls and settings
4. **stremio-core** (optional) - If type definitions need updating

---

## Step 1: Fork the Repositories

```bash
# Create a working directory
mkdir stremio-contribution && cd stremio-contribution

# Fork these repos on GitHub first, then clone your forks:
git clone https://github.com/YOUR_USERNAME/stremio-addon-sdk.git
git clone https://github.com/YOUR_USERNAME/stremio-video.git
git clone https://github.com/YOUR_USERNAME/stremio-web.git

# Add upstream remotes
cd stremio-addon-sdk
git remote add upstream https://github.com/Stremio/stremio-addon-sdk.git

cd ../stremio-video
git remote add upstream https://github.com/Stremio/stremio-video.git

cd ../stremio-web
git remote add upstream https://github.com/Stremio/stremio-web.git
```

---

## Step 2: Create Feature Branches

```bash
# In each repo:
git checkout -b feature/skip-segments
```

---

## Step 3: Define the Data Structure (stremio-addon-sdk)

### 3.1 Update the Stream Response Schema

Edit `docs/api/responses/stream.md`:

```markdown
## skipSegments

`skipSegments` is an optional array of segments that the player should skip.
Each segment has the following properties:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `start` | number | Yes | Start time in seconds |
| `end` | number | Yes | End time in seconds |
| `type` | string | Yes | Category: `intro`, `outro`, `recap`, `nudity`, `violence`, `language`, `drugs`, `fear`, `ad` |
| `severity` | string | No | `low`, `medium`, `high` (default: `high`) |
| `action` | string | No | `skip` (auto-skip), `warn` (show button), `none` (just mark). Default: `skip` |
| `title` | string | No | Human-readable label (e.g., "Skip intro", "Nudity scene") |

### Example

```javascript
{
  streams: [{
    url: "https://example.com/movie.mp4",
    skipSegments: [
      { start: 0, end: 45, type: "intro", title: "Skip intro" },
      { start: 3780, end: 3840, type: "nudity", severity: "high" },
      { start: 9600, end: 9660, type: "violence", severity: "medium" }
    ]
  }]
}
```
```

### 3.2 Update Type Definitions

If there's a types file, add:

```typescript
interface SkipSegment {
  start: number;      // seconds
  end: number;        // seconds
  type: 'intro' | 'outro' | 'recap' | 'nudity' | 'violence' | 'language' | 'drugs' | 'fear' | 'ad' | 'other';
  severity?: 'low' | 'medium' | 'high';
  action?: 'skip' | 'warn' | 'none';
  title?: string;
}

interface Stream {
  // ... existing properties
  skipSegments?: SkipSegment[];
}
```

---

## Step 4: Implement Skip Logic (stremio-video)

This is the core change. The `stremio-video` package is an abstraction layer over different video players.

### 4.1 Understand the Structure

```
stremio-video/src/
├── index.js           # Main entry point
├── HTMLVideo.js       # HTML5 video implementation
├── MPVVideo.js        # MPV player implementation
├── YouTubeVideo.js    # YouTube player implementation
└── withStreamingServer.js
```

### 4.2 Add Skip Segments Handler

Create `src/SkipSegmentsHandler.js`:

```javascript
/**
 * SkipSegmentsHandler
 * Monitors playback time and auto-skips configured segments
 */

class SkipSegmentsHandler {
  constructor() {
    this.segments = [];
    this.enabled = true;
    this.skippedSegments = new Set(); // Track already-skipped segments
    this.onSkipCallback = null;
  }

  /**
   * Set skip segments for current video
   * @param {Array} segments - Array of { start, end, type, severity, action, title }
   */
  setSegments(segments = []) {
    this.segments = segments
      .filter(s => s.start < s.end) // Validate
      .sort((a, b) => a.start - b.start); // Sort by start time
    this.skippedSegments.clear();
  }

  /**
   * Clear all segments
   */
  clearSegments() {
    this.segments = [];
    this.skippedSegments.clear();
  }

  /**
   * Enable/disable skip functionality
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * Set callback for when a skip occurs
   */
  onSkip(callback) {
    this.onSkipCallback = callback;
  }

  /**
   * Check current time and return skip target if applicable
   * @param {number} currentTime - Current playback time in seconds
   * @param {object} userPrefs - User preferences { nudity: 'high', violence: 'off', ... }
   * @returns {object|null} - { targetTime, segment } or null
   */
  checkTime(currentTime, userPrefs = {}) {
    if (!this.enabled || this.segments.length === 0) {
      return null;
    }

    for (const segment of this.segments) {
      // Skip if already processed this segment
      const segmentId = `${segment.start}-${segment.end}`;
      if (this.skippedSegments.has(segmentId)) {
        continue;
      }

      // Check if we're inside this segment
      if (currentTime >= segment.start && currentTime < segment.end) {
        // Check user preferences
        if (!this.shouldSkip(segment, userPrefs)) {
          continue;
        }

        // Check action type
        if (segment.action === 'none') {
          continue;
        }

        // Mark as processed
        this.skippedSegments.add(segmentId);

        // Return skip target
        return {
          targetTime: segment.end,
          segment: segment
        };
      }
    }

    return null;
  }

  /**
   * Check if segment should be skipped based on user preferences
   */
  shouldSkip(segment, userPrefs) {
    const { type, severity = 'high' } = segment;
    
    // Map segment types to preference categories
    const categoryMap = {
      intro: 'skipIntros',
      outro: 'skipOutros',
      recap: 'skipRecaps',
      nudity: 'nudity',
      violence: 'violence',
      language: 'language',
      drugs: 'drugs',
      fear: 'fear',
      ad: 'skipAds'
    };

    const prefKey = categoryMap[type];
    if (!prefKey) return true; // Unknown type, skip by default

    const userPref = userPrefs[prefKey];
    
    // Boolean preferences (intros, outros, etc.)
    if (typeof userPref === 'boolean') {
      return userPref;
    }

    // Severity-based preferences (nudity, violence, etc.)
    if (userPref === 'off' || !userPref) {
      return false;
    }

    const severityLevels = { low: 1, medium: 2, high: 3 };
    const userLevel = severityLevels[userPref] || 0;
    const segmentLevel = severityLevels[severity] || 3;

    // Skip if segment severity meets or exceeds user threshold
    return segmentLevel >= userLevel;
  }

  /**
   * Get upcoming segment (for showing skip button)
   * @param {number} currentTime - Current playback time
   * @param {number} lookahead - Seconds to look ahead (default 5)
   */
  getUpcoming(currentTime, lookahead = 5) {
    for (const segment of this.segments) {
      if (segment.start > currentTime && segment.start <= currentTime + lookahead) {
        return segment;
      }
    }
    return null;
  }

  /**
   * Get active segment at current time
   */
  getActive(currentTime) {
    for (const segment of this.segments) {
      if (currentTime >= segment.start && currentTime < segment.end) {
        return segment;
      }
    }
    return null;
  }
}

module.exports = SkipSegmentsHandler;
```

### 4.3 Integrate into HTMLVideo.js

Find the main video implementation and add:

```javascript
const SkipSegmentsHandler = require('./SkipSegmentsHandler');

// In constructor:
this.skipHandler = new SkipSegmentsHandler();

// In the timeupdate event handler:
video.addEventListener('timeupdate', () => {
  const skipResult = this.skipHandler.checkTime(video.currentTime, this.userPrefs);
  if (skipResult) {
    console.log(`[stremio-video] Skipping ${skipResult.segment.type}: ${skipResult.segment.title || ''}`);
    video.currentTime = skipResult.targetTime;
    
    // Emit event for UI
    this.emit('segmentSkipped', skipResult.segment);
  }
});

// Add method to set segments:
setSkipSegments(segments) {
  this.skipHandler.setSegments(segments);
}

// Add method to set user preferences:
setSkipPreferences(prefs) {
  this.userPrefs = prefs;
}
```

---

## Step 5: Add UI Controls (stremio-web)

### 5.1 Add Settings

In the settings section, add toggles for:

```jsx
// Settings/ContentFiltering.js (new component)
import React from 'react';

const ContentFiltering = ({ settings, onSettingsChange }) => {
  const filterOptions = [
    { key: 'nudity', label: 'Nudity', icon: '🔞' },
    { key: 'violence', label: 'Violence', icon: '⚔️' },
    { key: 'language', label: 'Language', icon: '🤬' },
    { key: 'drugs', label: 'Drugs/Alcohol', icon: '💊' },
    { key: 'fear', label: 'Frightening Scenes', icon: '👻' },
  ];

  const levelOptions = ['off', 'low', 'medium', 'high'];

  return (
    <div className="content-filtering-settings">
      <h3>Content Filtering (Skip Segments)</h3>
      <p>Automatically skip scenes based on your preferences</p>
      
      {filterOptions.map(({ key, label, icon }) => (
        <div key={key} className="filter-row">
          <span>{icon} {label}</span>
          <select 
            value={settings[key] || 'off'}
            onChange={(e) => onSettingsChange(key, e.target.value)}
          >
            {levelOptions.map(level => (
              <option key={level} value={level}>
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </option>
            ))}
          </select>
        </div>
      ))}

      <div className="filter-row">
        <span>⏭️ Skip Intros</span>
        <input 
          type="checkbox" 
          checked={settings.skipIntros}
          onChange={(e) => onSettingsChange('skipIntros', e.target.checked)}
        />
      </div>
    </div>
  );
};

export default ContentFiltering;
```

### 5.2 Show Skip Button/Toast

When a segment is skipped, show a brief toast:

```jsx
// Player/SkipNotification.js
const SkipNotification = ({ segment, visible }) => {
  if (!visible || !segment) return null;

  const labels = {
    nudity: '🔞 Scene skipped',
    violence: '⚔️ Scene skipped',
    intro: '⏭️ Intro skipped',
    outro: '⏭️ Outro skipped',
  };

  return (
    <div className="skip-notification">
      {labels[segment.type] || '⏭️ Scene skipped'}
    </div>
  );
};
```

---

## Step 6: Test Your Changes

### 6.1 Create a Test Addon

```javascript
// test-addon/index.js
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');

const builder = new addonBuilder({
  id: 'test.skipSegments',
  version: '1.0.0',
  name: 'Skip Segments Test',
  resources: ['stream'],
  types: ['movie'],
  idPrefixes: ['tt'],
});

builder.defineStreamHandler(({ id }) => {
  // Big Buck Bunny for testing
  if (id === 'tt1254207') {
    return {
      streams: [{
        url: 'http://distribution.bbb3d.renderfarming.net/video/mp4/bbb_sunflower_1080p_30fps_normal.mp4',
        skipSegments: [
          { start: 0, end: 10, type: 'intro', title: 'Studio logos' },
          { start: 30, end: 35, type: 'violence', severity: 'low', title: 'Bunny gets hit' },
          { start: 120, end: 125, type: 'nudity', severity: 'medium', title: 'Test segment' },
        ]
      }]
    };
  }
  return { streams: [] };
});

serveHTTP(builder.getInterface(), { port: 7777 });
console.log('Test addon running at http://localhost:7777/manifest.json');
```

### 6.2 Run Local Stremio Web

```bash
cd stremio-web
npm install
npm run dev
# Opens at localhost:3000
```

### 6.3 Install Test Addon

1. Open localhost:3000
2. Go to Addons
3. Add: `http://localhost:7777/manifest.json`
4. Play Big Buck Bunny
5. Verify segments are skipped

---

## Step 7: Write Tests

### Unit Tests for SkipSegmentsHandler

```javascript
// test/SkipSegmentsHandler.test.js
const SkipSegmentsHandler = require('../src/SkipSegmentsHandler');

describe('SkipSegmentsHandler', () => {
  let handler;

  beforeEach(() => {
    handler = new SkipSegmentsHandler();
  });

  test('should skip segment when inside', () => {
    handler.setSegments([
      { start: 10, end: 20, type: 'intro' }
    ]);

    const result = handler.checkTime(15, { skipIntros: true });
    expect(result).not.toBeNull();
    expect(result.targetTime).toBe(20);
  });

  test('should not skip when preference is off', () => {
    handler.setSegments([
      { start: 10, end: 20, type: 'nudity', severity: 'high' }
    ]);

    const result = handler.checkTime(15, { nudity: 'off' });
    expect(result).toBeNull();
  });

  test('should skip based on severity threshold', () => {
    handler.setSegments([
      { start: 10, end: 20, type: 'violence', severity: 'medium' }
    ]);

    // User wants to skip 'low' and above - should skip
    expect(handler.checkTime(15, { violence: 'low' })).not.toBeNull();

    // User wants to skip 'high' only - should NOT skip medium
    handler.skippedSegments.clear();
    expect(handler.checkTime(15, { violence: 'high' })).toBeNull();
  });
});
```

---

## Step 8: Submit Pull Requests

### 8.1 Commit Your Changes

```bash
# In each repo
git add .
git commit -m "feat: add skipSegments support for content filtering

- Add skipSegments property to stream response
- Implement SkipSegmentsHandler for auto-skipping
- Add content filtering settings UI
- Add skip notification toast

Closes #164, #821, #1599"
```

### 8.2 Push and Create PRs

```bash
git push origin feature/skip-segments
```

Then on GitHub:
1. Go to your fork
2. Click "Compare & pull request"
3. Write a detailed description referencing the issues

### 8.3 PR Description Template

```markdown
## Summary

This PR adds support for skip segments in the Stremio player, enabling addons to provide timestamps for content that should be skipped.

## Motivation

- Resolves #164 (Skip opening/ending for anime)
- Resolves #821 (Native Skip Intro Support)  
- Resolves #1599 (Addon Support for Intro Timestamps)
- Enables content filtering addons (nudity, violence, etc.)

## Changes

### stremio-addon-sdk
- Added `skipSegments` property to stream response schema
- Documented segment types and severity levels

### stremio-video
- Added `SkipSegmentsHandler` class
- Integrated with HTMLVideo player
- Added events for skip notifications

### stremio-web
- Added Content Filtering settings page
- Added skip notification toast
- Persisted user preferences

## Testing

- [x] Unit tests for SkipSegmentsHandler
- [x] Manual testing with test addon
- [x] Tested on Chrome, Firefox, Safari

## Screenshots

[Add screenshots of settings UI and skip notification]

## Checklist

- [x] Code follows project style guidelines
- [x] Tests added/updated
- [x] Documentation updated
- [x] No breaking changes
```

---

## Step 9: Engage with Maintainers

1. **Be responsive** - Reply to review comments quickly
2. **Be patient** - Open source maintainers are often busy
3. **Be flexible** - They may want changes to your approach
4. **Reference existing work** - Mention IntroHater (#821) and community interest

---

## Timeline Estimate

| Phase | Time |
|-------|------|
| Fork & Setup | 1 hour |
| stremio-video implementation | 4-8 hours |
| stremio-web UI | 4-6 hours |
| Testing | 2-4 hours |
| Documentation | 2 hours |
| PR review cycle | 1-4 weeks (depends on maintainers) |

---

## Alternative: Parallel Browser Extension

While waiting for PR approval, you can build a browser extension that:
1. Injects into Stremio Web
2. Reads skip data from your CleanStream API
3. Hooks into the video player's `timeupdate` event
4. Auto-skips without any Stremio core changes

This proves the concept and builds a user base while the official implementation is reviewed.

---

## Resources

- [Stremio Features Repo](https://github.com/Stremio/stremio-features)
- [Stremio Video Repo](https://github.com/Stremio/stremio-video)
- [Stremio Web Repo](https://github.com/Stremio/stremio-web)
- [Existing Skip Feature Request #164](https://github.com/Stremio/stremio-features/issues/164)
- [IntroHater Proposal #821](https://github.com/Stremio/stremio-web/issues/821)
- [Recent Intro Skip Request #1599](https://github.com/Stremio/stremio-features/issues/1599)
