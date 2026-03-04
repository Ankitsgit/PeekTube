# PeekTube 🎬

> Hover over any YouTube channel link to instantly preview the channel — X-style profile cards with stats, avatar, and description.

---

## Demo

<div align="center">

![UstaadX Demo GIF](Demo.gif)

</div>

## What It Does

Hover over any YouTube channel name or avatar for **300ms** and a sleek floating card appears showing:

- Channel avatar + name
- Verified badge (if applicable)
- Subscriber count & total videos
- Channel description (2-line preview)
- One-click **Open Channel** button

Works everywhere on YouTube — homepage feed, watch page, search results, channel pages, and infinite scroll sections.

---

## Setup

### 1. Get a Free YouTube API Key

1. Go to [console.developers.google.com](https://console.developers.google.com)
2. Create a project → **Enable** `YouTube Data API v3`
3. Go to **Credentials** → **Create API Key**
4. Select **Public data** when asked what data you're accessing
5. Copy the key

### 2. Add Your Key

Open `background.js` and replace line 7:

```js
var YOUTUBE_API_KEY = "YOUR_YOUTUBE_API_KEY_HERE";
```

With your actual key:

```js
var YOUTUBE_API_KEY = "AIzaSyABC123...";
```

### 3. Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer Mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `yt-preview` folder *(the one containing `manifest.json`)*
5. Done ✓

---

## Files

```
yt-preview/
├── manifest.json     — Chrome Extension config (MV3)
├── background.js     — Service worker: API calls + caching
├── content.js        — Hover detection + card UI (injected into YouTube)
├── popup.html        — Extension popup
└── icons/            — Extension icons
```

---

## How It Works

```
User hovers channel link (300ms)
        ↓
content.js detects @handle / /channel/UC... / /c/ links
        ↓
Checks in-memory cache → if hit, render immediately
        ↓
Sends message to background.js service worker
        ↓
background.js checks chrome.storage cache (10-min TTL)
        ↓
Calls YouTube Data API v3 → channels.list
        ↓
Returns: name, avatar, subscribers, videos, description
        ↓
Shadow DOM card renders with smooth fade-in animation
```

---

## API Quota

YouTube Data API v3 gives you **10,000 free units/day**.

| Action | Cost |
|--------|------|
| Fetch channel by ID | ~3 units |
| Resolve @handle → ID | ~100 units |

The extension caches results for **10 minutes** so repeated hovers on the same channel cost zero extra units.

---

## Pages Supported

| Page | URL |
|------|-----|
| Home feed | `youtube.com/` |
| Watch page | `youtube.com/watch?v=...` |
| Search results | `youtube.com/results?...` |
| Channel page | `youtube.com/@username` |
| Channel ID | `youtube.com/channel/UC...` |
| Infinite scroll | Auto-handled via event delegation |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Card never appears | Open F12 Console — check for `[YT-PREVIEW] ✅ Ready!` |
| `undefined` for `window.__ytPreviewInitialized` | Wrong folder loaded — make sure `manifest.json` is directly inside the selected folder |
| Quota exceeded message | Daily limit hit — wait until midnight or create a new API key |
| Card shows but no data | API key not saved correctly in `background.js` |
| Works on one page but not another | Press `Ctrl+Shift+R` to hard refresh |

---

## Tech Stack

- **Manifest V3** Chrome Extension
- **Shadow DOM** — card styles are fully isolated from YouTube's CSS
- **YouTube Data API v3** — public data, no OAuth needed
- **Event delegation** — single `mouseover` listener handles all links including dynamically loaded ones
- **Dual-layer cache** — in-memory (instant) + `chrome.storage` (10-min TTL)
- **SPA-aware** — patches `history.pushState` and listens to YouTube's `yt-navigate-finish` events

---

## License

MIT — free to use, modify, and distribute.