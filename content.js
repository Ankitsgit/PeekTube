// ============================================================
// content.js — YouTube Channel Hover Preview
// Single file: API layer + Shadow DOM card + hover logic
// ============================================================

(function () {
  "use strict";

  if (window.__ytPreviewInitialized) return;
  window.__ytPreviewInitialized = true;

  // ════════════════════════════════════════════════════════════
  // 1. API LAYER  (in-memory cache + message to background.js)
  // ════════════════════════════════════════════════════════════

  var memCache = {};
  var inFlight = {};
  var MEM_TTL  = 10 * 60 * 1000;

  function memGet(key) {
    var e = memCache[key];
    if (!e) return null;
    if (Date.now() - e.ts > MEM_TTL) { delete memCache[key]; return null; }
    return e.data;
  }
  function memSet(key, data) { memCache[key] = { data: data, ts: Date.now() }; }

  function fetchChannel(identifier) {
    var key = "yt:" + identifier;
    var cached = memGet(key);
    if (cached) return Promise.resolve(cached);
    if (inFlight[key]) return inFlight[key];

    var p = new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage(
        { type: "FETCH_CHANNEL", identifier: identifier },
        function (res) {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!res) { reject(new Error("No response")); return; }
          if (!res.ok) {
            var e = new Error(res.error || "API error");
            e.isQuota = !!res.isQuota;
            reject(e);
            return;
          }
          resolve(res.data);
        }
      );
    });

    inFlight[key] = p;
    p.then(function (data) {
      if (data) memSet(key, data);
      delete inFlight[key];
    }).catch(function () { delete inFlight[key]; });

    return p;
  }

  // ════════════════════════════════════════════════════════════
  // 2. HOVER CARD  (Shadow DOM so YouTube CSS can't interfere)
  // ════════════════════════════════════════════════════════════

  var hostEl   = null;
  var shadowEl = null;
  var cardEl   = null;
  var hideTimer = null;
  var cardVisible = false;

  var CARD_CSS = "\n\
    * { box-sizing:border-box; margin:0; padding:0; }\n\
    .card {\n\
      position:fixed;\n\
      width:300px;\n\
      background:#0f0f0f;\n\
      border:1px solid rgba(255,255,255,0.13);\n\
      border-radius:14px;\n\
      padding:18px;\n\
      box-shadow:0 12px 40px rgba(0,0,0,0.9);\n\
      opacity:0;\n\
      transform:translateY(8px) scale(0.96);\n\
      transition:opacity 180ms ease, transform 180ms ease;\n\
      z-index:2147483647;\n\
      pointer-events:auto;\n\
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;\n\
    }\n\
    .card.show { opacity:1; transform:translateY(0) scale(1); }\n\
    .card.hide { opacity:0; transform:translateY(5px); transition:opacity 120ms,transform 120ms; pointer-events:none; }\n\
    .row { display:flex; align-items:center; gap:11px; margin-bottom:13px; }\n\
    .avatar {\n\
      width:52px; height:52px; border-radius:50%;\n\
      object-fit:cover; flex-shrink:0;\n\
      background:#222; border:2px solid rgba(255,255,255,0.1);\n\
    }\n\
    .av-fb {\n\
      width:52px; height:52px; border-radius:50%; flex-shrink:0;\n\
      background:linear-gradient(135deg,#ff0000,#b00000);\n\
      display:flex; align-items:center; justify-content:center;\n\
      font-size:20px; font-weight:800; color:#fff;\n\
    }\n\
    .info { min-width:0; }\n\
    .name-line { display:flex; align-items:center; gap:5px; }\n\
    .name { font-size:14px; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }\n\
    .tick {\n\
      width:15px; height:15px; border-radius:50%;\n\
      background:#aaa; flex-shrink:0;\n\
      display:flex; align-items:center; justify-content:center;\n\
    }\n\
    .tick svg { width:9px; height:9px; }\n\
    .handle { font-size:12px; color:#888; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }\n\
    .stats {\n\
      display:flex; margin-bottom:13px;\n\
      background:rgba(255,255,255,0.05);\n\
      border-radius:9px; overflow:hidden;\n\
      border:1px solid rgba(255,255,255,0.08);\n\
    }\n\
    .stat { flex:1; padding:9px 10px; text-align:center; }\n\
    .stat + .stat { border-left:1px solid rgba(255,255,255,0.08); }\n\
    .sv { font-size:14px; font-weight:700; color:#fff; letter-spacing:-0.02em; }\n\
    .sl { font-size:10px; color:#777; text-transform:uppercase; letter-spacing:.05em; margin-top:2px; }\n\
    .desc {\n\
      font-size:12px; color:#999; line-height:1.5; margin-bottom:13px;\n\
      display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;\n\
    }\n\
    .desc:empty { display:none; margin:0; }\n\
    .btn {\n\
      display:flex; align-items:center; justify-content:center; gap:6px;\n\
      width:100%; padding:9px; background:#ff0000; color:#fff;\n\
      border:none; border-radius:8px; font-size:13px; font-weight:600;\n\
      cursor:pointer; text-decoration:none;\n\
      transition:background 120ms;\n\
    }\n\
    .btn:hover { background:#cc0000; }\n\
    .sk { background:linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.09) 50%,rgba(255,255,255,0.04) 75%); background-size:200% 100%; animation:sh 1.3s infinite; border-radius:5px; }\n\
    @keyframes sh { 0%{background-position:200% 0} 100%{background-position:-200% 0} }\n\
    .sk-row { display:flex; gap:11px; margin-bottom:12px; }\n\
    .sk-av { width:52px; height:52px; border-radius:50%; flex-shrink:0; }\n\
    .sk-lines { flex:1; display:flex; flex-direction:column; gap:7px; padding-top:4px; }\n\
    .sk-a { height:13px; width:65%; } .sk-b { height:10px; width:40%; }\n\
    .sk-bar { height:48px; border-radius:9px; margin-bottom:12px; }\n\
    .sk-t1 { height:10px; margin-bottom:5px; } .sk-t2 { height:10px; width:60%; margin-bottom:12px; }\n\
    .sk-btn { height:36px; border-radius:8px; }\n\
    .err { text-align:center; padding:6px 0; }\n\
    .err-ic { font-size:26px; margin-bottom:7px; }\n\
    .err-t { font-size:13px; font-weight:600; color:#fff; margin-bottom:4px; }\n\
    .err-m { font-size:12px; color:#777; line-height:1.45; }\n\
  ";

  var CHECK_SVG = '<svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 6l3 3 5-5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var EXT_SVG   = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';

  function esc(s) {
    return String(s || "")
      .replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }
  function initials(n) {
    return (n || "?").split(/\s+/).slice(0, 2).map(function(w){ return (w[0]||"").toUpperCase(); }).join("");
  }

  function ensureCard() {
    if (hostEl && document.body.contains(hostEl)) return;

    hostEl = document.createElement("div");
    hostEl.setAttribute("id", "__ytprev_host__");
    document.body.appendChild(hostEl);

    shadowEl = hostEl.attachShadow({ mode: "open" });

    var styleTag = document.createElement("style");
    styleTag.textContent = CARD_CSS;
    shadowEl.appendChild(styleTag);

    cardEl = document.createElement("div");
    cardEl.className = "card";
    shadowEl.appendChild(cardEl);

    cardEl.addEventListener("mouseenter", function(){ cancelHide(); });
    cardEl.addEventListener("mouseleave", function(){ scheduleHide(150); });
  }

  function positionCard(rect) {
    var W = 300, MARGIN = 10;
    var vw = window.innerWidth, vh = window.innerHeight;
    var left = rect.left;
    var top  = rect.bottom + MARGIN;

    if (top + 280 > vh - MARGIN) top = Math.max(MARGIN, rect.top - 280 - MARGIN);
    if (left + W  > vw - MARGIN) left = vw - W - MARGIN;
    if (left < MARGIN) left = MARGIN;
    if (top  < MARGIN) top  = MARGIN;

    cardEl.style.left = left + "px";
    cardEl.style.top  = top  + "px";
  }

  function showCard(rect) {
    ensureCard();
    cancelHide();
    positionCard(rect);
    cardEl.classList.remove("hide");
    void cardEl.offsetWidth; // force reflow
    cardEl.classList.add("show");
    cardVisible = true;
  }

  function scheduleHide(delay) {
    cancelHide();
    hideTimer = setTimeout(function(){ doHide(); }, delay || 150);
  }

  function cancelHide() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  }

  function doHide() {
    if (!cardEl) return;
    cardEl.classList.add("hide");
    cardEl.classList.remove("show");
    cardVisible = false;
    setTimeout(function(){
      if (cardEl && !cardVisible) {
        cardEl.classList.remove("hide");
        cardEl.innerHTML = "";
      }
    }, 180);
  }

  function destroyCard() {
    doHide();
    if (hostEl && hostEl.parentNode) hostEl.parentNode.removeChild(hostEl);
    hostEl = null; shadowEl = null; cardEl = null;
  }

  // ── Render helpers ────────────────────────────────────────
  function renderLoading() {
    ensureCard();
    cardEl.innerHTML =
      '<div class="sk-row">' +
        '<div class="sk sk-av"></div>' +
        '<div class="sk-lines"><div class="sk sk-a"></div><div class="sk sk-b"></div></div>' +
      '</div>' +
      '<div class="sk sk-bar"></div>' +
      '<div class="sk sk-t1"></div><div class="sk sk-t2"></div>' +
      '<div class="sk sk-btn"></div>';
  }

  function renderData(data) {
    if (!cardEl) return;
    var av = data.avatar
      ? '<img class="avatar" src="' + esc(data.avatar) + '" alt="" ' +
          'onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'">' +
          '<div class="av-fb" style="display:none">' + initials(data.name) + '</div>'
      : '<div class="av-fb">' + initials(data.name) + '</div>';

    cardEl.innerHTML =
      '<div class="row">' + av +
        '<div class="info">' +
          '<div class="name-line">' +
            '<span class="name">' + esc(data.name) + '</span>' +
            (data.verified ? '<span class="tick">' + CHECK_SVG + '</span>' : '') +
          '</div>' +
          (data.handle ? '<div class="handle">' + esc(data.handle) + '</div>' : '') +
        '</div>' +
      '</div>' +
      '<div class="stats">' +
        '<div class="stat"><div class="sv">' + esc(data.subscribers) + '</div><div class="sl">Subscribers</div></div>' +
        '<div class="stat"><div class="sv">' + esc(data.videos) + '</div><div class="sl">Videos</div></div>' +
      '</div>' +
      (data.description ? '<div class="desc">' + esc(data.description) + '</div>' : '') +
      '<a class="btn" href="' + esc(data.channelUrl) + '" target="_blank" rel="noopener noreferrer">' +
        EXT_SVG + ' Open Channel' +
      '</a>';
  }

  function renderError(isQuota) {
    if (!cardEl) return;
    cardEl.innerHTML =
      '<div class="err">' +
        '<div class="err-ic">' + (isQuota ? "⚠️" : "😕") + '</div>' +
        '<div class="err-t">' + (isQuota ? "Quota Exceeded" : "Load Failed") + '</div>' +
        '<div class="err-m">' + (isQuota ? "YouTube API daily limit reached." : "Could not load channel info.") + '</div>' +
      '</div>';
  }

  // ════════════════════════════════════════════════════════════
  // 3. CHANNEL DETECTION
  // ════════════════════════════════════════════════════════════

  var PATTERNS = [
    { re: /youtube\.com\/@([\w.-]+)/i,           fn: function(m){ return m[1]; } },
    { re: /youtube\.com\/channel\/(UC[\w-]{22})/i, fn: function(m){ return m[1]; } },
    { re: /youtube\.com\/c\/([\w.-]+)/i,          fn: function(m){ return m[1]; } },
    { re: /youtube\.com\/user\/([\w.-]+)/i,       fn: function(m){ return m[1]; } }
  ];

  function extractIdentifier(href) {
    if (!href) return null;
    for (var i = 0; i < PATTERNS.length; i++) {
      var m = href.match(PATTERNS[i].re);
      if (m) return PATTERNS[i].fn(m);
    }
    return null;
  }

  function findChannelLink(el) {
    var depth = 0;
    while (el && el !== document.body && depth < 8) {
      if (el.tagName === "A" && el.href) {
        var id = extractIdentifier(el.href);
        if (id) return { el: el, identifier: id };
      }
      el = el.parentElement;
      depth++;
    }
    return null;
  }

  // ════════════════════════════════════════════════════════════
  // 4. HOVER ORCHESTRATION
  // ════════════════════════════════════════════════════════════

  var hoverTimer  = null;
  var curEl       = null;
  var curKey      = null;

  function onMouseover(e) {
    var found = findChannelLink(e.target);
    if (!found) return;

    var el  = found.el;
    var key = found.identifier;

    // Same card already visible — just cancel any pending hide
    if (key === curKey && cardVisible) { cancelHide(); return; }

    clearHoverTimer();
    curEl  = el;
    curKey = key;

    hoverTimer = setTimeout(function () {
      if (curEl !== el) return;

      var rect = el.getBoundingClientRect();
      renderLoading();
      showCard(rect);

      fetchChannel(key).then(function (data) {
        if (curEl !== el) return;
        if (!data) { renderError(false); return; }
        renderData(data);
        positionCard(el.getBoundingClientRect());
      }).catch(function (err) {
        if (curEl !== el) return;
        renderError(err.isQuota || false);
      });

    }, 300);
  }

  function onMouseout(e) {
    if (curEl && curEl.contains(e.relatedTarget)) return;
    clearHoverTimer();
    curEl = null;
    scheduleHide(150);
  }

  function clearHoverTimer() {
    if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
  }

  // ════════════════════════════════════════════════════════════
  // 5. SPA NAVIGATION HANDLING
  // ════════════════════════════════════════════════════════════

  var lastUrl = location.href;

  function onNavigate() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    clearHoverTimer();
    curEl = null; curKey = null;
    doHide();
  }

  function patchHistory() {
    var origPush    = history.pushState.bind(history);
    var origReplace = history.replaceState.bind(history);
    history.pushState = function () {
      origPush.apply(history, arguments);
      onNavigate();
    };
    history.replaceState = function () {
      origReplace.apply(history, arguments);
      onNavigate();
    };
    window.addEventListener("popstate", onNavigate);
  }

  // ════════════════════════════════════════════════════════════
  // 6. INIT
  // ════════════════════════════════════════════════════════════

  function init() {
    document.addEventListener("mouseover", onMouseover, { passive: true });
    document.addEventListener("mouseout",  onMouseout,  { passive: true });
    document.addEventListener("yt-navigate-finish",   onNavigate);
    document.addEventListener("yt-page-data-updated", onNavigate);
    patchHistory();
  }

  window.addEventListener("beforeunload", function () {
    document.removeEventListener("mouseover", onMouseover);
    document.removeEventListener("mouseout",  onMouseout);
    destroyCard();
    window.__ytPreviewInitialized = false;
  });

  if (document.body) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  }

})();
