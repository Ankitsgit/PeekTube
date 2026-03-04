// ============================================================
// background.js — Service Worker
// 🔑 PUT YOUR API KEY BELOW on line 7
// ============================================================

var YOUTUBE_API_KEY = "YOUR_YOUTUBE_API_KEY_HERE";
var CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ── Utility ──────────────────────────────────────────────────
function formatCount(n) {
  n = parseInt(n, 10);
  if (isNaN(n)) return "0";
  if (n >= 1000000000) return (n / 1000000000).toFixed(1).replace(/\.0$/, "") + "B";
  if (n >= 1000000)    return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1000)       return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

// ── Storage cache ─────────────────────────────────────────────
function cacheGet(key) {
  return new Promise(function(resolve) {
    chrome.storage.local.get(key, function(result) {
      var entry = result[key];
      if (!entry) return resolve(null);
      if (Date.now() - entry.ts > CACHE_TTL_MS) return resolve(null);
      resolve(entry.data);
    });
  });
}

function cacheSet(key, data) {
  return new Promise(function(resolve) {
    var obj = {};
    obj[key] = { data: data, ts: Date.now() };
    chrome.storage.local.set(obj, resolve);
  });
}

// ── Resolve handle / custom URL → channel ID ─────────────────
function resolveChannelId(identifier) {
  // Already a UC... ID
  if (/^UC[\w-]{22}$/.test(identifier)) {
    return Promise.resolve(identifier);
  }

  var cacheKey = "resolve_" + identifier;
  return cacheGet(cacheKey).then(function(cached) {
    if (cached) return cached;

    var url = "https://www.googleapis.com/youtube/v3/search"
      + "?part=snippet&type=channel&q=" + encodeURIComponent(identifier)
      + "&maxResults=1&key=" + YOUTUBE_API_KEY;

    return fetch(url)
      .then(function(r) { return r.json(); })
      .then(function(json) {
        if (json.error) throw new Error(json.error.code === 403 ? "QUOTA_EXCEEDED" : json.error.message);
        var id = json.items && json.items[0] && json.items[0].id && json.items[0].id.channelId;
        if (id) cacheSet(cacheKey, id);
        return id || null;
      });
  });
}

// ── Fetch full channel data ───────────────────────────────────
function fetchChannelData(identifier) {
  return resolveChannelId(identifier).then(function(channelId) {
    if (!channelId) return null;

    var cacheKey = "channel_" + channelId;
    return cacheGet(cacheKey).then(function(cached) {
      if (cached) return cached;

      var url = "https://www.googleapis.com/youtube/v3/channels"
        + "?part=snippet,statistics&id=" + channelId
        + "&key=" + YOUTUBE_API_KEY;

      return fetch(url)
        .then(function(r) {
          if (r.status === 403) throw new Error("QUOTA_EXCEEDED");
          return r.json();
        })
        .then(function(json) {
          if (json.error) {
            throw new Error(json.error.code === 403 ? "QUOTA_EXCEEDED" : (json.error.message || "API error"));
          }
          var item = json.items && json.items[0];
          if (!item) return null;

          var snippet = item.snippet || {};
          var stats   = item.statistics || {};

          var data = {
            id:          item.id,
            name:        snippet.title || "Unknown Channel",
            handle:      snippet.customUrl || "",
            description: snippet.description || "",
            avatar:      (snippet.thumbnails && (
                           snippet.thumbnails.high   ||
                           snippet.thumbnails.medium ||
                           snippet.thumbnails.default
                         ) || {}).url || "",
            subscribers: stats.subscriberCount ? formatCount(stats.subscriberCount) : "Hidden",
            videos:      stats.videoCount      ? formatCount(stats.videoCount)      : "0",
            verified:    !stats.hiddenSubscriberCount && parseInt(stats.viewCount||0) > 0,
            channelUrl:  "https://www.youtube.com/channel/" + item.id
          };

          cacheSet(cacheKey, data);
          return data;
        });
    });
  });
}

// ── Message handler ───────────────────────────────────────────
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.type !== "FETCH_CHANNEL") return false;

  fetchChannelData(message.identifier)
    .then(function(data) {
      sendResponse({ ok: true, data: data });
    })
    .catch(function(err) {
      sendResponse({
        ok: false,
        error: err.message || "Unknown error",
        isQuota: err.message === "QUOTA_EXCEEDED"
      });
    });

  return true; // keep channel open for async response
});

// ── Periodic cache cleanup ────────────────────────────────────
function pruneCache() {
  chrome.storage.local.get(null, function(items) {
    var toRemove = [];
    var now = Date.now();
    Object.keys(items).forEach(function(key) {
      if (items[key] && items[key].ts && now - items[key].ts > CACHE_TTL_MS) {
        toRemove.push(key);
      }
    });
    if (toRemove.length) chrome.storage.local.remove(toRemove);
  });
}
pruneCache();
setInterval(pruneCache, 5 * 60 * 1000);
