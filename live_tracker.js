#!/usr/bin/env node
/**
 * ╔════════════════════════════════════════════════════════════════════════════╗
 * ║   🚀 OLLYFLIX AUTONOMOUS AI LIVE AD TRACKER & STREAM SNIFFER v8.0          ║
 * ║   - Real-Time Web Dashboard (SSE Event Streaming + Built-in HLS Player)    ║
 * ║   - Puppeteer-Stealth Anti-Bot Evasion (Cloudflare & Turnstile Bypass)     ║
 * ║   - Smart Overlay Buster (Auto-removes clickjackers & simulates real play) ║
 * ║   - Runtime JS Monkey-Patching (window.open + fetch() + XHR interceptors)  ║
 * ║   - Categorized Ad Intelligence (Betting, Adult, Popunder, Telemetry, VAST)║
 * ║   - Stream Headers Sniffer (ExoPlayer Kotlin/Java + VLC/FFmpeg generator)  ║
 * ║   - Next.js/React SPA Smart Extractor (ZXC-Prime, Vidsrc, etc.)            ║
 * ║   - Dual Mode: Web GUI on http://localhost:3300 OR Command-Line (CLI)      ║
 * ╚════════════════════════════════════════════════════════════════════════════╝
 */

const http  = require('http');
const https = require('https');
const url   = require('url');
const fs    = require('fs');
const path  = require('path');
const { spawn, exec } = require('child_process');

let puppeteer = null;
try {
  puppeteer = require('puppeteer');
} catch(e) {
  try {
    puppeteer = require('d:/Latest_Updated_Sites/My App/ollyflix_streaming_audit/node_modules/puppeteer');
  } catch(e2) {}
}

const PORT = process.env.PORT || 3300;
const BASE_DIR = __dirname;
const CACHE_FILE = path.join(BASE_DIR, 'ad_blocklist_cache.txt');
const REPORT_TXT = path.join(BASE_DIR, 'LATEST_SCAN_REPORT.txt');
const REPORT_JSON = path.join(BASE_DIR, 'LATEST_SCAN_DATA.json');

// ── Known Safe Infrastructure (Never Block) ──────────────────────────────────
const SAFE_INFRA = new Set([
  'google.com', 'gstatic.com', 'googleapis.com', 'fonts.gstatic.com', 'fonts.googleapis.com',
  'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com', 'github.com',
  'tmdb.org', 'themoviedb.org', 'cloudflare.com', 'w3.org', 'jsdelivr.net',
  'hls-js.cdn.cloudflare.com', 'cdn.jsdelivr.net'
]);

// ── Safe Video CDN Patterns ──────────────────────────────────────────────────
const SAFE_CDN_PATTERNS = [
  /tnmr\.org/i, /lulucdn\.com/i, /tapecontent\.net/i, /streamtape\.com/i, /stape\.me/i,
  /hgcloud\.to/i, /vidcloud/i, /vidrock/i, /cloudorchestranova/i, /vsembed/i, /vidfast/i,
  /jwplayer/i, /jwpcdn/i, /jwplatform/i, /vjs\.zencdn/i, /plyr\.io/i, /doodstream/i,
  /mixdrop/i, /upstream/i, /filemoon/i, /fembed/i, /akamaized\.net/i, /fastly\.net/i,
  /jsdelivr/i, /unpkg/i, /tmdb\.org/i, /luxki440das/i, /1xcinema/i, /vyvyd/i,
  /ngcorp\.dad/i, /sprintspeedlight/i, /vidzee/i, /megacloud/i, /rabbitstream/i,
  /jerso441ceg\.com/i, /i-cdn-\d+/i, /cdn\d+\.jerso/i,
  // ── ZXC-Prime ecosystem (confirmed from JS source analysis) ──
  /zxcstream\.icu/i, /zxcstream\.xyz/i, /zxcprime\.xyz/i,
  /vidstuck\.xyz/i,       // Primary ZXC player embed
  /vaplayer\.ru/i,        // ZXC Backup III
  /nextgencloudfabric\.com/i, // Backup embed target
  /vidsrcme\.ru/i,        // ZXC Backup IV
  /vidsrc\.to/i, /vidsrc\.me/i, /vidsrc\.xyz/i,
  /superembed\.stream/i, /multiembed\.mov/i, /2embed\.cc/i, /moviesapi\.club/i,
  /autoembed\.cc/i, /consume\.icu/i
];

// ── Non-Stream Resource Blacklist (never treat these as video streams) ─────────
const NON_STREAM_EXTENSIONS = [
  '.webmanifest', '.manifest', '/favicon', '.ico',
  '.woff', '.woff2', '.ttf', '.css', '.svg', '.png', '.jpg', '.jpeg', '.gif',
  '/gtag/', 'analytics', 'beacon.min.js', '/fonts/', '/icons/',
  'sw.js', 'service-worker', 'workbox'
];

// ── ZXC-Prime Architecture Map (discovered by JS source analysis) ─────────────
// ZXC sites use iframe-based players. Architecture:
// player.zxcprime.xyz → zxcstream.icu/watch/{type}/{id} → iframe: vidstuck.xyz/embed/{type}/{id}
// Backup servers: zxcstream.xyz, vaplayer.ru, vidsrcme.ru
const ZXC_ARCHITECTURE = {
  domains: ['player.zxcprime.xyz', 'zxcstream.icu', 'zxcstream.xyz'],
  // Primary embed URL pattern
  primaryEmbed: (type, id) => `https://vidstuck.xyz/embed/${type}/${id}?back=false&loading=2`,
  // Backup embed patterns
  backups: [
    (type, id) => `https://zxcstream.xyz/player/${type}/${id}`,
    (type, id) => `https://vaplayer.ru/embed/${type}/${id}`,
    (type, id) => `https://vidsrcme.ru/embed/${type}/${id}`,
  ],
  // Database API (for metadata only)
  detailsApi: (type, id, lang) => `https://zxcstream.icu/database/details/${type}/${id}?image=1&language=${lang || 'en-US'}`,
  // Watch page
  watchPage: (type, id, lang) => `https://zxcstream.icu/watch/${type}/${id}?lang=${lang || 'hi-IN'}`,
};

// ── Categorized Ad Network Intelligence DB ────────────────────────────────────
const AD_CATEGORIES = {
  BETTING_CASINO: {
    name: '🎰 Gambling & Betting Ads',
    patterns: ['1xbet', 'melbet', 'bet365', 'parimatch', 'casino', 'betwinner', 'mostbet', 'linebet', 'megapari', 'stake.com', 'crashgame', 'aviator', 'spinomenal']
  },
  ADULT_DATING: {
    name: '🔞 Adult & Dating Redirects',
    patterns: ['exoclick', 'juicyads', 'chaturbate', 'stripchat', 'bongacams', 'livejasmin', 'fleshlight', 'tubecorporate', 'ero-advertising', 'trafficjunky', 'camsoda']
  },
  POPUNDER_CLICKJACK: {
    name: '🪟 Popunders & Clickjackers',
    patterns: ['popads', 'popcash', 'clickadu', 'monetag', 'propellerads', 'hilltopads', 'syxylyche', 'ownerthrone', 'popunder', 'onclick', 'onclickperform', 'adsterra', 'displayvertising', 'dh8azcl753e1e', 'stareobjectedcipher', 'zetadeo', 'idiafix']
  },
  MALWARE_PUSH: {
    name: '🚨 Push Ads & Scareware',
    patterns: ['propush', 'notix', 'onesignal', 'advtpe', 'abluvdiscr', 'teniacites', 'llvpn', 'pushnotification', 'cleanmymac', 'your-system-infected', 'system-alert', 'update-browser-now']
  },
  TELEMETRY_TRACKER: {
    name: '🕵️ Stealth Telemetry & Beacons',
    patterns: ['stats.rip', 'umommy', 'argufycopecks', 'battutagalluot', 'cossicsutter', 'beacon.min.js', 'tracking', 'telemetry', 'analytics', 'counter.yadro', 'mc.yandex']
  },
  VAST_VIDEO_ADS: {
    name: '🎬 In-Stream Video Ads (VAST/VMAP)',
    patterns: ['agl001', 'agl002', 'agl003', 'adangle', 'xbeat.space', 'reklama', 'ffb7df5a878b59e42e257c042f54bed2', 'vast', 'vmap', 'adsystem', 'linearad']
  }
};

// ── Global AdBlock Cache Loader ───────────────────────────────────────────────
let globalBlocklistCache = null;

async function loadOrUpdateBlocklist(broadcast = null) {
  if (globalBlocklistCache) return globalBlocklistCache;
  const blocklist = new Set();

  let needsDownload = true;
  if (fs.existsSync(CACHE_FILE)) {
    const stats = fs.statSync(CACHE_FILE);
    const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
    if (ageHours < 168 && stats.size > 100000) {
      needsDownload = false;
    }
  }

  if (needsDownload) {
    if (broadcast) broadcast({ type: 'log', level: 'info', msg: '🌐 Downloading live world-class AdBlock list (StevenBlack hosts)...' });
    try {
      await new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(CACHE_FILE);
        https.get('https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts', { timeout: 15000 }, res => {
          if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
          res.pipe(fileStream);
          fileStream.on('finish', () => { fileStream.close(); resolve(); });
        }).on('error', err => {
          try { fs.unlinkSync(CACHE_FILE); } catch(e) {}
          reject(err);
        });
      });
      if (broadcast) broadcast({ type: 'log', level: 'success', msg: '✅ Live StevenBlack database loaded (150k+ domains)!' });
    } catch(e) {
      if (broadcast) broadcast({ type: 'log', level: 'warn', msg: `⚠️ StevenBlack download skipped (${e.message}), using fallback heuristic rules.` });
    }
  }

  if (fs.existsSync(CACHE_FILE)) {
    try {
      const content = fs.readFileSync(CACHE_FILE, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 2) {
          const dom = parts[1].toLowerCase();
          if (dom !== 'localhost' && !SAFE_INFRA.has(dom)) {
            blocklist.add(dom);
          }
        }
      }
    } catch(e) {}
  }

  globalBlocklistCache = blocklist;
  return blocklist;
}

function getDomain(raw) {
  try {
    const u = raw.startsWith('//') ? 'https:' + raw : raw;
    return new URL(u).hostname.toLowerCase().replace(/^www\./, '');
  } catch(e) { return null; }
}

function matchAdCategory(domainOrUrl) {
  const lower = (domainOrUrl || '').toLowerCase();
  for (const [catKey, catData] of Object.entries(AD_CATEGORIES)) {
    for (const pat of catData.patterns) {
      if (lower.includes(pat)) {
        return { key: catKey, name: catData.name };
      }
    }
  }
  return null;
}

function isSafeCDN(domainOrUrl) {
  return SAFE_CDN_PATTERNS.some(p => p.test(domainOrUrl));
}

// ── Dean Edwards Packer Decoder Helper ─────────────────────────────────────────
function unpackDeanEdwards(code) {
  if (!code || !code.includes('eval(function(p,a,c,k,e,d')) return null;
  try {
    const match = code.match(/}\s*\('(.*)',\s*(\d+),\s*(\d+),\s*'(.*?)'\.split\('\|'\)/s);
    if (!match) return null;
    let [ , p, a, c, k ] = match;
    a = parseInt(a, 10);
    c = parseInt(c, 10);
    const kArr = k.split('|');
    const e = function(c) {
      return (c < a ? '' : e(parseInt(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
    };
    while (c--) {
      if (kArr[c]) {
        p = p.replace(new RegExp('\\b' + e(c) + '\\b', 'g'), kArr[c]);
      }
    }
    return p;
  } catch(err) {
    return null;
  }
}

// ── Active Scan State ─────────────────────────────────────────────────────────
let activeSession = null;

// ── Live Autonomous Audit Engine ──────────────────────────────────────────────
async function runLiveAudit(targetUrl, options = {}, onEvent = () => {}) {
  const startTime = Date.now();
  const session = {
    id: 'scan_' + Date.now(),
    targetUrl,
    status: 'running',
    startedAt: new Date().toISOString(),
    streams: [],           // [{ url, type, status, cdn, headers, isMaster, audioTrack }]
    audioTracks: [],       // [{ language, url, cdn }]
    tvShow: { isTv: false, seasons: [], episodes: [] },
    adsBlocked: [],        // [{ domain, category, reason, sampleUrl, timestamp }]
    popunders: [],         // [{ url, domain, callerStack, timestamp }]
    safeCDNs: new Set(),
    adKeywords: new Set(),
    totalRequests: 0,
    vastXmlCount: 0,
    aborted: false
  };

  let currentScanningAudioLang = 'Default (Original)';
  activeSession = session;

  const broadcast = (data) => {
    onEvent({ ...data, sessionId: session.id, timestamp: new Date().toLocaleTimeString() });
  };

  broadcast({ type: 'status', status: 'started', url: targetUrl });
  broadcast({ type: 'log', level: 'info', msg: `🚀 Initializing Deep AI Behavioral Sandbox for: ${targetUrl}` });

  const onlineBlocklist = await loadOrUpdateBlocklist(broadcast);

  if (!puppeteer) {
    const errMsg = 'Puppeteer is not installed in local environment.';
    broadcast({ type: 'log', level: 'error', msg: `❌ ${errMsg}` });
    broadcast({ type: 'status', status: 'error', error: errMsg });
    return session;
  }

  let browser = null;
  try {
    broadcast({ type: 'log', level: 'info', msg: '🛡️ Activating Stealth Mode & Anti-Bot Evasions (Cloudflare Bypass)...' });

    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--autoplay-policy=no-user-gesture-required',
        '--window-size=1366,768',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');

    // ── Inject Client-Side Stealth & Monkey-Patches (v7.0 Upgraded) ─────────────
    await page.evaluateOnNewDocument(() => {
      // 1. Erase webdriver flag
      delete Object.getPrototypeOf(navigator).webdriver;
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

      // 2. Mock plugins & languages
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en', 'hi'] });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });

      // 3. Mock Chrome object
      window.chrome = {
        runtime: {},
        loadTimes: () => {},
        csi: () => {},
        app: {}
      };

      // 4. Monkey-patch window.open to trap popunders
      const originalOpen = window.open;
      window.open = function(targetUrl, targetName, features) {
        let stack = '';
        try { throw new Error(); } catch(e) { stack = e.stack || ''; }
        console.warn('__OLLYFLIX_POPUP_TRAP__:' + JSON.stringify({
          popupUrl: targetUrl || 'about:blank',
          targetName,
          stack: stack.split('\n').slice(2, 5).join(' -> ').trim()
        }));
        return null;
      };

      // 5. Intercept dynamically created scripts and iframes
      const origCreateElement = document.createElement;
      document.createElement = function(tagName) {
        const el = origCreateElement.call(document, tagName);
        if (tagName.toLowerCase() === 'iframe') {
          setTimeout(() => {
            if (el.src && (el.src.includes('pop') || el.src.includes('ads') || el.src.includes('syx'))) {
              console.warn('__OLLYFLIX_IFRAME_TRAP__:' + el.src);
            }
          }, 0);
        }
        return el;
      };

      // 6. ★ NEW: Intercept fetch() calls to capture streaming API responses ★
      //    This catches Next.js/React sites that load stream URLs via fetch/XHR
      const _origFetch = window.fetch;
      window.fetch = async function(...args) {
        const reqUrl = (typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url)) || '';
        const resp = await _origFetch.apply(this, args);
        try {
          const ct = resp.headers.get('content-type') || '';
          const isStreamResp = reqUrl.includes('.m3u8') || reqUrl.includes('.mpd') ||
                               ct.includes('mpegurl') || ct.includes('dash+xml') ||
                               ct.includes('octet-stream');
          if (isStreamResp) {
            console.warn('__OLLYFLIX_FETCH_STREAM__:' + JSON.stringify({ url: reqUrl, ct }));
          }
          // Also intercept JSON API responses that contain stream URLs
          if (ct.includes('application/json') && !reqUrl.includes('googletagmanager') && !reqUrl.includes('analytics')) {
            const clone = resp.clone();
            clone.text().then(function(text) {
              if ((text.includes('.m3u8') || text.includes('.mpd') || text.includes('stream_url') || text.includes('source_url')) && text.length < 50000) {
                console.warn('__OLLYFLIX_API_JSON__:' + text.substring(0, 3000));
              }
            }).catch(function(){});
          }
        } catch(e) {}
        return resp;
      };

      // 7. ★ NEW: Intercept XMLHttpRequest to catch legacy XHR stream requests ★
      const _XHRopen = XMLHttpRequest.prototype.open;
      const _XHRsend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function(method, url) {
        this.__ollyUrl = url || '';
        return _XHRopen.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function() {
        this.addEventListener('load', function() {
          try {
            const url = this.__ollyUrl || '';
            const ct  = this.getResponseHeader('content-type') || '';
            if (url.includes('.m3u8') || url.includes('.mpd') || ct.includes('mpegurl') || ct.includes('dash')) {
              console.warn('__OLLYFLIX_XHR_STREAM__:' + JSON.stringify({ url, ct }));
            }
            if (ct.includes('application/json') && (this.responseText || '').includes('.m3u8') && (this.responseText || '').length < 50000) {
              console.warn('__OLLYFLIX_API_JSON__:' + (this.responseText || '').substring(0, 3000));
            }
          } catch(e) {}
        });
        return _XHRsend.apply(this, arguments);
      };
    });

    // ── Console Log Interception for Client Traps ─────────────────────────────
    page.on('console', msg => {
      const text = msg.text();
      if (text.startsWith('__OLLYFLIX_POPUP_TRAP__:')) {
        try {
          const data = JSON.parse(text.replace('__OLLYFLIX_POPUP_TRAP__:', ''));
          const dom = getDomain(data.popupUrl) || 'popup.ad';
          const cat = matchAdCategory(dom) || { key: 'POPUNDER_CLICKJACK', name: '🪟 Popunders & Clickjackers' };
          
          session.popunders.push({
            url: data.popupUrl,
            domain: dom,
            callerStack: data.stack,
            timestamp: new Date().toLocaleTimeString()
          });

          session.adsBlocked.push({
            domain: dom,
            category: cat.name,
            reason: `🚨 window.open() Popunder Intercepted | Stack: ${data.stack}`,
            sampleUrl: data.popupUrl,
            timestamp: new Date().toLocaleTimeString()
          });

          broadcast({
            type: 'ad_blocked',
            domain: dom,
            category: cat.name,
            reason: 'Neutralized window.open() Popunder',
            sampleUrl: data.popupUrl
          });
        } catch(e) {}
      } else if (text.startsWith('__OLLYFLIX_IFRAME_TRAP__:')) {
        const ifrUrl = text.replace('__OLLYFLIX_IFRAME_TRAP__:', '');
        const dom = getDomain(ifrUrl);
        if (dom) {
          broadcast({
            type: 'ad_blocked',
            domain: dom,
            category: '🪟 Hidden Ad Iframe in DOM',
            reason: 'Dynamically injected advertising frame',
            sampleUrl: ifrUrl
          });
        }
      } else if (text.startsWith('__OLLYFLIX_FETCH_STREAM__:') || text.startsWith('__OLLYFLIX_XHR_STREAM__:')) {
        // ★ Fetch/XHR intercepted stream URL ★
        try {
          const prefix = text.startsWith('__OLLYFLIX_FETCH_STREAM__:') ? '__OLLYFLIX_FETCH_STREAM__:' : '__OLLYFLIX_XHR_STREAM__:';
          const data = JSON.parse(text.replace(prefix, ''));
          const streamUrl = data.url;
          if (streamUrl && streamUrl.startsWith('http') && !session.streams.some(s => s.url === streamUrl)) {
            const dom = getDomain(streamUrl);
            const streamObj = {
              url: streamUrl, type: 'fetch-intercepted', cdn: dom,
              audioTrack: currentScanningAudioLang,
              headers: { 'Referer': targetUrl, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Origin': new URL(targetUrl).origin },
              isMaster: streamUrl.includes('.m3u8') || streamUrl.includes('.mpd')
            };
            session.streams.push(streamObj);
            session.safeCDNs.add(dom);
            broadcast({ type: 'stream_found', stream: streamObj });
            broadcast({ type: 'log', level: 'success', msg: `🔥 [fetch() Interceptor] Stream Captured: ${streamUrl.substring(0, 90)}` });
          }
        } catch(e) {}
      } else if (text.startsWith('__OLLYFLIX_API_JSON__:')) {
        // ★ Parse JSON API response to find hidden stream URLs ★
        try {
          const jsonText = text.replace('__OLLYFLIX_API_JSON__:', '');
          const m3u8Matches = jsonText.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/gi) || [];
          const mpdMatches  = jsonText.match(/https?:\/\/[^"'\s\\]+\.mpd[^"'\s\\]*/gi) || [];
          const allFound = [...new Set([...m3u8Matches, ...mpdMatches])];
          for (const streamUrl of allFound) {
            if (!session.streams.some(s => s.url === streamUrl)) {
              const dom = getDomain(streamUrl);
              const streamObj = {
                url: streamUrl, type: 'api-json-extracted', cdn: dom,
                audioTrack: currentScanningAudioLang,
                headers: { 'Referer': targetUrl, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Origin': new URL(targetUrl).origin },
                isMaster: true
              };
              session.streams.push(streamObj);
              session.safeCDNs.add(dom);
              broadcast({ type: 'stream_found', stream: streamObj });
              broadcast({ type: 'log', level: 'success', msg: `🧠 [API JSON Parser] Hidden Stream Extracted: ${streamUrl.substring(0, 90)}` });
            }
          }
        } catch(e) {}
      }
    });

    // ── Real-Time Network Interception ────────────────────────────────────────
    await page.setRequestInterception(true);

    page.on('request', req => {
      if (session.aborted) {
        req.abort().catch(() => {});
        return;
      }

      session.totalRequests++;
      const rUrl = req.url();
      const dom = getDomain(rUrl);
      const reqHeaders = req.headers();

      if (!dom) {
        req.continue().catch(() => {});
        return;
      }

      // 1. Check if Ad to Block (HIGHEST PRIORITY)
      const cat = matchAdCategory(rUrl) || matchAdCategory(dom);
      const isKnownAd = (cat !== null) || onlineBlocklist.has(dom);

      if (isKnownAd) {
        const categoryName = cat ? cat.name : '🛑 Online Global AdBlocker Match (StevenBlack)';
        const alreadyLogged = session.adsBlocked.some(a => a.domain === dom);
        if (!alreadyLogged) {
          session.adsBlocked.push({
            domain: dom,
            category: categoryName,
            reason: `Blocked Network Request (${req.resourceType()})`,
            sampleUrl: rUrl,
            timestamp: new Date().toLocaleTimeString()
          });

          broadcast({
            type: 'ad_blocked',
            domain: dom,
            category: categoryName,
            reason: `Blocked Network Request (${req.resourceType()})`,
            sampleUrl: rUrl
          });
        }

        // Add domain keywords for blocking rules
        const parts = dom.split('.');
        for (const p of parts) {
          if (p.length >= 4 && !SAFE_INFRA.has(p) && !['static','assets','player','video','media','https','http','stream'].includes(p)) {
            session.adKeywords.add(p);
          }
        }

        // Immediately abort ad request
        req.abort('blockedbyclient').catch(() => {});
        return;
      }

      // 2. Safe Infrastructure Whitelist
      if (SAFE_INFRA.has(dom) || isSafeCDN(dom)) {
        session.safeCDNs.add(dom);
      }

      // 3. Genuine Media Stream Detection (v7.0 — .webmanifest & static assets excluded)
      const isNonStream = NON_STREAM_EXTENSIONS.some(ext => rUrl.toLowerCase().includes(ext));
      const isStream = !isNonStream && (
                       rUrl.includes('.m3u8') || 
                       rUrl.includes('.mpd') || 
                       rUrl.includes('master.txt') || 
                       rUrl.includes('index.txt') || 
                       (rUrl.includes('.mp4') && !rUrl.includes('/agl/') && !rUrl.includes('chicken') && !rUrl.includes('ads')) || 
                       rUrl.includes('.mkv') || 
                       rUrl.includes('.webm') || 
                       req.resourceType() === 'media');

      if (isStream) {
        const isSubVariant = /\/(360|480|720|1080|240)\/(index\.m3u8|index\.txt)/i.test(rUrl);
        const streamObj = {
          url: rUrl,
          type: req.resourceType(),
          cdn: dom,
          audioTrack: currentScanningAudioLang,
          headers: {
            'User-Agent': reqHeaders['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Referer': reqHeaders['referer'] || targetUrl,
            'Origin': reqHeaders['origin'] || new URL(targetUrl).origin
          },
          isMaster: (rUrl.includes('.m3u8') || rUrl.includes('.mpd') || rUrl.includes('master.txt') || rUrl.includes('index.txt')) && !isSubVariant,
          isVariant: isSubVariant
        };

        const alreadyAdded = session.streams.some(s => s.url === rUrl);
        if (!alreadyAdded) {
          session.streams.push(streamObj);
          session.safeCDNs.add(dom);

          // If this is a master playlist, record it into multi-audio tracks
          if (streamObj.isMaster) {
            const trackExists = session.audioTracks.some(t => t.language.toLowerCase() === currentScanningAudioLang.toLowerCase());
            if (!trackExists) {
              session.audioTracks.push({
                language: currentScanningAudioLang,
                url: rUrl,
                cdn: dom
              });
              broadcast({
                type: 'audio_tracks_found',
                audioTracks: session.audioTracks
              });
            }
          }

          broadcast({
            type: 'stream_found',
            stream: streamObj
          });
          broadcast({
            type: 'log',
            level: 'success',
            msg: `🎯 Extracted ${streamObj.isMaster ? `Master M3U8 [Audio: ${currentScanningAudioLang}]` : (isSubVariant ? 'Quality Track' : 'Direct Media')} [${dom}]: ${rUrl.substring(0, 90)}...`
          });
        }
        req.continue().catch(() => {});
        return;
      }

      req.continue().catch(() => {});
    });

    // ── Response Sniffer for VAST XML & Packed JS ─────────────────────────────
    page.on('response', async res => {
      try {
        const rUrl = res.url();
        const headers = res.headers();
        const ct = (headers['content-type'] || '').toLowerCase();

        // Check for VAST XML Ads
        if (ct.includes('xml') || rUrl.includes('/v/') || rUrl.includes('vast') || rUrl.includes('vmap')) {
          const text = await res.text();
          if (text.includes('<VAST') || text.includes('<AdSystem') || text.includes('<MediaFile')) {
            session.vastXmlCount++;
            const dom = getDomain(rUrl);
            broadcast({
              type: 'log',
              level: 'warn',
              msg: `🎬 VAST In-Stream Ad XML Caught: ${dom}`
            });

            // Extract MediaFiles
            const mfs = text.match(/<MediaFile[^>]*>(https?:\/\/[^<]+)<\/MediaFile>/gi) || [];
            for (const m of mfs) {
              const mfUrl = m.replace(/<[^>]+>/g, '').trim();
              const mDom = getDomain(mfUrl);
              if (mDom) {
                session.adsBlocked.push({
                  domain: mDom,
                  category: '🎬 In-Stream Video Ads (VAST/VMAP)',
                  reason: 'VAST Video Ad MP4 Creative',
                  sampleUrl: mfUrl,
                  timestamp: new Date().toLocaleTimeString()
                });
                broadcast({
                  type: 'ad_blocked',
                  domain: mDom,
                  category: '🎬 In-Stream Video Ads (VAST/VMAP)',
                  reason: 'VAST Video Ad MP4 Creative',
                  sampleUrl: mfUrl
                });
              }
            }
          }
        }

        // Check for Embedded Audio Tracks in Master Playlists
        const isMasterM3u8 = rUrl.includes('.m3u8') || rUrl.includes('master.txt') || rUrl.includes('index.txt');
        if (isMasterM3u8 && !/\/(360|480|720|1080|240)\/(index\.m3u8|index\.txt)/i.test(rUrl)) {
          const text = await res.text();
          const audioMatches = text.match(/#EXT-X-MEDIA:TYPE=AUDIO[^>]*NAME="([^"]+)"/g);
          if (audioMatches && audioMatches.length > 0) {
            const dom = getDomain(rUrl);
            const extractedLangs = [];
            for (const match of audioMatches) {
              const nameMatch = match.match(/NAME="([^"]+)"/);
              if (nameMatch) {
                const langName = nameMatch[1];
                extractedLangs.push(langName);
                const trackExists = session.audioTracks.some(t => t.language.toLowerCase() === langName.toLowerCase() && t.cdn === dom);
                if (!trackExists) {
                  session.audioTracks.push({
                    language: langName,
                    url: rUrl,
                    cdn: dom
                  });
                }
              }
            }
            if (extractedLangs.length > 0) {
               broadcast({
                 type: 'log',
                 level: 'success',
                 msg: `🔊 Extracted ${extractedLangs.length} embedded Audio Track(s) from HLS [${dom}]: ${extractedLangs.join(', ')}`
               });
               broadcast({
                 type: 'audio_tracks_found',
                 audioTracks: session.audioTracks
               });
            }
          }
        }
      } catch(e) {}
    });

    // ── Navigation ────────────────────────────────────────────────────────────
    // ★ v8.0: ZXC-Prime Smart Navigator — goes to the right page directly
    const parsedUrl = new URL(targetUrl);
    const isZXCSite = ZXC_ARCHITECTURE.domains.some(d => parsedUrl.hostname.includes(d) || targetUrl.includes(d));
    
    let actualTargetUrl = targetUrl;
    let zxcEmbedUrl = null;
    
    if (isZXCSite) {
      // Extract TMDB ID and media type from URL
      const tmdbMatch = targetUrl.match(/\/(movie|tv)\/(\d+)/);
      if (tmdbMatch) {
        const mediaType = tmdbMatch[1];
        const tmdbId    = tmdbMatch[2];
        const dubLang   = parsedUrl.searchParams.get('dubLang') || parsedUrl.searchParams.get('lang') || 'hi';
        // Map dubLang param to locale format
        const langLocale = dubLang === 'hi' ? 'hi-IN' : dubLang;
        
        broadcast({ type: 'log', level: 'info', msg: `🎯 [ZXC Navigator] Detected ZXC site! TMDB: ${mediaType}/${tmdbId} | Lang: ${dubLang}` });
        
        // Navigate to zxcstream.icu watch page directly (it's the actual player host)
        actualTargetUrl = ZXC_ARCHITECTURE.watchPage(mediaType, tmdbId, langLocale);
        // Also construct the primary embed URL for direct scanning
        zxcEmbedUrl = ZXC_ARCHITECTURE.primaryEmbed(mediaType, tmdbId);
        
        broadcast({ type: 'log', level: 'info', msg: `🔀 [ZXC Navigator] Navigating to: ${actualTargetUrl}` });
        broadcast({ type: 'log', level: 'info', msg: `📺 [ZXC Navigator] Primary embed target: ${zxcEmbedUrl}` });
        
        session.safeCDNs.add('zxcstream.icu');
        session.safeCDNs.add('vidstuck.xyz');
        session.safeCDNs.add('zxcstream.xyz');
      }
    }
    
    broadcast({ type: 'log', level: 'info', msg: '⏳ Loading target page into sandbox...' });
    try {
      await page.goto(actualTargetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
    } catch(e) {
      broadcast({ type: 'log', level: 'warn', msg: `⚠️ Page load note: ${e.message.slice(0,80)}` });
    }

    // ★ v8.0: Extended wait for SPA hydration. ZXC/vidstuck need 8-10s to initialize.
    const isSPA = isZXCSite || targetUrl.includes('vidsrc') || targetUrl.includes('vidstuck') ||
                  targetUrl.includes('2embed') || targetUrl.includes('superembed') ||
                  targetUrl.includes('multiembed') || targetUrl.includes('moviesapi');
    const initialWait = isSPA ? 9000 : 4000;
    broadcast({ type: 'log', level: 'info', msg: `⏳ Waiting ${initialWait/1000}s for ${isSPA ? 'SPA hydration & iframe player init' : 'dynamic content'}...` });
    await new Promise(r => setTimeout(r, initialWait));

    broadcast({ type: 'log', level: 'info', msg: '🔎 Analyzing DOM for Player Engines & Obfuscated Scripts...' });
    
    // Inspect DOM for Player Configurations (HDVB, PlayerJS, JWPlayer)
    try {
      const pConfig = await page.evaluate(() => {
        if (typeof p3 !== 'undefined') return { engine: 'HDVBPlayer', config: p3 };
        if (typeof window.playerjs !== 'undefined') return { engine: 'PlayerJS', config: window.playerjs };
        return null;
      });
      if (pConfig && pConfig.config) {
        session.playerConfig = pConfig;
        broadcast({
          type: 'log',
          level: 'success',
          msg: `🎬 Detected Host Player Engine: [${pConfig.engine}] Audio Dubbing (Translator ID): "${pConfig.config.translator || 'Default'}", Host: "${pConfig.config.host || 'N/A'}"`
        });
        broadcast({
          type: 'log',
          level: 'info',
          msg: `ℹ️ Audio Architecture: Audio is direct-muxed into HLS video chunks for Translator #${pConfig.config.translator || '2'}.`
        });
      }
    } catch(e) {}
    
    // Inspect DOM for packed scripts
    try {
      const pageScripts = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('script')).map(s => s.innerHTML).filter(Boolean);
      });
      for (const scr of pageScripts) {
        const unpacked = unpackDeanEdwards(scr);
        if (unpacked) {
          broadcast({ type: 'log', level: 'info', msg: '🔓 Decoded Dean Edwards Packed JavaScript!' });
          // Search for hidden streams in unpacked code
          const m3u8Match = unpacked.match(/https?:\/\/[^"'\s]+\.(m3u8|mp4|mkv|webm|avi)[^"'\s]*/gi);
          if (m3u8Match) {
            for (const mUrl of m3u8Match) {
              const dom = getDomain(mUrl);
              const isHls = mUrl.includes('.m3u8');
              const streamObj = {
                url: mUrl,
                type: isHls ? 'media/hls-unpacked' : 'media/direct-unpacked',
                cdn: dom,
                headers: { 'Referer': targetUrl, 'User-Agent': 'Mozilla/5.0' },
                isMaster: isHls
              };
              session.streams.push(streamObj);
              session.safeCDNs.add(dom);
              broadcast({ type: 'stream_found', stream: streamObj });
            }
          }
        }
      }
    } catch(e) {}

    // ── v8.0: ZXC-Prime Full Architecture Handler ─────────────────────────────
    if (isZXCSite && zxcEmbedUrl) {
      broadcast({ type: 'log', level: 'info', msg: '🧠 [ZXC v8] Starting ZXC-specific iframe-based stream extraction...' });
      
      // Step A: Scan the iframes the page loaded
      try {
        const iframes = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('iframe'))
            .map(f => ({ src: f.src, id: f.id, className: f.className }))
            .filter(f => f.src && f.src.startsWith('http'));
        });
        broadcast({ type: 'log', level: 'info', msg: `📺 [ZXC] Found ${iframes.length} iframe(s) in player page` });
        for (const frm of iframes) {
          broadcast({ type: 'log', level: 'info', msg: `📺 [ZXC] Iframe src: ${frm.src}` });
          const fDom = getDomain(frm.src);
          if (fDom) session.safeCDNs.add(fDom);
        }
      } catch(e) {}

      // Step B: Navigate into the vidstuck embed directly (the PRIMARY player)
      broadcast({ type: 'log', level: 'info', msg: `🔀 [ZXC] Navigating INTO primary embed: ${zxcEmbedUrl}` });
      try {
        await page.goto(zxcEmbedUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        broadcast({ type: 'log', level: 'info', msg: '⏳ [ZXC] Waiting 10s for vidstuck embed to load stream...' });
        await new Promise(r => setTimeout(r, 10000));
        
        // Try clicking play in the embed
        try {
          await page.evaluate(() => {
            const v = document.querySelector('video');
            if (v) { v.muted = true; v.play().catch(() => {}); }
            const btn = document.querySelector('.play, .jw-icon-display, .vjs-big-play-button, button[aria-label*="play" i], [class*="play"]');
            if (btn) btn.click();
          });
          await page.mouse.click(640, 360);
        } catch(e) {}
        await new Promise(r => setTimeout(r, 5000));
        
        broadcast({ type: 'log', level: 'success', msg: `✅ [ZXC] Vidstuck embed scanned. Streams found so far: ${session.streams.length}` });
      } catch(e) {
        broadcast({ type: 'log', level: 'warn', msg: `⚠️ [ZXC] Primary embed note: ${e.message.slice(0,80)}` });
      }

      // Step C: Try backup servers if no stream found yet
      if (session.streams.length === 0) {
        broadcast({ type: 'log', level: 'warn', msg: '⚠️ [ZXC] No stream from primary. Trying backup servers...' });
        const tmdbMatch2 = targetUrl.match(/\/(movie|tv)\/(\d+)/);
        if (tmdbMatch2) {
          const [, mediaType2, tmdbId2] = tmdbMatch2;
          const backupUrls = ZXC_ARCHITECTURE.backups.map(fn => fn(mediaType2, tmdbId2));
          for (const bu of backupUrls) {
            if (session.streams.length > 0) break;
            broadcast({ type: 'log', level: 'info', msg: `🔀 [ZXC Backup] Trying: ${bu}` });
            try {
              await page.goto(bu, { waitUntil: 'domcontentloaded', timeout: 20000 });
              await new Promise(r => setTimeout(r, 6000));
              try { await page.mouse.click(640, 360); } catch(e) {}
              await new Promise(r => setTimeout(r, 4000));
              if (session.streams.length > 0) {
                broadcast({ type: 'log', level: 'success', msg: `✅ [ZXC Backup] Stream found via: ${bu}` });
              }
            } catch(e) {
              broadcast({ type: 'log', level: 'warn', msg: `⚠️ [ZXC Backup] ${bu.substring(0,60)}: ${e.message.slice(0,60)}` });
            }
          }
        }
      }
    } else if (isSPA) {
      // Generic SPA extractor for non-ZXC Next.js sites
      broadcast({ type: 'log', level: 'info', msg: '🧠 [SPA Extractor] Scanning for stream API routes...' });
      try {
        const tmdbIdMatch = targetUrl.match(/\/(movie|tv)\/(\d+)/);
        if (tmdbIdMatch) {
          const mediaType = tmdbIdMatch[1];
          const tmdbId = tmdbIdMatch[2];
          const pageUrl2 = new URL(targetUrl);
          const dubLang = pageUrl2.searchParams.get('dubLang') || pageUrl2.searchParams.get('lang') || 'en';
          const apiPatterns = [
            `${pageUrl2.origin}/api/stream?type=${mediaType}&id=${tmdbId}&dubLang=${dubLang}`,
            `${pageUrl2.origin}/api/video?tmdbId=${tmdbId}&type=${mediaType}&lang=${dubLang}`,
            `${pageUrl2.origin}/api/source/${mediaType}/${tmdbId}?lang=${dubLang}`,
          ];
          for (const apiUrl of apiPatterns) {
            try {
              const apiData = await page.evaluate(async (url, ref) => {
                try {
                  const r = await fetch(url, { headers: { 'Referer': ref, 'Accept': 'application/json' } });
                  if (!r.ok) return null;
                  const ct = r.headers.get('content-type') || '';
                  if (!ct.includes('json')) return null;
                  return await r.text();
                } catch(e) { return null; }
              }, apiUrl, targetUrl);
              if (apiData) {
                const m3u8s = (apiData.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/gi) || []);
                for (const su of [...new Set(m3u8s)]) {
                  if (!session.streams.some(s => s.url === su)) {
                    const dom = getDomain(su);
                    const so = { url: su, type: 'spa-api-probe', cdn: dom, audioTrack: currentScanningAudioLang,
                      headers: { 'Referer': targetUrl, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, isMaster: true };
                    session.streams.push(so); session.safeCDNs.add(dom);
                    broadcast({ type: 'stream_found', stream: so });
                    broadcast({ type: 'log', level: 'success', msg: `🎯 [SPA API] Stream found: ${su.substring(0,90)}` });
                  }
                }
              }
            } catch(e) {}
          }
        }
      } catch(e) {
        broadcast({ type: 'log', level: 'warn', msg: `⚠️ SPA extractor note: ${e.message.slice(0, 80)}` });
      }
    }

    // ── Smart Overlay Buster & Real Play Simulation ───────────────────────────
    broadcast({ type: 'log', level: 'info', msg: '🪟 [Smart Overlay Buster] Scanning for transparent ad overlays...' });
    
    const overlaysBusted = await page.evaluate(() => {
      let count = 0;
      const elements = Array.from(document.querySelectorAll('div, a, span, section'));
      for (const el of elements) {
        const style = window.getComputedStyle(el);
        const zIndex = parseInt(style.zIndex, 10);
        const isCovering = (style.position === 'fixed' || style.position === 'absolute') &&
                           (zIndex > 999 || zIndex === 2147483647) &&
                           (el.offsetWidth >= window.innerWidth * 0.5 && el.offsetHeight >= window.innerHeight * 0.5);
        
        if (isCovering) {
          // If it has an onclick or is a giant link, remove it
          el.remove();
          count++;
        }
      }
      return count;
    });

    if (overlaysBusted > 0) {
      broadcast({ type: 'log', level: 'success', msg: `💥 Busted & eliminated ${overlaysBusted} invisible clickjack overlay(s) from DOM!` });
    }

    // Now simulate genuine play button click
    broadcast({ type: 'log', level: 'info', msg: '🎬 Locating real HTML5 Video Play Button...' });
    
    const clickedPlay = await page.evaluate(() => {
      // 1. Try native video tag
      const video = document.querySelector('video');
      if (video) {
        video.muted = true;
        video.play().catch(() => {});
        return 'Native HTML5 <video> element play triggered';
      }

      // 2. Try common player play buttons
      const playBtn = document.querySelector('.jw-display-icon-display, .vjs-big-play-button, button[aria-label*="Play" i], .play, svg[data-icon="play"]');
      if (playBtn) {
        playBtn.click();
        return 'Standard Player Play Button clicked';
      }

      return null;
    });

    if (clickedPlay) {
      broadcast({ type: 'log', level: 'success', msg: `▶️ Play Triggered: ${clickedPlay}` });
    } else {
      // Fallback click center
      try {
        await page.mouse.click(640, 360);
      } catch(e) {}
    }

    // Wait 3s for initial video stream to begin
    await new Promise(r => setTimeout(r, 3000));

    // ── STEP 1: FIRST CHECK IF TV SERIES OR MOVIE ─────────────────────────────
    broadcast({ type: 'log', level: 'info', msg: '🔎 [Media Inspector] Step 1: Checking whether target is a TV Series or a Movie...' });

    let mediaStructure = null;
    try {
      mediaStructure = await page.evaluate(() => {
        const allMe = Array.from(document.querySelectorAll('[me]')).map(el => ({
          me: el.getAttribute('me') || '',
          text: el.innerText.trim()
        })).filter(x => !x.me.startsWith('head_') && x.text);

        // Step 1: Check if Season buttons exist
        const headX = document.querySelector('[me^="head_x-"]') || document.querySelector('[me^="x-"]');
        const isTv = !!(headX && /season/i.test(headX.innerText));

        if (isTv) {
          // TV SERIES: SEASONS -> EPISODES -> AUDIO TRACKS
          const seasons = allMe.filter(x => /^x-\d+/i.test(x.me) && /season/i.test(x.text));
          const episodes = allMe.filter(x => /^xx-\d+/i.test(x.me) && /episode/i.test(x.text));
          const audios = allMe.filter(x => /^xxx-\d+/i.test(x.me));

          return {
            mediaType: 'TV_SERIES',
            isTv: true,
            seasons: seasons.map(s => ({ title: s.text, me: s.me })),
            episodes: episodes.map(e => ({ title: e.text, me: e.me })),
            audios: audios.map(a => ({ title: a.text, me: a.me }))
          };
        } else {
          // MOVIE: STANDALONE FILM (NO SEASONS, NO EPISODES) -> ALL AUDIO TRACKS
          const audios = allMe.filter(x => /^x-\d+/i.test(x.me));

          return {
            mediaType: 'MOVIE',
            isTv: false,
            seasons: [],
            episodes: [],
            audios: audios.map(a => ({ title: a.text, me: a.me }))
          };
        }
      });
    } catch(e) {}

    if (mediaStructure && mediaStructure.isTv) {
      session.mediaType = 'TV_SERIES';
      broadcast({
        type: 'log',
        level: 'info',
        msg: `📺 [TV SERIES IDENTIFIED]: Scanning all ${mediaStructure.seasons.length} Seasons and Episodes hierarchy...`
      });

      const allSeasonsWithEpisodes = [];
      for (let sIdx = 0; sIdx < mediaStructure.seasons.length; sIdx++) {
        const s = mediaStructure.seasons[sIdx];
        try {
          await page.evaluate((meVal) => {
            const el = document.querySelector(`[me="${meVal}"]`);
            if (el) {
              el.click();
              el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            }
          }, s.me);
          await new Promise(r => setTimeout(r, 250));

          const eps = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('[me^="xx-"]'))
              .filter(el => !el.getAttribute('me').startsWith('head_') && el.innerText.trim())
              .map((el, i) => ({
                episodeNumber: i + 1,
                title: el.innerText.trim(),
                me: el.getAttribute('me')
              }));
          });

          allSeasonsWithEpisodes.push({
            seasonNumber: sIdx + 1,
            title: s.title,
            me: s.me,
            episodes: eps
          });
        } catch(e) {}
      }

      // Switch back to Season 1
      if (mediaStructure.seasons[0]) {
        try {
          await page.evaluate((meVal) => {
            const el = document.querySelector(`[me="${meVal}"]`);
            if (el) el.click();
          }, mediaStructure.seasons[0].me);
          await new Promise(r => setTimeout(r, 200));
        } catch(e) {}
      }

      session.tvShow = {
        isTv: true,
        seasons: allSeasonsWithEpisodes,
        episodes: allSeasonsWithEpisodes[0]?.episodes || []
      };

      const totalEps = allSeasonsWithEpisodes.reduce((acc, cur) => acc + (cur.episodes?.length || 0), 0);
      broadcast({
        type: 'log',
        level: 'success',
        msg: `📺 [TV SERIES HIERARCHY COMPLETE]: Scanned ${allSeasonsWithEpisodes.length} Seasons (${totalEps} Total Episodes) & Audio Dubs!`
      });
      broadcast({
        type: 'tv_show_detected',
        tvShow: session.tvShow
      });
    } else {
      session.mediaType = 'MOVIE';
      session.tvShow = { isTv: false, seasons: [], episodes: [] };
      broadcast({
        type: 'log',
        level: 'success',
        msg: `🎬 [STANDALONE MOVIE IDENTIFIED]: No Seasons/Episodes. Found ${mediaStructure ? mediaStructure.audios.length : 0} Audio Language Dubs`
      });
      broadcast({
        type: 'movie_detected',
        tvShow: session.tvShow
      });
    }

    const detectedLanguages = mediaStructure ? mediaStructure.audios : [];

    if (detectedLanguages && detectedLanguages.length > 0) {
      broadcast({
        type: 'log',
        level: 'success',
        msg: `🎉 Detected ${detectedLanguages.length} Audio Language Tracks: [${detectedLanguages.map(l => l.title).join(', ')}]`
      });

      for (let i = 0; i < detectedLanguages.length; i++) {
        const item = detectedLanguages[i];
        currentScanningAudioLang = item.title;
        broadcast({
          type: 'log',
          level: 'info',
          msg: `🔊 Resolving Stream for Audio Track [${i+1}/${detectedLanguages.length}]: ${item.title}...`
        });

        try {
          await page.evaluate((meVal) => {
            const el = document.querySelector(`[me="${meVal}"]`);
            if (el) {
              el.click();
              el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
              el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
              el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            }
          }, item.me);
        } catch(e) {}

        // Allow 2 seconds per audio language for encrypted playlist and stream to load
        await new Promise(r => setTimeout(r, 2000));
      }
      currentScanningAudioLang = detectedLanguages[0]?.title || 'Default Audio';
    } else {
      broadcast({ type: 'log', level: 'info', msg: '🔄 Attempting to click all available Server/CDN buttons...' });
      try {
        await page.evaluate(async () => {
          const elements = Array.from(document.querySelectorAll('button, li, a, span, div.server, [data-server], .tab'));
          const serverBtns = elements.filter(el => {
            const text = (el.innerText || '').toLowerCase().trim();
            const cls = (el.className || '').toLowerCase();
            return (text.includes('server ') || text.includes('vidcloud') || text.includes('upcloud') || 
                   text.includes('mixdrop') || text.includes('stream') || text.includes('vcloud') ||
                   cls.includes('server') || el.hasAttribute('data-server')) && 
                   text.length < 20; // avoid clicking giant containers
          });
          
          for (let btn of serverBtns) {
            try {
              btn.click();
              await new Promise(r => setTimeout(r, 600)); // Short delay to let iframe load
            } catch(e) {}
          }
        });
      } catch(e) {}

      broadcast({ type: 'log', level: 'info', msg: '⏳ Monitoring network for master playlists (10s) to capture all CDNs...' });
      // ★ v7.0: Extended monitoring + retry trigger for SPA sites ★
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 500));
        // At 5s, if no streams found yet, try clicking video element again
        if (i === 10 && session.streams.length === 0) {
          broadcast({ type: 'log', level: 'warn', msg: '⚠️ No streams yet at 5s mark — retrying play trigger...' });
          try {
            await page.evaluate(() => {
              const video = document.querySelector('video');
              if (video) { video.muted = true; video.play().catch(() => {}); }
              const btn = document.querySelector('[class*="play"], [class*="Play"], button[aria-label*="Play" i]');
              if (btn) btn.click();
            });
            await page.mouse.click(683, 400); // Click center-ish
          } catch(e) {}
        }
      }
      if (session.streams.some(s => s.isMaster)) {
        broadcast({ type: 'log', level: 'success', msg: '✅ Master streams captured successfully!' });
      } else if (session.streams.length > 0) {
        broadcast({ type: 'log', level: 'success', msg: '✅ Direct media streams captured!' });
      } else {
        broadcast({ type: 'log', level: 'warn', msg: '⚠️ No streams detected. Site may use DRM or require manual interaction.' });
      }
    }

    await browser.close();
    browser = null;

  } catch(err) {
    broadcast({ type: 'log', level: 'error', msg: `❌ Sandbox Error: ${err.message}` });
  } finally {
    if (browser) {
      try { await browser.close(); } catch(e) {}
    }
  }

  // ── Final Data Consolidation ────────────────────────────────────────────────
  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  session.status = 'completed';
  session.duration = durationSec + 's';
  session.safeCDNs = [...session.safeCDNs].sort();
  session.adKeywords = [...session.adKeywords].sort();

  // Save Text & JSON Reports
  try {
    saveScanReports(session);
  } catch(e) {}

  broadcast({
    type: 'status',
    status: 'completed',
    summary: {
      streamsCount: session.streams.length,
      adsBlockedCount: session.adsBlocked.length,
      popundersCount: session.popunders.length,
      safeCDNsCount: session.safeCDNs.length,
      duration: session.duration
    }
  });

  broadcast({
    type: 'log',
    level: 'success',
    msg: `🏁 Audit finished in ${durationSec}s! Found ${session.streams.length} stream(s) and blocked ${session.adsBlocked.length} ad network(s).`
  });

  return session;
}

function saveScanReports(session) {
  let txt = `==============================================================================\n`;
  txt += `   OLLYFLIX AUTONOMOUS AI AD TRACKER & STREAM RESOLVER REPORT v7.0\n`;
  txt += `==============================================================================\n\n`;
  txt += `Target URL:    ${session.targetUrl}\n`;
  txt += `Scanned Time:  ${session.startedAt}\n`;
  txt += `Duration:      ${session.duration}\n\n`;

  txt += `=== 1. DIRECT PLAYABLE VIDEO & MASTER STREAMS ===\n`;
  if (session.streams.length === 0) {
    txt += `(No direct streams captured)\n`;
  } else {
    for (const s of session.streams) {
      txt += `▶ ${s.url}\n`;
      txt += `  CDN:      ${s.cdn}\n`;
      txt += `  Referer:  ${s.headers.Referer}\n`;
      txt += `  ExoPlayer Format:\n    MediaItem.fromUri("${s.url}")\n    Headers: Referer -> ${s.headers.Referer}\n\n`;
    }
  }

  txt += `\n=== 1.1 ALL AUDIO LANGUAGE TRACKS IDENTIFIED ===\n`;
  if (!session.audioTracks || session.audioTracks.length === 0) {
    txt += `(Standard Single Track)\n`;
  } else {
    for (const t of session.audioTracks) {
      txt += `🔊 [${t.language.padEnd(14)}] -> ${t.url}\n`;
    }
  }

  txt += `\n=== 2. SAFE VIDEO CDNs (NEVER BLOCK) ===\n`;
  for (const cdn of session.safeCDNs) txt += `+ ${cdn}\n`;

  txt += `\n=== 3. AD DOMAINS & TRACKERS DETECTED (BLOCK THESE) ===\n`;
  for (const ad of session.adsBlocked) {
    txt += `• ${ad.domain.padEnd(35)} [${ad.category}] -> ${ad.reason}\n`;
  }

  txt += `\n=== 4. AD KEYWORDS FOR CLOUDFLARE & APP ===\n`;
  txt += JSON.stringify(session.adKeywords, null, 2);

  fs.writeFileSync(REPORT_TXT, txt, 'utf8');

  const jsonData = {
    targetUrl: session.targetUrl,
    startedAt: session.startedAt,
    duration: session.duration,
    tvShow: session.tvShow,
    streams: session.streams,
    audioTracks: session.audioTracks,
    safeCDNs: session.safeCDNs,
    adsBlocked: session.adsBlocked,
    adKeywords: session.adKeywords,
    popunders: session.popunders
  };
  fs.writeFileSync(REPORT_JSON, JSON.stringify(jsonData, null, 2), 'utf8');
}

// ── TV Episode Stream Dynamic Resolver ────────────────────────────────────────
const episodeStreamCache = new Map();

async function resolveEpisodeStream(targetUrl, seasonMe, episodeMe) {
  const cacheKey = `${targetUrl}:${seasonMe}:${episodeMe || ''}`;
  if (episodeStreamCache.has(cacheKey)) {
    return { success: true, stream: episodeStreamCache.get(cacheKey) };
  }

  let browser = null;
  try {
    const launchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--disable-web-security',
        '--autoplay-policy=no-user-gesture-required',
        '--window-size=1280,720'
      ]
    };

    let pptrInstance = puppeteer;
    if (!pptrInstance) {
      try {
        pptrInstance = require('d:/Latest_Updated_Sites/My App/ollyflix_streaming_audit/node_modules/puppeteer');
      } catch(e) {}
    }
    if (!pptrInstance) throw new Error('Puppeteer is not installed or available');

    browser = await pptrInstance.launch(launchOptions);
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 720 });
    await page.setRequestInterception(true);

    let capturedStream = null;
    let shouldCapture = false;

    page.on('request', req => {
      const rUrl = req.url();
      const dom = getDomain(rUrl);
      if (matchAdCategory(rUrl) || (dom && globalBlocklistCache && globalBlocklistCache.has(dom))) {
        req.abort('blockedbyclient').catch(() => {});
        return;
      }
      const isValidStreamUrl = rUrl.includes('.m3u8') || (rUrl.includes('.mp4') && !rUrl.includes('/agl/') && !rUrl.includes('chicken')) || rUrl.includes('.mkv') || rUrl.includes('.webm') || rUrl.includes('.avi');
      if (shouldCapture && isValidStreamUrl && !capturedStream && !/\/(360|480|720|1080|240)\/index\.m3u8/i.test(rUrl)) {
        capturedStream = {
          url: rUrl,
          cdn: dom,
          headers: {
            'User-Agent': req.headers()['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Referer': req.headers()['referer'] || targetUrl,
            'Origin': req.headers()['origin'] || new URL(targetUrl).origin
          }
        };
      }
      req.continue().catch(() => {});
    });

    // CRITICAL FIX: Use 'domcontentloaded' — NOT 'networkidle2'
    // networkidle2 freezes forever on HLS streaming pages with persistent connections
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2500));

    shouldCapture = true;

    // Click Season
    if (seasonMe) {
      await page.evaluate((meVal) => {
        const el = document.querySelector(`[me="${meVal}"]`);
        if (el) {
          el.click();
          el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }
      }, seasonMe);
      await new Promise(r => setTimeout(r, 800));
    }

    // Click Episode
    if (episodeMe) {
      await page.evaluate((meVal) => {
        const el = document.querySelector(`[me="${meVal}"]`);
        if (el) {
          el.click();
          el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }
      }, episodeMe);
      await new Promise(r => setTimeout(r, 1500));
    }

    await browser.close();
    browser = null;

    if (capturedStream) {
      episodeStreamCache.set(cacheKey, capturedStream);
      return { success: true, stream: capturedStream };
    } else {
      return { success: false, error: 'No direct stream (m3u8/mp4/mkv/etc) captured for this episode' };
    }
  } catch(err) {
    if (browser) try { await browser.close(); } catch(e) {}
    return { success: false, error: err.message };
  }
}

// ── Web Dashboard Frontend HTML ───────────────────────────────────────────────
function getDashboardHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OllyFlix AI Live Ad Tracker & Stream Sniffer v6.0 PRO</title>
  <!-- Google Fonts: Inter & JetBrains Mono -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <!-- HLS.js for Built-in Live Player -->
  <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
  <style>
    :root {
      --bg: #060811;
      --card-bg: rgba(13, 19, 36, 0.78);
      --card-border: rgba(255, 255, 255, 0.08);
      --primary: #00f2fe;
      --primary-hover: #38bdf8;
      --primary-glow: rgba(0, 242, 254, 0.3);
      --secondary: #8b5cf6;
      --secondary-glow: rgba(139, 92, 246, 0.3);
      --success: #10b981;
      --danger: #ef4444;
      --warning: #f59e0b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --terminal-bg: #030712;
      --glass-highlight: rgba(255, 255, 255, 0.05);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      background: radial-gradient(circle at 50% -10%, #1e1b4b 0%, #0a0d1a 45%, var(--bg) 100%);
      color: var(--text);
      font-family: 'Plus Jakarta Sans', sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
    }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: rgba(0,0,0,0.3); }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--primary); }

    /* Header */
    header {
      padding: 1.1rem 2.5rem;
      border-bottom: 1px solid var(--card-border);
      backdrop-filter: blur(20px);
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 100;
      background: rgba(6, 8, 17, 0.85);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 0.85rem;
    }

    .brand-icon {
      width: 44px;
      height: 44px;
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      box-shadow: 0 0 25px var(--primary-glow);
    }

    .brand-title {
      font-size: 1.3rem;
      font-weight: 800;
      letter-spacing: -0.5px;
      background: linear-gradient(90deg, #ffffff, #94a3b8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .badge-pro {
      font-size: 0.7rem;
      padding: 0.2rem 0.6rem;
      border-radius: 999px;
      background: linear-gradient(135deg, rgba(0,242,254,0.15), rgba(139,92,246,0.15));
      border: 1px solid var(--primary);
      color: var(--primary);
      font-weight: 800;
      letter-spacing: 0.5px;
    }

    .status-pill {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      font-size: 0.85rem;
      padding: 0.45rem 1rem;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(10px);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--success);
      box-shadow: 0 0 10px var(--success);
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.3; transform: scale(1.3); }
    }

    main {
      flex: 1;
      padding: 2rem 2.5rem;
      max-width: 1600px;
      margin: 0 auto;
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 2rem;
    }

    /* URL Input Hero */
    .hero-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 1.5rem 1.75rem;
      backdrop-filter: blur(20px);
      box-shadow: 0 20px 50px rgba(0,0,0,0.5);
      position: relative;
      overflow: hidden;
    }

    .hero-card::before {
      content: '';
      position: absolute;
      top: -50%;
      right: -20%;
      width: 400px;
      height: 400px;
      background: radial-gradient(circle, var(--primary-glow) 0%, transparent 70%);
      pointer-events: none;
    }

    .input-wrapper {
      display: flex;
      gap: 0.75rem;
      align-items: center;
    }

    .url-input-box {
      flex: 1;
      position: relative;
      display: flex;
      align-items: center;
    }

    .url-input {
      width: 100%;
      background: rgba(3, 7, 18, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 14px;
      padding: 1rem 7.5rem 1rem 1.25rem;
      color: #fff;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.95rem;
      outline: none;
      transition: all 0.25s;
    }

    .url-input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 25px var(--primary-glow);
    }

    .input-actions {
      position: absolute;
      right: 0.6rem;
      display: flex;
      gap: 0.4rem;
    }

    .btn-action {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #cbd5e1;
      padding: 0.45rem 0.75rem;
      border-radius: 9px;
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.35rem;
      transition: all 0.2s;
    }

    .btn-action:hover {
      background: rgba(255, 255, 255, 0.16);
      color: #fff;
      transform: translateY(-1px);
    }

    .btn {
      padding: 0.95rem 1.75rem;
      border-radius: 14px;
      border: none;
      font-weight: 700;
      font-size: 0.95rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      transition: all 0.25s;
      white-space: nowrap;
    }

    .btn-primary {
      background: linear-gradient(135deg, var(--primary), #0284c7);
      color: #030712;
      box-shadow: 0 4px 25px var(--primary-glow);
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 30px rgba(0, 242, 254, 0.5);
    }

    .btn-danger {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid var(--danger);
      color: #fca5a5;
    }

    .btn-danger:hover {
      background: var(--danger);
      color: #fff;
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1.25rem;
    }

    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 18px;
      padding: 1.4rem;
      backdrop-filter: blur(16px);
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      position: relative;
      overflow: hidden;
      transition: transform 0.2s;
    }

    .stat-card:hover { transform: translateY(-3px); }

    .stat-card::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: var(--accent, var(--primary));
    }

    .stat-label {
      font-size: 0.85rem;
      color: var(--text-muted);
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .stat-value {
      font-size: 2.2rem;
      font-weight: 800;
      letter-spacing: -1px;
    }

    /* Split Dashboard */
    .dashboard-split {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2rem;
    }

    @media (max-width: 1100px) {
      .dashboard-split { grid-template-columns: 1fr; }
    }

    /* Panel Card */
    .panel {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 22px;
      padding: 1.75rem;
      backdrop-filter: blur(20px);
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 0.85rem;
    }

    .panel-title {
      font-size: 1.15rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    /* Live Terminal Console */
    .terminal-container {
      background: var(--terminal-bg);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 1.1rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.82rem;
      height: 540px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
    }

    .log-line {
      line-height: 1.5;
      word-break: break-all;
    }

    .log-time { color: #64748b; margin-right: 0.5rem; }
    .log-info { color: #93c5fd; }
    .log-success { color: #86efac; font-weight: 600; }
    .log-warn { color: #fde047; }
    .log-error { color: #fca5a5; font-weight: 700; }

    /* Tabs */
    .tabs-nav {
      display: flex;
      gap: 0.5rem;
      background: rgba(0, 0, 0, 0.4);
      padding: 0.4rem;
      border-radius: 14px;
      border: 1px solid var(--card-border);
    }

    .tab-btn {
      flex: 1;
      padding: 0.7rem 1rem;
      border-radius: 10px;
      border: none;
      background: transparent;
      color: var(--text-muted);
      font-weight: 700;
      font-size: 0.88rem;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
    }

    .tab-btn.active {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    }

    .tab-pane {
      display: none;
      flex-direction: column;
      gap: 1.25rem;
      min-height: 480px;
    }

    .tab-pane.active { display: flex; }

        /* ═══════════════════════════════════════════════════════════════
       ULTRA PREMIUM PLYR-INSPIRED CINEMA PLAYER
       ═══════════════════════════════════════════════════════════════ */

    /* ── Root wrapper ── */
    .plx-wrap {
      position: relative; width: 100%; background: #000; border-radius: 10px;
      overflow: hidden; aspect-ratio: 16/9; user-select: none;
      box-shadow: 0 8px 32px rgba(0,0,0,0.7);
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    }
    .plx-wrap:fullscreen, .plx-wrap:-webkit-full-screen {
      border-radius: 0; aspect-ratio: auto; max-height: 100vh;
    }
    .plx-video {
      position: absolute; inset: 0; width: 100%; height: 100%;
      object-fit: contain; display: block; background: #000;
    }

    /* ── Controls overlay ── */
    .plx-overlay {
      position: absolute; inset: 0; display: flex; flex-direction: column;
      justify-content: flex-end;
      background: linear-gradient(transparent 35%, rgba(0,0,0,0.15) 60%, rgba(0,0,0,0.85) 100%);
      transition: opacity 0.3s ease; z-index: 5; pointer-events: none;
    }
    .plx-wrap.plx-hidden .plx-overlay { opacity: 0; }
    .plx-overlay > * { pointer-events: all; }

    /* ── Title top bar ── */
    .plx-top {
      position: absolute; top: 0; left: 0; right: 0;
      padding: 14px 16px; display: flex; align-items: center; gap: 10px;
      background: linear-gradient(rgba(0,0,0,0.7), transparent);
      pointer-events: none;
    }
    .plx-title {
      color: #fff; font-size: 0.95rem; font-weight: 600;
      text-shadow: 0 1px 3px rgba(0,0,0,0.8); flex: 1;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .plx-badge {
      background: rgba(255,255,255,0.15); color: #fff;
      font-size: 0.65rem; font-weight: 700; padding: 2px 7px;
      border-radius: 4px; border: 1px solid rgba(255,255,255,0.25);
      backdrop-filter: blur(4px); letter-spacing: 0.5px;
    }

    /* ── Spinner ── */
    .plx-spinner {
      position: absolute; inset: 0; display: none; align-items: center;
      justify-content: center; z-index: 8; pointer-events: none;
    }
    .plx-spinner-ring {
      width: 46px; height: 46px;
      border: 4px solid rgba(255,255,255,0.15);
      border-top-color: #fff; border-radius: 50%;
      animation: plxSpin 0.75s linear infinite;
    }
    @keyframes plxSpin { to { transform: rotate(360deg); } }

    /* ── Seek Flash ── */
    .plx-flash {
      position: absolute; top: 50%; transform: translateY(-50%);
      display: flex; align-items: center; justify-content: center; flex-direction: column;
      gap: 6px; color: #fff; font-size: 0.85rem; font-weight: 600;
      pointer-events: none; opacity: 0; transition: opacity 0.2s; z-index: 9;
      width: 80px; height: 80px; border-radius: 50%; background: rgba(255,255,255,0.12);
      backdrop-filter: blur(4px);
    }
    .plx-flash.plx-fl { left: 15%; }
    .plx-flash.plx-fr { right: 15%; }
    .plx-flash.show { opacity: 1; }
    .plx-flash svg { width: 28px; height: 28px; fill: currentColor; }

    /* ── Bottom controls ── */
    .plx-bottom { padding: 0 12px 10px 12px; display: flex; flex-direction: column; gap: 4px; }

    /* Progress bar */
    .plx-prog-wrap {
      width: 100%; height: 18px; position: relative; cursor: pointer;
      display: flex; align-items: center;
    }
    .plx-prog-track {
      width: 100%; height: 3px; background: rgba(255,255,255,0.3);
      border-radius: 2px; position: relative; transition: height 0.15s ease;
    }
    .plx-prog-wrap:hover .plx-prog-track { height: 5px; }
    .plx-prog-buf {
      position: absolute; left: 0; top: 0; height: 100%;
      background: rgba(255,255,255,0.45); border-radius: inherit; pointer-events: none;
    }
    .plx-prog-played {
      position: absolute; left: 0; top: 0; height: 100%;
      background: #fff; border-radius: inherit; pointer-events: none;
    }
    .plx-prog-thumb {
      position: absolute; right: -6px; top: 50%;
      transform: translateY(-50%) scale(0);
      width: 13px; height: 13px; background: #fff; border-radius: 50%;
      transition: transform 0.15s cubic-bezier(0.4,0,0.2,1);
      box-shadow: 0 0 4px rgba(0,0,0,0.6);
    }
    .plx-prog-wrap:hover .plx-prog-thumb { transform: translateY(-50%) scale(1); }
    .plx-time-tip {
      position: absolute; bottom: 22px; left: 0; transform: translateX(-50%);
      background: rgba(15,15,15,0.9); color: #fff; font-size: 0.75rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      padding: 3px 7px; border-radius: 4px; pointer-events: none; opacity: 0;
      white-space: nowrap; border: 1px solid rgba(255,255,255,0.1);
    }
    .plx-prog-wrap:hover .plx-time-tip { opacity: 1; }

    /* Bottom row */
    .plx-row { display: flex; align-items: center; justify-content: space-between; }
    .plx-left { display: flex; align-items: center; gap: 2px; }
    .plx-right { display: flex; align-items: center; gap: 2px; }

    /* Buttons */
    .plx-btn {
      background: transparent; border: none; color: #fff; cursor: pointer;
      width: 38px; height: 38px; border-radius: 5px;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s; outline: none; opacity: 0.9; flex-shrink: 0;
    }
    .plx-btn:hover { background: rgba(255,255,255,0.18); opacity: 1; }
    .plx-btn svg { width: 22px; height: 22px; fill: currentColor; pointer-events: none; }

    /* Volume slider */
    .plx-vol-group {
      display: flex; align-items: center; gap: 2px;
      max-width: 38px; overflow: hidden;
      transition: max-width 0.3s cubic-bezier(0.4,0,0.2,1);
    }
    .plx-vol-group:hover { max-width: 140px; }
    .plx-vol-slider {
      width: 72px; height: 3px; -webkit-appearance: none;
      background: rgba(255,255,255,0.3); border-radius: 2px; cursor: pointer;
      margin-right: 8px; flex-shrink: 0;
    }
    .plx-vol-slider::-webkit-slider-thumb {
      -webkit-appearance: none; width: 12px; height: 12px;
      border-radius: 50%; background: #fff; cursor: pointer;
    }

    /* Time display */
    .plx-time {
      font-size: 0.82rem; color: rgba(255,255,255,0.9);
      font-variant-numeric: tabular-nums; white-space: nowrap; margin-left: 6px;
    }
    .plx-time-sep { opacity: 0.45; margin: 0 3px; }

    /* ── Menus ── */
    .plx-menu {
      position: absolute; bottom: 62px; right: 10px;
      background: rgba(18,18,22,0.97); border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px; width: 250px; color: #fff; display: none;
      flex-direction: column; z-index: 20;
      box-shadow: 0 12px 40px rgba(0,0,0,0.6); backdrop-filter: blur(10px);
      transform-origin: bottom right;
      animation: plxMenuIn 0.18s cubic-bezier(0.16,1,0.3,1);
    }
    @keyframes plxMenuIn {
      from { opacity: 0; transform: translateY(8px) scale(0.96); }
      to   { opacity: 1; transform: translateY(0)  scale(1);    }
    }
    .plx-menu.open { display: flex; }

    .plx-menu-head {
      display: flex; align-items: center; padding: 11px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.08); font-weight: 600; font-size: 0.92rem;
    }
    .plx-menu-head-title { flex: 1; display: flex; align-items: center; gap: 7px; }
    .plx-menu-head-title svg { width: 17px; height: 17px; fill: currentColor; }
    .plx-menu-xbtn {
      background: none; border: none; color: #888; cursor: pointer;
      display: flex; align-items: center; padding: 3px; border-radius: 3px; transition: 0.15s;
    }
    .plx-menu-xbtn svg { width: 18px; height: 18px; fill: currentColor; }
    .plx-menu-xbtn:hover { color: #fff; background: rgba(255,255,255,0.1); }

    .plx-menu-body { max-height: 320px; overflow-y: auto; padding: 6px; }
    .plx-menu-body::-webkit-scrollbar { width: 5px; }
    .plx-menu-body::-webkit-scrollbar-thumb { background: #333; border-radius: 5px; }

    .plx-menu-section {
      padding: 7px 12px 3px; color: #888; font-size: 0.7rem;
      font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px;
    }
    .plx-menu-item {
      padding: 9px 12px; display: flex; align-items: center;
      justify-content: space-between; cursor: pointer; color: #ddd;
      border-radius: 4px; font-size: 0.88rem; transition: background 0.12s; gap: 8px;
    }
    .plx-menu-item:hover { background: rgba(255,255,255,0.12); color: #fff; }
    .plx-menu-item.sel { background: rgba(255,255,255,0.1); color: #fff; font-weight: 500; }
    .plx-menu-dot {
      width: 7px; height: 7px; border-radius: 50%; background: #fff;
      display: inline-block; flex-shrink: 0;
    }

    /* Season select in episodes menu */
    .plx-season-sel {
      background: rgba(255,255,255,0.07); color: #fff;
      border: 1px solid rgba(255,255,255,0.12); padding: 9px 11px;
      border-radius: 5px; width: 100%; outline: none; font-size: 0.88rem;
      font-weight: 600; cursor: pointer; transition: border-color 0.15s;
    }
    .plx-season-sel:hover { border-color: rgba(255,255,255,0.3); }
    .plx-season-sel option { background: #1c1c1c; color: #fff; }

    /* ── Episodes Sidebar (Theater Mode) ── */
    .plx-theater {
      position: relative;
      display: flex; width: 100%; gap: 0;
      border-radius: 10px; overflow: hidden;
      background: #0d0d0d; border: 1px solid rgba(255,255,255,0.07);
    }
    .plx-theater.has-sidebar {
      padding-right: 300px;
    }
    .plx-theater-player { flex: 1; position: relative; min-width: 0; }
    .plx-sidebar {
      position: absolute; right: 0; top: 0; bottom: 0; height: 100%;
      width: 300px; flex-shrink: 0; background: #111115;
      border-left: 1px solid rgba(255,255,255,0.06);
      display: none; flex-direction: column;
    }
    @media (max-width: 768px) {
      .plx-theater.has-sidebar { padding-right: 0; padding-bottom: 300px; }
      .plx-sidebar { top: auto; bottom: 0; left: 0; width: 100%; height: 300px; border-left: none; border-top: 1px solid rgba(255,255,255,0.06); }
    }
    .plx-sidebar.visible { display: flex; }
    .plx-sidebar-head {
      padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.06); flex-shrink: 0;
    }
    .plx-sidebar-head select {
      width: 100%; background: rgba(255,255,255,0.06); color: #fff;
      border: 1px solid rgba(255,255,255,0.1); padding: 9px 11px;
      border-radius: 6px; outline: none; font-size: 0.88rem; font-weight: 600;
      cursor: pointer; transition: border-color 0.15s;
    }
    .plx-sidebar-head select:hover { border-color: rgba(255,255,255,0.25); }
    .plx-sidebar-head select option { background: #1a1a1f; color: #fff; }
    .plx-ep-list { flex: 1; overflow-y: auto; padding: 10px; }
    .plx-ep-list::-webkit-scrollbar { width: 5px; }
    .plx-ep-list::-webkit-scrollbar-thumb { background: #333; border-radius: 5px; }
    .plx-ep-card {
      display: flex; align-items: center; gap: 12px; padding: 10px 10px;
      border-radius: 7px; cursor: pointer; transition: background 0.15s; margin-bottom: 6px;
      border-left: 3px solid transparent;
    }
    .plx-ep-card:hover { background: rgba(255,255,255,0.06); }
    .plx-ep-card.active { background: rgba(255,255,255,0.09); border-left-color: #fff; }
    .plx-ep-num {
      width: 64px; height: 38px; background: rgba(255,255,255,0.08); border-radius: 4px;
      display: flex; align-items: center; justify-content: center; font-size: 0.75rem;
      font-weight: 700; color: #aaa; flex-shrink: 0;
    }
    .plx-ep-card.active .plx-ep-num { background: rgba(255,255,255,0.15); color: #fff; }
    .plx-ep-info h4 { margin: 0 0 3px 0; font-size: 0.85rem; color: #e5e5e5; font-weight: 600; }
    .plx-ep-info span { font-size: 0.73rem; color: #888; }

/* ── Auxiliary selects bar below player ── */

    .player-controls-bar {
      background: rgba(13, 19, 36, 0.98);
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      padding: 0.75rem 1rem;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    }

    .control-select-group {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .control-label {
      font-size: 0.7rem;
      color: var(--text-muted);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .custom-select {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      padding: 0.45rem 0.6rem;
      color: #fff;
      font-size: 0.8rem;
      font-family: inherit;
      outline: none;
      cursor: pointer;
      transition: all 0.2s;
    }

    .custom-select:focus {
      border-color: var(--primary);
      background: rgba(255, 255, 255, 0.1);
    }

    .custom-select option {
      background: #0f172a;
      color: #fff;
    }

    /* Stream Card */
    .stream-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 1.1rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      transition: border-color 0.2s;
    }

    .stream-card:hover {
      border-color: rgba(0, 242, 254, 0.3);
    }

    .stream-url-tag {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.78rem;
      word-break: break-all;
      color: #38bdf8;
      background: rgba(0, 0, 0, 0.4);
      padding: 0.5rem 0.75rem;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.06);
    }

    .tag-row {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .pill {
      font-size: 0.72rem;
      padding: 0.25rem 0.65rem;
      border-radius: 6px;
      font-weight: 700;
    }

    .pill-success { background: rgba(16, 185, 129, 0.15); color: var(--success); border: 1px solid var(--success); }
    .pill-danger { background: rgba(239, 68, 68, 0.15); color: #fca5a5; border: 1px solid var(--danger); }
    .pill-warning { background: rgba(245, 158, 11, 0.15); color: var(--warning); border: 1px solid var(--warning); }
    .pill-purple { background: rgba(139, 92, 246, 0.15); color: #c084fc; border: 1px solid var(--secondary); }
    .pill-blue { background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid #38bdf8; }

    .card-actions-row {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .btn-copy {
      padding: 0.45rem 0.85rem;
      font-size: 0.76rem;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #e2e8f0;
      cursor: pointer;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.35rem;
      transition: all 0.2s;
    }

    .btn-copy:hover {
      background: rgba(255, 255, 255, 0.14);
      color: #fff;
    }

    .btn-play-trigger {
      background: linear-gradient(135deg, rgba(0,242,254,0.2), rgba(139,92,246,0.2));
      border: 1px solid var(--primary);
      color: var(--primary);
    }

    .btn-play-trigger:hover {
      background: var(--primary);
      color: #030712;
    }

    /* Ad Block Table */
    .ad-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.85rem 1.1rem;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--card-border);
      gap: 1rem;
    }

    .ad-domain-title {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.85rem;
      font-weight: 700;
    }

    .ad-reason-sub {
      font-size: 0.74rem;
      color: var(--text-muted);
      margin-top: 0.2rem;
    }

    /* Export Code Block */
    .code-container {
      position: relative;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: #020617;
    }

    .code-header {
      background: rgba(255, 255, 255, 0.04);
      padding: 0.5rem 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    .code-title {
      font-size: 0.8rem;
      font-weight: 700;
      color: #94a3b8;
    }

    .code-box {
      padding: 1rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      color: #38bdf8;
      overflow-x: auto;
      white-space: pre;
      line-height: 1.5;
    }

    /* Floating Toast Notification */
    #toast {
      position: fixed;
      bottom: 2rem;
      right: 2.5rem;
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid var(--primary);
      box-shadow: 0 10px 30px rgba(0, 242, 254, 0.3);
      color: #fff;
      padding: 0.85rem 1.4rem;
      border-radius: 14px;
      font-size: 0.88rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 0.6rem;
      z-index: 999;
      transform: translateY(100px);
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      backdrop-filter: blur(16px);
    }

    #toast.show {
      transform: translateY(0);
      opacity: 1;
    }
  </style>
</head>
<body>

  <!-- Floating Toast -->
  <div id="toast">
    <span>✅</span>
    <span id="toastMsg">Copied to clipboard!</span>
  </div>

  <header>
    <div class="brand">
      <div class="brand-icon">⚡</div>
      <div>
        <div style="display: flex; align-items: center; gap: 0.6rem;">
          <span class="brand-title">OllyFlix Autonomous AI Live Ad Tracker</span>
          <span class="badge-pro">v6.0 PRO</span>
        </div>
      </div>
    </div>
    <div class="status-pill">
      <span class="status-dot" id="liveDot"></span>
      <span id="liveStatusText">Engine Ready</span>
    </div>
  </header>

  <main>
    <!-- URL Input Hero -->
    <div class="hero-card">
      <div class="input-wrapper">
        <div class="url-input-box">
          <input type="text" id="targetUrlInput" class="url-input" placeholder="Paste Embed or Streaming Page URL (e.g. https://hanna427def.com/play/...)" value="" onfocus="this.select()">
          <div class="input-actions">
            <button class="btn-action" onclick="pasteFromClipboard()" title="Paste from Clipboard">
              📋 Paste
            </button>
            <button class="btn-action" onclick="clearUrlInput()" title="Clear URL">
              ✕ Clear
            </button>
          </div>
        </div>
        <button id="startBtn" class="btn btn-primary" onclick="startScan()">
          <span>🚀 Start Live Audit</span>
        </button>
        <button id="stopBtn" class="btn btn-danger" onclick="stopScan()" style="display: none;">
          <span>⏹️ Abort</span>
        </button>
      </div>

      <!-- Quick Preset Selection for Movie vs TV Show -->
      <div style="display: flex; gap: 0.6rem; align-items: center; margin-top: 0.75rem; flex-wrap: wrap;">
        <span style="font-size: 0.78rem; color: var(--text-muted); font-weight: 600;">⚡ Quick Presets:</span>
        <button class="btn-action" style="font-size: 0.76rem; background: rgba(56, 189, 248, 0.12); border-color: rgba(56, 189, 248, 0.3); color: #38bdf8;" onclick="loadPreset('movie')">
          🎬 Movie Preset (ZXC-Prime Hindi)
        </button>
        <button class="btn-action" style="font-size: 0.76rem; background: rgba(139, 92, 246, 0.12); border-color: rgba(139, 92, 246, 0.3); color: #c084fc;" onclick="loadPreset('tv')">
          📺 TV Preset (ZXC-Prime Breaking Bad)
        </button>
        <button class="btn-action" style="font-size: 0.76rem; margin-left: auto;" onclick="loadPreviousScan()" title="Optionally load cached data from last scan">
          📂 Load Previous Scan
        </button>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="stats-grid">
      <div class="stat-card" style="--accent: var(--success);">
        <span class="stat-label">🎬 Clean Playable Streams</span>
        <span class="stat-value" id="valStreams">0</span>
      </div>
      <div class="stat-card" style="--accent: var(--danger);">
        <span class="stat-label">🚫 Ads & Trackers Blocked</span>
        <span class="stat-value" id="valAds">0</span>
      </div>
      <div class="stat-card" style="--accent: var(--warning);">
        <span class="stat-label">🪟 Popunders Neutralized</span>
        <span class="stat-value" id="valPopups">0</span>
      </div>
      <div class="stat-card" style="--accent: var(--primary);">
        <span class="stat-label">🟢 Safe Video CDNs</span>
        <span class="stat-value" id="valCDNs">0</span>
      </div>
    </div>

    <!-- Split Screen: Terminal + Player & Tabs -->
    <div class="dashboard-split">
      
      <!-- Left: Real-time Terminal -->
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">🖥️ Real-time Sandbox Console</span>
          <button class="btn-action" onclick="clearConsole()">Clear Logs</button>
        </div>
        <div class="terminal-container" id="terminal">
          <div class="log-line log-info" id="sysInitLine"><span class="log-time">[SYS]</span> OllyFlix Autonomous Engine initialized. Awaiting target URL...</div>
        </div>
      </div>

      <!-- Right: Interactive Results & Built-in Player -->
      <div class="panel">
        <div class="tabs-nav">
          <button class="tab-btn active" onclick="switchTab('streamsTab')">🎬 Player & Streams</button>
          <button class="tab-btn" onclick="switchTab('adsTab')">🔴 Blocked Ads</button>
          <button class="tab-btn" onclick="switchTab('exportTab')">📋 1-Click Export</button>
        </div>

        <!-- Tab 1: Player & Streams -->
        <div class="tab-pane active" id="streamsTab">
          
                    <!-- ═══ ULTRA PREMIUM CINEMA PLAYER ═══ -->
          <div class="plx-theater" id="plxTheater">
            <!-- Left: Video -->
            <div class="plx-theater-player">
              <div class="plx-wrap" id="plxWrap">

                <video id="plxVideo" class="plx-video" playsinline></video>

                <!-- Spinner -->
                <div class="plx-spinner" id="plxSpinner"><div class="plx-spinner-ring"></div></div>

                <!-- Seek Flash -->
                <div class="plx-flash plx-fl" id="plxFlashL">
                  <svg viewBox="0 0 24 24"><path d="M11 18V6l-8.5 6L11 18zm.5-6l8.5 6V6l-8.5 6z"/></svg>
                  <span id="plxFlashLTxt">-10s</span>
                </div>
                <div class="plx-flash plx-fr" id="plxFlashR">
                  <svg viewBox="0 0 24 24"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>
                  <span id="plxFlashRTxt">+10s</span>
                </div>

                <!-- Title Bar -->
                <div class="plx-top">
                  <span class="plx-title" id="plxTitle">No Stream Selected</span>
                  <span class="plx-badge" id="plxBadge">HLS</span>
                </div>

                <!-- Controls Overlay -->
                <div class="plx-overlay" id="plxOverlay">
                  <div class="plx-bottom">

                    <!-- Progress Bar -->
                    <div class="plx-prog-wrap" id="plxProgWrap"
                         onmousedown="plxProgStart(event)" onmousemove="plxProgMove(event)">
                      <div class="plx-prog-track" id="plxProgTrack">
                        <div class="plx-prog-buf" id="plxBufBar"></div>
                        <div class="plx-prog-played" id="plxPlayedBar" style="width:0%">
                          <div class="plx-prog-thumb"></div>
                        </div>
                      </div>
                      <div class="plx-time-tip" id="plxTimeTip">0:00</div>
                    </div>

                    <!-- Control Row -->
                    <div class="plx-row">
                      <!-- Left controls -->
                      <div class="plx-left">
                        <button class="plx-btn plx-tool" id="plxPlayBtn" onclick="plxTogglePlay()" title="Play/Pause (Space)">
                          <span id="plxPlayIco"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>
                        </button>
                        <button class="plx-btn plx-tool" onclick="plxSeek(-10)" title="Rewind 10s">
                          <svg viewBox="0 0 24 24"><path d="M11 18V6l-8.5 6L11 18zm.5-6 8.5 6V6l-8.5 6z"/></svg>
                        </button>
                        <button class="plx-btn plx-tool" onclick="plxSeek(10)" title="Forward 10s">
                          <svg viewBox="0 0 24 24"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>
                        </button>
                        <div class="plx-vol-group">
                          <button class="plx-btn plx-tool" onclick="plxToggleMute()" title="Mute (M)">
                            <span id="plxMuteIco"><svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg></span>
                          </button>
                          <input class="plx-vol-slider" id="plxVolSlider" type="range" min="0" max="1" step="0.02" value="1" oninput="plxSetVol(this.value)">
                        </div>
                        <span class="plx-time">
                          <span id="plxCurTime">0:00</span>
                          <span class="plx-time-sep">/</span>
                          <span id="plxDurTime">0:00</span>
                        </span>
                      </div>

                      <!-- Right controls -->
                      <div class="plx-right">
                        <button class="plx-btn plx-tool" id="plxEpBtn" onclick="plxToggleMenu('plxEpMenu')" title="Episodes" style="display:none;">
                          <svg viewBox="0 0 24 24"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>
                        </button>
                        <button class="plx-btn plx-tool" onclick="plxToggleMenu('plxAudioMenu')" title="Audio Tracks">
                          <svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                        </button>
                        <button class="plx-btn plx-tool" onclick="plxToggleMenu('plxSettingsMenu')" title="Settings">
                          <svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.21.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
                        </button>
                        <button class="plx-btn plx-tool" onclick="plxPiP()" title="Picture-in-Picture">
                          <svg viewBox="0 0 24 24"><path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 1.98 2 1.98h18c1.1 0 2-.88 2-1.98V5c0-1.1-.9-2-2-2zm0 16.01H3V4.98h18v14.03z"/></svg>
                        </button>
                        <button class="plx-btn plx-tool" onclick="plxFullscreen()" title="Fullscreen (F)">
                          <svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Menus (inside wrap so they appear over video) -->
                <div class="plx-menu" id="plxEpMenu" style="right: 145px;">
                  <div class="plx-menu-head">
                    <span class="plx-menu-head-title"><svg viewBox="0 0 24 24"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg> Episodes</span>
                    <button class="plx-menu-xbtn plx-tool" onclick="plxCloseMenus()"><svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>
                  </div>
                  <div class="plx-menu-body" style="padding: 8px;">
                    <select class="plx-season-sel" id="plxSeasonSel" onchange="plxOnSeasonChange(this.value)"></select>
                    <div id="plxEpItems"></div>
                  </div>
                </div>

                <div class="plx-menu" id="plxAudioMenu" style="right: 90px;">
                  <div class="plx-menu-head">
                    <span class="plx-menu-head-title"><svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg> Audio Tracks</span>
                    <button class="plx-menu-xbtn plx-tool" onclick="plxCloseMenus()"><svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>
                  </div>
                  <div class="plx-menu-body">
                    <div class="plx-menu-section">Select Audio Language</div>
                    <div id="plxAudioItems"><div class="plx-menu-item sel"><span>🔊 Default</span><span class="plx-menu-dot"></span></div></div>
                  </div>
                </div>

                <div class="plx-menu" id="plxSettingsMenu" style="right: 40px; min-width: 220px;">
                  <div class="plx-menu-head">
                    <span class="plx-menu-head-title"><svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.21.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg> Settings</span>
                    <button class="plx-menu-xbtn plx-tool" onclick="plxCloseMenus()"><svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>
                  </div>
                  <div class="plx-menu-body">
                    <div class="plx-menu-item" style="justify-content:space-between;" onclick="plxToggleMenu('plxQualMenu')">
                      <span style="display:flex;align-items:center;gap:10px;"><svg style="width:18px;height:18px;fill:currentColor;" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-8 14H7v-2h4v2zm0-4H7v-2h4v2zm0-4H7V7h4v2zm6 8h-4v-2h4v2zm0-4h-4v-2h4v2zm0-4h-4V7h4v2z"/></svg> Quality</span>
                      <span style="color:#a1a1aa;font-size:0.85rem;" id="lblCurrentQual">Auto &nbsp;&gt;</span>
                    </div>
                    <div class="plx-menu-item" style="justify-content:space-between;" onclick="plxToggleMenu('plxSpeedMenu')">
                      <span style="display:flex;align-items:center;gap:10px;"><svg style="width:18px;height:18px;fill:currentColor;" viewBox="0 0 24 24"><path d="M10 8v8l6-4-6-4zm2-6c-5.52 0-10 4.48-10 10s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg> Playback Speed</span>
                      <span style="color:#a1a1aa;font-size:0.85rem;" id="lblCurrentSpeed">Normal &nbsp;&gt;</span>
                    </div>
                    <div class="plx-menu-item" style="justify-content:space-between;" onclick="plxToggleMenu('plxScaleMenu')">
                      <span style="display:flex;align-items:center;gap:10px;"><svg style="width:18px;height:18px;fill:currentColor;" viewBox="0 0 24 24"><path d="M19 12h-2v3h-3v2h5v-5zM7 9h3V7H5v5h2V9zm14-6H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/></svg> Scale (Aspect)</span>
                      <span style="color:#a1a1aa;font-size:0.85rem;" id="lblCurrentScale">Fit &nbsp;&gt;</span>
                    </div>
                    <div class="plx-menu-item" style="justify-content:space-between;" onclick="plxToggleLoop()">
                      <span style="display:flex;align-items:center;gap:10px;"><svg style="width:18px;height:18px;fill:currentColor;" viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg> Loop Video</span>
                      <span style="color:#a1a1aa;font-size:0.85rem;" id="lblCurrentLoop">Off</span>
                    </div>
                  </div>
                </div>

                <div class="plx-menu" id="plxQualMenu" style="right: 40px; min-width: 220px;">
                  <div class="plx-menu-head" style="cursor:pointer;" onclick="plxToggleMenu('plxSettingsMenu')">
                    <span class="plx-menu-head-title"><svg viewBox="0 0 24 24"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/></svg> Video Quality</span>
                  </div>
                  <div class="plx-menu-body">
                    <div id="plxQualItems"><div class="plx-menu-item sel"><span>⚡ Auto</span><span class="plx-menu-dot"></span></div></div>
                  </div>
                </div>

                <div class="plx-menu" id="plxSpeedMenu" style="right: 40px; min-width: 220px;">
                  <div class="plx-menu-head" style="cursor:pointer;" onclick="plxToggleMenu('plxSettingsMenu')">
                    <span class="plx-menu-head-title"><svg viewBox="0 0 24 24"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/></svg> Playback Speed</span>
                  </div>
                  <div class="plx-menu-body">
                    <div id="plxSpeedItems">
                      <div class="plx-menu-item" onclick="plxSetSpeed(0.5,this)">0.5×</div>
                      <div class="plx-menu-item" onclick="plxSetSpeed(0.75,this)">0.75×</div>
                      <div class="plx-menu-item sel" onclick="plxSetSpeed(1,this)">Normal <span class="plx-menu-dot"></span></div>
                      <div class="plx-menu-item" onclick="plxSetSpeed(1.25,this)">1.25×</div>
                      <div class="plx-menu-item" onclick="plxSetSpeed(1.5,this)">1.5×</div>
                      <div class="plx-menu-item" onclick="plxSetSpeed(2,this)">2.0×</div>
                    </div>
                  </div>
                </div>

                <div class="plx-menu" id="plxScaleMenu" style="right: 40px; min-width: 220px;">
                  <div class="plx-menu-head" style="cursor:pointer;" onclick="plxToggleMenu('plxSettingsMenu')">
                    <span class="plx-menu-head-title"><svg viewBox="0 0 24 24"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/></svg> Scale (Aspect)</span>
                  </div>
                  <div class="plx-menu-body">
                    <div id="plxScaleItems">
                      <div class="plx-menu-item sel" onclick="plxSetScale('contain', 'Fit', this)">Fit (Default) <span class="plx-menu-dot"></span></div>
                      <div class="plx-menu-item" onclick="plxSetScale('fill', 'Stretch', this)">Stretch (Fill)</div>
                      <div class="plx-menu-item" onclick="plxSetScale('cover', 'Zoom', this)">Zoom (Crop)</div>
                    </div>
                  </div>
                </div>

              </div><!-- /plxWrap -->
            </div><!-- /plx-theater-player -->

            <!-- Right: Episodes Sidebar -->
            <div class="plx-sidebar" id="plxSidebar">
              <div class="plx-sidebar-head">
                <select id="vpSeasonSelect" onchange="onSeasonChangeCustom(this.value)"></select>
              </div>
              <div class="plx-ep-list" id="vpEpisodeItems"></div>
            </div>

          </div><!-- /plx-theater -->
          <!-- ═══ END ULTRA PREMIUM CINEMA PLAYER ═══ -->


                    <!-- Auxiliary Quick Selectors (Synchronized with Media3) -->
          <div class="player-controls-bar">
            <!-- TV Show Season & Episode Selectors -->
            <div class="control-select-group" id="seasonGroup" style="display: none;">
              <span class="control-label">Season</span>
              <select id="seasonSelect" class="custom-select" onchange="onSeasonChange(this.value)">
                <option value="1">Season 1</option>
              </select>
            </div>

            <div class="control-select-group" id="episodeGroup" style="display: none;">
              <span class="control-label">Episode</span>
              <select id="episodeSelect" class="custom-select" onchange="onEpisodeChange(this.value)">
                <option value="1">Episode 1</option>
              </select>
            </div>

            <div class="control-select-group">
              <span class="control-label">Quality Track</span>
              <select id="qualitySelect" class="custom-select" onchange="onQualityChange(this.value)">
                <option value="-1">Auto (Optimal)</option>
              </select>
            </div>

            <div class="control-select-group">
              <span class="control-label">Audio Track</span>
              <select id="audioSelect" class="custom-select" onchange="onAudioChange(this.value)">
                <option value="-1">🔊 Hindi Dub / Default Audio (Track 1 - Active)</option>
              </select>
            </div>

            <div class="control-select-group">
              <span class="control-label">Subtitles</span>
              <select id="subtitleSelect" class="custom-select" onchange="onSubtitleChange(this.value)">
                <option value="-1">Off</option>
              </select>
            </div>

            <div class="control-select-group">
              <span class="control-label">Speed</span>
              <select id="speedSelect" class="custom-select" onchange="onSpeedChange(this.value)">
                <option value="0.75">0.75x</option>
                <option value="1" selected>1.0x (Normal)</option>
                <option value="1.25">1.25x</option>
                <option value="1.5">1.5x</option>
                <option value="2">2.0x</option>
              </select>
            </div>
          </div>

          <!-- Streams List -->
          <div id="streamsList" style="display: flex; flex-direction: column; gap: 0.85rem; max-height: 280px; overflow-y: auto;">
            <div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 2rem;">
              No streams captured yet. Click "Start Live Audit" to extract clean streams.
            </div>
          </div>
        </div>

        <!-- Tab 2: Blocked Ads -->
        <div class="tab-pane" id="adsTab">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 0.85rem; color: var(--text-muted);">List of blocked advertising scripts, popups, and VAST video ads:</span>
            <button class="btn-copy" onclick="copyAllBlockedDomains()">📋 Copy All Domains</button>
          </div>
          <div id="adsList" style="display: flex; flex-direction: column; gap: 0.6rem; max-height: 480px; overflow-y: auto;">
            <div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 2rem;">
              No ads blocked yet.
            </div>
          </div>
        </div>

        <!-- Tab 3: 1-Click Code Exporter -->
        <div class="tab-pane" id="exportTab" style="max-height: 520px; overflow-y: auto;">
          
          <div class="code-container">
            <div class="code-header">
              <span class="code-title">📱 Android ExoPlayer Kotlin Code:</span>
              <button class="btn-copy" onclick="copySnippet('exoCode')">📋 Copy ExoPlayer</button>
            </div>
            <div class="code-box" id="exoCode">// Run scan to generate complete ExoPlayer setup with headers</div>
          </div>

          <div class="code-container">
            <div class="code-header">
              <span class="code-title">🖥️ VLC / FFmpeg Lossless Stream Command:</span>
              <button class="btn-copy" onclick="copySnippet('ffmpegCode')">📋 Copy Command</button>
            </div>
            <div class="code-box" id="ffmpegCode"># Run scan to generate command</div>
          </div>

          <div class="code-container">
            <div class="code-header">
              <span class="code-title">☁️ Cloudflare / AdBlock Keywords Rule:</span>
              <button class="btn-copy" onclick="copySnippet('keywordsCode')">📋 Copy Keywords</button>
            </div>
            <div class="code-box" id="keywordsCode">[]</div>
          </div>

        </div>

      </div>

    </div>
  </main>


  <!-- HLS.js Engine -->
  <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
  <script>
    var currentActiveEpTitle = "";

    let evtSource = null;
    let currentStreams = [];
    let currentAds = [];
    let currentAudioTracks = [];
    let currentHlsInstance = null;
    let currentActiveStream = null;
    let currentTvShow = null;

    // TMDB API Key for Title Fetching
    const TMDB_API_KEY = '15d2ea6d0dc1d476efbca3eba2b9bbfb';

    async function fetchTmdbTitle(url) {
      if (!url) return null;
      var imdbMatch = url.match(/(tt\d+)/);
      if (imdbMatch) {
         try {
           let res = await fetch('https://api.themoviedb.org/3/find/' + imdbMatch[1] + '?external_source=imdb_id&api_key=' + TMDB_API_KEY);
           let data = await res.json();
           if (data.movie_results && data.movie_results.length) return data.movie_results[0].title;
           if (data.tv_results && data.tv_results.length) return data.tv_results[0].name;
         } catch(e) {}
      }
      var match = url.match(/\\/(movie|tv)\\/([a-zA-Z0-9_-]+)/);
      if (!match) return null;
      var type = match[1];
      var id = match[2];
      try {
        if (id.startsWith('tt')) {
          let res = await fetch('https://api.themoviedb.org/3/find/' + id + '?external_source=imdb_id&api_key=' + TMDB_API_KEY);
          let data = await res.json();
          if (type === 'movie' && data.movie_results && data.movie_results.length) return data.movie_results[0].title;
          if (type === 'tv' && data.tv_results && data.tv_results.length) return data.tv_results[0].name;
        } else {
          let res = await fetch('https://api.themoviedb.org/3/' + type + '/' + id + '?api_key=' + TMDB_API_KEY);
          let data = await res.json();
          return type === 'movie' ? data.title : data.name;
        }
      } catch (e) {
        return null;
      }
      return null;
    }

    // Toast Notification System
    function showToast(msg) {
      const t = document.getElementById('toast');
      document.getElementById('toastMsg').innerText = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2500);
    }

    // Clipboard Copy Helper
    function copyText(text, label = 'Copied!') {
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        showToast(label);
      }).catch(() => {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast(label);
      });
    }

    function copySnippet(elementId) {
      const text = document.getElementById(elementId).innerText;
      copyText(text, 'Code copied to clipboard!');
    }

    function copyAllBlockedDomains() {
      const domains = currentAds.map(a => a.domain).join('\\n');
      copyText(domains, 'All blocked domains copied!');
    }

    // Paste from Clipboard into URL input
    async function pasteFromClipboard() {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.startsWith('http')) {
          document.getElementById('targetUrlInput').value = text.trim();
          showToast('URL pasted from clipboard!');
        } else {
          showToast('Clipboard does not contain a valid URL');
        }
      } catch(err) {
        showToast('Please press Ctrl+V to paste');
      }
    }

    function clearUrlInput() {
      document.getElementById('targetUrlInput').value = '';
      document.getElementById('targetUrlInput').focus();
      showToast('URL input cleared');
    }

    function loadPreset(type) {
      const input = document.getElementById('targetUrlInput');
      if (type === 'movie') {
        input.value = 'https://player.zxcprime.xyz/player/movie/969681?dubLang=hi&autoplay=1';
        showToast('🎬 Loaded Movie Preset: ZXC-Prime Hindi');
      } else if (type === 'tv') {
        input.value = 'https://player.zxcprime.xyz/player/tv/1396/1/1?dubLang=hi&autoplay=1';
        showToast('📺 Loaded TV Preset: ZXC-Prime Breaking Bad S1E1 Hindi');
      }
      input.focus();
    }

    // ★ v7.0: Load Previous Scan from JSON file ★
    async function loadPreviousScan() {
      try {
        const res = await fetch('/api/latest');
        if (!res.ok) { showToast('⚠️ No previous scan data found!'); return; }
        const data = await res.json();
        if (!data || !data.targetUrl) { showToast('⚠️ Invalid scan data!'); return; }

        currentStreams = data.streams || [];
        currentAds = data.adsBlocked || [];
        currentAudioTracks = data.audioTracks || [];

        document.getElementById('streamsList').innerHTML = '';
        document.getElementById('adsList').innerHTML = '';
        document.getElementById('valStreams').innerText = currentStreams.length;
        document.getElementById('valAds').innerText = currentAds.length;
        document.getElementById('valCDNs').innerText = (data.safeCDNs || []).length;

        currentStreams.forEach(s => renderStreamItem(s));
        currentAds.forEach(a => renderAdItem(a));

        if (data.tvShow && data.tvShow.isTv) renderTvControls(data.tvShow);
        if (currentAudioTracks.length > 0) renderAudioTracks(currentAudioTracks);

        // Auto-play first valid stream
        const masterStream = currentStreams.find(s => s.isMaster) || currentStreams[0];
        if (masterStream) playStream(masterStream.url, masterStream.headers ? masterStream.headers['Referer'] : null);

        document.getElementById('targetUrlInput').value = data.targetUrl;
        updateExportCodes();
        showToast('📂 Previous scan loaded — ' + currentStreams.length + ' stream(s) restored!');
      } catch(e) {
        showToast('❌ Error loading previous scan: ' + e.message);
      }
    }

    function switchTab(tabId) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      event.target.closest('.tab-btn').classList.add('active');
      document.getElementById(tabId).classList.add('active');
    }

    // ── Scan Timer ─────────────────────────────────────────────────────────────
    let scanStartTime   = null;
    let scanTimerIntvl  = null;
    let scanTickIntvl   = null;

    const SCAN_TICK_MSGS = [
      ['info',    '🔍 Launching headless browser engine…'],
      ['info',    '🌐 Navigating to target URL…'],
      ['info',    '🕵️  Intercepting all network requests…'],
      ['info',    '🚦 Analyzing request headers and referers…'],
      ['info',    '🎯 Looking for media streams (.m3u8, .mp4, .mkv)…'],
      ['info',    '🔊 Scanning for multi-language audio tracks…'],
      ['info',    '🛡️  Running ad-blocker filter engine…'],
      ['info',    '📡 Waiting for stream manifest response…'],
      ['info',    '🔎 Resolving CDN origin servers…'],
      ['info',    '🎬 Parsing video quality levels…'],
      ['info',    '🌍 Detecting TV series structure…'],
      ['info',    '⏳ Deep-scanning player JS for obfuscation…'],
      ['info',    '🔐 Extracting anti-bot tokens…'],
      ['info',    '📦 Collecting stream metadata…'],
      ['info',    '🎧 Indexing audio dub tracks…'],
      ['warn',    '⚠️  Site uses Cloudflare — bypassing…'],
      ['info',    '✅ Cloudflare bypass successful'],
      ['info',    '🔄 Re-checking for dynamic stream injections…'],
      ['info',    '🎚️  Verifying adaptive bitrate (ABR) levels…'],
      ['info',    '📋 Almost done — compiling results…'],
    ];
    let scanTickIdx = 0;

    function startScanTimer() {
      scanStartTime = Date.now();
      scanTickIdx   = 0;

      // Live elapsed timer in header
      const liveTxt = document.getElementById('liveStatusText');
      clearInterval(scanTimerIntvl);
      scanTimerIntvl = setInterval(function() {
        const elapsed = Math.floor((Date.now() - scanStartTime) / 1000);
        const m = Math.floor(elapsed / 60);
        const s = elapsed % 60;
        const ts = (m > 0 ? m + 'm ' : '') + s + 's';
        if (liveTxt) liveTxt.innerText = 'Scanning… ' + ts;
      }, 1000);

      // Animated log ticker — one message every 3.5s
      clearInterval(scanTickIntvl);
      scanTickIntvl = setInterval(function() {
        if (scanTickIdx < SCAN_TICK_MSGS.length) {
          const [lvl, msg] = SCAN_TICK_MSGS[scanTickIdx++];
          const now = new Date();
          const ts  = now.getHours().toString().padStart(2,'0') + ':'
                    + now.getMinutes().toString().padStart(2,'0') + ':'
                    + now.getSeconds().toString().padStart(2,'0');
          addLog(ts, lvl, msg);
        } else {
          clearInterval(scanTickIntvl);
        }
      }, 3500);
    }

    function stopScanTimer() {
      clearInterval(scanTimerIntvl);
      clearInterval(scanTickIntvl);
      if (scanStartTime) {
        const elapsed = Math.floor((Date.now() - scanStartTime) / 1000);
        const m = Math.floor(elapsed / 60);
        const s = elapsed % 60;
        const ts = (m > 0 ? m + 'm ' : '') + s + 's';
        const now = new Date();
        const hh  = now.getHours().toString().padStart(2,'0') + ':'
                  + now.getMinutes().toString().padStart(2,'0') + ':'
                  + now.getSeconds().toString().padStart(2,'0');
        addLog(hh, 'success', '🏁 Scan completed in ' + ts + ' — Engine idle.');
        scanStartTime = null;
      }
    }
    // ──────────────────────────────────────────────────────────────────────────

    function addLog(time, level, msg) {
      const t = document.getElementById('terminal');
      const div = document.createElement('div');
      div.className = 'log-line log-' + level;
      div.innerHTML = '<span class="log-time">[' + time + ']</span> ' + escapeHtml(msg);
      t.appendChild(div);
      t.scrollTop = t.scrollHeight;
    }

    function clearConsole() {
      document.getElementById('terminal').innerHTML = '<div class="log-line log-info"><span class="log-time">[SYS]</span> Console cleared. Ready for new scan.</div>';
    }

    function escapeHtml(str) {
      return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function startScan() {
      const url = document.getElementById('targetUrlInput').value.trim();
      if (!url) return showToast('Please enter an Embed URL!');

      document.getElementById('startBtn').style.display = 'none';
      document.getElementById('stopBtn').style.display = 'flex';
      document.getElementById('liveStatusText').innerText = 'Scanning…';
      document.getElementById('liveDot').style.background = '#00f2fe';
      document.getElementById('liveDot').style.boxShadow = '0 0 15px #00f2fe';

      currentStreams = [];
      currentAds    = [];
      renderTvControls(null);
      document.getElementById('streamsList').innerHTML = '';
      document.getElementById('adsList').innerHTML = '';
      document.getElementById('valStreams').innerText = '0';
      document.getElementById('valAds').innerText    = '0';
      document.getElementById('valPopups').innerText  = '0';
      document.getElementById('valCDNs').innerText    = '0';

      // Clear terminal and print start banner
      const terminal = document.getElementById('terminal');
      terminal.innerHTML = '';
      const now = new Date();
      const ts  = now.getHours().toString().padStart(2,'0') + ':'
                + now.getMinutes().toString().padStart(2,'0') + ':'
                + now.getSeconds().toString().padStart(2,'0');
      addLog('SYS', 'info',    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      addLog('SYS', 'success', '🚀 OllyFlix Autonomous Engine — SCAN STARTED');
      addLog(ts,    'info',    '🎯 Target: ' + url);
      addLog('SYS', 'info',    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Start animated timer
      startScanTimer();

      if (evtSource) evtSource.close();

      evtSource = new EventSource('/api/events');
      evtSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          handleEvent(data);
        } catch(err) {}
      };

      fetch('/api/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
    }

    function stopScan() {
      fetch('/api/stop', { method: 'POST' });
      if (evtSource) evtSource.close();
      stopScanTimer();
      resetUiState();
    }

    function resetUiState() {
      document.getElementById('startBtn').style.display = 'flex';
      document.getElementById('stopBtn').style.display = 'none';
      document.getElementById('liveStatusText').innerText = 'Engine Ready';
      document.getElementById('liveDot').style.background = '#10b981';
      document.getElementById('liveDot').style.boxShadow = '0 0 10px #10b981';
    }

    function handleEvent(data) {
      if (data.type === 'log') {
        addLog(data.timestamp, data.level, data.msg);
      } else if (data.type === 'ad_blocked') {
        currentAds.push(data);
        document.getElementById('valAds').innerText = currentAds.length;
        renderAdItem(data);
      } else if (data.type === 'stream_found') {
        currentStreams.push(data.stream);
        document.getElementById('valStreams').innerText = currentStreams.length;
        renderStreamItem(data.stream);
        
        // Auto play whatever stream we find first!
        // If we find an MP4, it plays immediately. If we later find a better Master HLS, we upgrade to it seamlessly.
        if (!currentActiveStream) {
          playStream(data.stream.url, data.stream.headers ? data.stream.headers['Referer'] : null);
        } else if (data.stream.isMaster && !currentActiveStream.includes('.m3u8') && !currentActiveStream.includes('playlist')) {
          playStream(data.stream.url, data.stream.headers ? data.stream.headers['Referer'] : null);
        }
        updateExportCodes();
      } else if (data.type === 'audio_tracks_found') {
        currentAudioTracks = data.audioTracks || [];
        renderAudioTracks(currentAudioTracks);
        showToast('🎧 Discovered ' + currentAudioTracks.length + ' Audio Language Tracks!');
      } else if (data.type === 'tv_show_detected') {
        renderTvControls(data.tvShow);
      } else if (data.type === 'movie_detected') {
        renderTvControls(null);
        showToast('🎬 Standalone Movie Detected (No Seasons/Episodes)');
      } else if (data.type === 'status' && data.status === 'completed') {
        stopScanTimer();
        resetUiState();
        if (data.summary) {
          document.getElementById('valPopups').innerText = data.summary.popundersCount;
          document.getElementById('valCDNs').innerText = data.summary.safeCDNsCount;
        }
      }
    }

    function renderStreamItem(s) {
      const container = document.getElementById('streamsList');
      const div = document.createElement('div');
      div.className = 'stream-card';
      const bt = s.isMaster
        ? '<span class="pill pill-success">🌟 Master Playlist</span>'
        : (s.isVariant ? '<span class="pill pill-blue">Quality Track</span>' : '<span class="pill pill-purple">' + (s.type || 'Stream') + '</span>');
      const safeRef = ((s.headers && s.headers['Referer']) || '').replace(/'/g, '');
      const safeUrl = (s.url || '').replace(/'/g, '');
      const ab = s.audioTrack ? '<span class="pill pill-success" style="background:rgba(16,185,129,0.18);border:1px solid #10b981;color:#34d399;">🔊 ' + s.audioTrack + '</span>' : '';
      div.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
          '<div class="tag-row">' + bt + ab +
            '<span class="pill pill-purple">CDN: ' + (s.cdn || '—') + '</span>' +
            '<span class="pill pill-success">Ad-Free</span>' +
          '</div>' +
          '<button class="btn-copy btn-play-trigger" onclick="playStream(\\'' + safeUrl + '\\',\\'' + safeRef + '\\')">▶ Play</button>' +
        '</div>' +
        '<div class="stream-url-tag">' + (s.url || '') + '</div>' +
        '<div class="card-actions-row">' +
          '<button class="btn-copy" onclick="copyText(\\'' + safeUrl + '\\',\\'URL Copied!\\')">📋 Copy URL</button>' +
          '<button class="btn-copy" onclick="copyExoSnippet(\\'' + safeUrl + '\\',\\'' + safeRef + '\\')">📱 Media3</button>' +
          '<button class="btn-copy" onclick="copyVlcSnippet(\\'' + safeUrl + '\\',\\'' + safeRef + '\\')">🖥️ VLC</button>' +
        '</div>';
      container.appendChild(div);
    }

    function renderAdItem(ad) {
      const container = document.getElementById('adsList');
      const div = document.createElement('div');
      div.className = 'ad-item';
      div.innerHTML =
        '<div><div class="ad-domain-title">' + (ad.domain || '') + '</div>' +
        '<div class="ad-reason-sub">' + (ad.reason || '') + '</div></div>' +
        '<div style="display:flex;align-items:center;gap:0.5rem;">' +
          '<span class="pill pill-danger">' + (ad.category || 'Ad') + '</span>' +
          '<button class="btn-copy" onclick="copyText(\\'' + (ad.domain || '').replace(/'/g, '') + '\\',\\'Domain copied!\\')">📋</button>' +
        '</div>';
      container.appendChild(div);
    }

        // ═══════════════════════════════════════════════════════════════
    // ULTRA PREMIUM CINEMA PLAYER — PLX ENGINE
    // ═══════════════════════════════════════════════════════════════

    let plxHls     = null;
    let plxTimer   = null;
    let plxDrag    = false;
    let plxLastVol = 1;
    let plxLvls    = [];   // quality levels cache

    // ── Format time ──
    function plxFmt(s) {
      if (!s || isNaN(s) || !isFinite(s)) return '0:00';
      s = Math.max(0, s);
      var h = Math.floor(s/3600), m = Math.floor((s%3600)/60), ss = Math.floor(s%60);
      if (h > 0) return h + ':' + String(m).padStart(2,'0') + ':' + String(ss).padStart(2,'0');
      return String(m).padStart(2,'0') + ':' + String(ss).padStart(2,'0');
    }

    // ── Show/Hide controls ──
    function plxShowUI() {
      var w = document.getElementById('plxWrap');
      if (w) w.classList.remove('plx-hidden');
    }
    function plxHideUI() {
      var w = document.getElementById('plxWrap');
      var v = document.getElementById('plxVideo');
      if (w && v && !v.paused) {
        if (!document.querySelector('.plx-menu.open')) w.classList.add('plx-hidden');
      }
    }
    function plxScheduleHide() {
      plxShowUI();
      clearTimeout(plxTimer);
      var v = document.getElementById('plxVideo');
      if (v && !v.paused) plxTimer = setTimeout(plxHideUI, 3200);
    }

    // ── Play/Pause ──
    function plxTogglePlay() {
      var v = document.getElementById('plxVideo');
      if (!v) return;
      if (v.paused) v.play().catch(function(){});
      else v.pause();
    }
    function plxSyncPlayBtn(paused) {
      var ico = document.getElementById('plxPlayIco');
      if (ico) ico.innerHTML = paused
        ? '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>'
        : '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
    }

    // ── Seek ──
    function plxSeek(sec) {
      var v = document.getElementById('plxVideo');
      if (!v || !v.duration) return;
      v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + sec));
      plxFlash(sec);
    }
    function plxFlash(sec) {
      var id = sec < 0 ? 'plxFlashL' : 'plxFlashR';
      var ti = sec < 0 ? 'plxFlashLTxt' : 'plxFlashRTxt';
      var el = document.getElementById(id);
      var tx = document.getElementById(ti);
      if (!el) return;
      if (tx) tx.innerText = (sec > 0 ? '+' : '') + sec + 's';
      el.classList.add('show');
      setTimeout(function(){ el.classList.remove('show'); }, 650);
    }

    // ── Progress ──
    function plxSyncProg() {
      var v   = document.getElementById('plxVideo');
      var pb  = document.getElementById('plxPlayedBar');
      var bb  = document.getElementById('plxBufBar');
      var cur = document.getElementById('plxCurTime');
      var dur = document.getElementById('plxDurTime');
      if (!v || plxDrag) return;
      var d = v.duration || 0;
      if (pb) pb.style.width = d > 0 ? Math.min(100,(v.currentTime/d)*100)+'%' : '0%';
      if (bb && v.buffered && v.buffered.length) {
        try { bb.style.width = Math.min(100,(v.buffered.end(v.buffered.length-1)/d)*100)+'%'; } catch(e){}
      }
      if (cur) cur.innerText = plxFmt(v.currentTime);
      if (dur) dur.innerText = plxFmt(d);
    }
    function plxProgStart(e) {
      plxDrag = true;
      plxProgSeek(e);
    }
    function plxProgMove(e) {
      var bar = document.getElementById('plxProgWrap');
      var tip = document.getElementById('plxTimeTip');
      var v   = document.getElementById('plxVideo');
      if (!bar) return;
      var r   = bar.getBoundingClientRect();
      var pos = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      if (tip) { tip.innerText = plxFmt(pos * (v ? v.duration || 0 : 0)); tip.style.left = (pos*100)+'%'; }
      if (plxDrag) plxProgSeek(e);
    }
    function plxProgSeek(e) {
      var v   = document.getElementById('plxVideo');
      var bar = document.getElementById('plxProgWrap');
      if (!v || !bar) return;
      var r   = bar.getBoundingClientRect();
      var pos = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      if (v.duration) {
        v.currentTime = pos * v.duration;
        var pb = document.getElementById('plxPlayedBar');
        if (pb) pb.style.width = (pos*100)+'%';
      }
    }

    // ── Volume ──
    function plxSetVol(val) {
      var v  = document.getElementById('plxVideo');
      var sl = document.getElementById('plxVolSlider');
      var mi = document.getElementById('plxMuteIco');
      if (!v) return;
      var vol = parseFloat(val);
      v.volume = Math.max(0, Math.min(1, vol));
      v.muted  = (vol === 0);
      if (vol > 0) plxLastVol = vol;
      if (sl) sl.value = vol;
      var muted = v.muted || vol === 0;
      if (mi) mi.innerHTML = muted
        ? '<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z"/></svg>'
        : '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';
    }
    function plxToggleMute() {
      var v = document.getElementById('plxVideo');
      if (!v) return;
      if (v.muted) { v.muted = false; plxSetVol(plxLastVol || 1); }
      else { plxLastVol = v.volume; v.muted = true; plxSetVol(0); }
    }

    // ── Fullscreen ──
    function plxFullscreen() {
      var w = document.getElementById('plxWrap');
      if (!w) return;
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        (w.requestFullscreen || w.webkitRequestFullscreen || function(){}).call(w);
      } else {
        (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document);
      }
    }

    // ── PiP ──
    function plxPiP() {
      var v = document.getElementById('plxVideo');
      if (!v) return;
      if (document.pictureInPictureElement) document.exitPictureInPicture().catch(function(){});
      else if (document.pictureInPictureEnabled) v.requestPictureInPicture().catch(function(){});
    }

    // ── Menus ──
    function plxCloseMenus() {
      document.querySelectorAll('.plx-menu').forEach(function(m){ m.classList.remove('open'); });
    }
    function plxToggleMenu(id) {
      var m = document.getElementById(id);
      var wasOpen = m && m.classList.contains('open');
      plxCloseMenus();
      if (m && !wasOpen) m.classList.add('open');
    }

    // ── Quality menu ──
    function plxRenderQuality(levels) {
      plxLvls = levels || [];
      var c = document.getElementById('plxQualItems');
      if (!c) return;
      c.innerHTML = '';
      var curLvl = plxHls ? plxHls.currentLevel : -1;

      function addQualItem(label, lvlIdx, kbps) {
        var sel = (lvlIdx === -1) ? (curLvl === -1) : (curLvl === lvlIdx);
        var el  = document.createElement('div');
        el.className = 'plx-menu-item' + (sel ? ' sel' : '');
        el.innerHTML = '<span>' + label + '</span>'
                     + (kbps ? '<span style="font-size:0.7rem;color:#666;">' + kbps + '</span>' : '')
                     + (sel ? '<span class="plx-menu-dot"></span>' : '');
        el.onclick = function() {
          if (plxHls) plxHls.currentLevel = lvlIdx;
          plxRenderQuality(plxLvls);
          
          // Update main menu label
          var lblQual = document.getElementById('lblCurrentQual');
          if (lblQual) {
            var shortLabel = label.split(' ')[1] || label;
            if (label.includes('Auto')) shortLabel = 'Auto';
            lblQual.innerHTML = shortLabel + ' &nbsp;&gt;';
          }
          
          plxToggleMenu('plxSettingsMenu'); // Go back to main settings menu instead of closing all
          showToast('🎚️ Quality: ' + label);
        };
        c.appendChild(el);
      }

      addQualItem('⚡ Auto (Adaptive)', -1, '');
      
      if (levels && levels.length > 0) {
        levels.forEach(function(lvl, idx) {
          var h = (lvl && lvl.height) || 0;
          var u = (lvl && (Array.isArray(lvl.url) ? lvl.url[0] : lvl.url)) || '';
          var n = (lvl && lvl.name) || '';
          var lbl;
          if (h >= 1080 || u.includes('1080') || n.includes('1080')) lbl = '🎬 1080p Full HD';
          else if (h >= 720  || u.includes('720') || n.includes('720'))  lbl = '🖥️ 720p HD';
          else if (h >= 480  || u.includes('480') || n.includes('480'))  lbl = '📺 480p SD';
          else if (h >= 360  || u.includes('360') || n.includes('360'))  lbl = '📱 360p Low';
          else if (h > 0) lbl = h + 'p';
          else if (n) lbl = n;
          else lbl = 'Quality ' + (idx+1);
          var kbps = lvl && lvl.bitrate ? Math.round(lvl.bitrate/1000) + ' kbps' : '';
          addQualItem(lbl, idx, kbps);
        });
      } else {
        // Fallback static qualities for direct MP4 or single-level streams so the UI still looks premium
        addQualItem('🎬 1080p Full HD', 0, '');
        addQualItem('🖥️ 720p HD', 0, '');
        addQualItem('📺 480p SD', 0, '');
      }

      // sync auxiliary select
      var qs = document.getElementById('qualitySelect');
      if (qs) {
        qs.innerHTML = '<option value="-1">Auto</option>';
        levels.forEach(function(lvl, idx) {
          var h = (lvl && lvl.height) || 0;
          var opt = document.createElement('option');
          opt.value = idx; opt.innerText = h ? h + 'p' : 'Q' + (idx+1);
          qs.appendChild(opt);
        });
      }
    }

    // ── Audio menu ──
    function plxRenderAudio() {
      var c = document.getElementById('plxAudioItems');
      if (!c) return;
      c.innerHTML = '';

      // Multi-URL host tracks
      if (currentAudioTracks && currentAudioTracks.length > 0) {
        currentAudioTracks.forEach(function(track, idx) {
          var isSel = (currentActiveStream === track.url) || (!currentActiveStream && idx === 0);
          var lang  = track.language || track.title || ('Track ' + (idx+1));
          var el = document.createElement('div');
          el.className = 'plx-menu-item' + (isSel ? ' sel' : '');
          el.innerHTML = '<span>🔊 ' + lang + '</span>' + (isSel ? '<span class="plx-menu-dot"></span>' : '');
          (function(t) { el.onclick = function() { plxCloseMenus(); onAudioChange(t.url); }; })(track);
          c.appendChild(el);
        });
        return;
      }

      // HLS.js native tracks
      var list = (plxHls && plxHls.audioTracks) ? plxHls.audioTracks : [];
      if (list.length === 0) {
        c.innerHTML = '<div class="plx-menu-item sel"><span>🔊 Default Audio</span><span class="plx-menu-dot"></span></div>';
        return;
      }
      list.forEach(function(track, idx) {
        var tid  = track.id !== undefined ? track.id : idx;
        var isSel = plxHls ? (plxHls.audioTrack === tid || (plxHls.audioTrack === -1 && idx === 0)) : idx === 0;
        var lang = (track.lang || track.language || '').toUpperCase();
        var name = track.name || track.label || ('Track ' + (idx+1));
        if (lang && !name.toUpperCase().includes(lang)) name += ' [' + lang + ']';
        var el = document.createElement('div');
        el.className = 'plx-menu-item' + (isSel ? ' sel' : '');
        el.innerHTML = '<span>🔊 ' + name + '</span>' + (isSel ? '<span class="plx-menu-dot"></span>' : '');
        (function(id) { el.onclick = function() { plxCloseMenus(); onAudioChange(id); }; })(tid);
        c.appendChild(el);
      });

      // sync auxiliary select
      var as = document.getElementById('audioSelect');
      if (as) {
        as.innerHTML = '';
        list.forEach(function(t, idx) {
          var tid = t.id !== undefined ? t.id : idx;
          var nm  = t.name || t.label || ('Track ' + (idx+1));
          var opt = document.createElement('option');
          opt.value = tid; opt.innerText = '🔊 ' + nm;
          as.appendChild(opt);
        });
      }
    }

    // ── Speed ──
    function plxSetSpeed(spd, el) {
      var v = document.getElementById('plxVideo');
      if (v) v.playbackRate = parseFloat(spd);
      var menu = document.getElementById('plxSpeedItems');
      if (menu) {
        menu.querySelectorAll('.plx-menu-item').forEach(function(it){
          it.classList.remove('sel');
          var dot = it.querySelector('.plx-menu-dot'); if (dot) dot.remove();
        });
        if (el) { el.classList.add('sel'); el.insertAdjacentHTML('beforeend','<span class="plx-menu-dot"></span>'); }
        
        // Update main menu label
        var lblSpeed = document.getElementById('lblCurrentSpeed');
        if (lblSpeed) {
          var txt = (spd === 1) ? 'Normal' : spd + '×';
          lblSpeed.innerHTML = txt + ' &nbsp;&gt;';
        }
      }
      plxToggleMenu('plxSettingsMenu'); // Go back to main settings menu instead of closing all
      showToast('⏩ Speed: ' + spd + '×');
      var ss = document.getElementById('speedSelect');
      if (ss) ss.value = spd;
    }

    // ── Loop ──
    function plxToggleLoop() {
      var v = document.getElementById('plxVideo');
      var lbl = document.getElementById('lblCurrentLoop');
      if (v) {
        v.loop = !v.loop;
        if (lbl) lbl.innerText = v.loop ? 'On' : 'Off';
        showToast('🔁 Loop: ' + (v.loop ? 'On' : 'Off'));
      }
    }

    // ── Scale ──
    function plxSetScale(cssVal, label, el) {
      var v = document.getElementById('plxVideo');
      if (v) v.style.objectFit = cssVal;
      var menu = document.getElementById('plxScaleItems');
      if (menu) {
        menu.querySelectorAll('.plx-menu-item').forEach(function(it){
          it.classList.remove('sel');
          var dot = it.querySelector('.plx-menu-dot'); if (dot) dot.remove();
        });
        if (el) { el.classList.add('sel'); el.insertAdjacentHTML('beforeend','<span class="plx-menu-dot"></span>'); }
        
        var lblScale = document.getElementById('lblCurrentScale');
        if (lblScale) lblScale.innerHTML = label + ' &nbsp;&gt;';
      }
      plxToggleMenu('plxSettingsMenu');
      showToast('🔲 Scale: ' + label);
    }

    // ── TV/Episodes ──
    function loadEpisodeStream(season, ep) {
      const targetUrl = document.getElementById('targetUrlInput').value.trim();
      if (!targetUrl) return;
      var spinner = document.getElementById('plxSpinner');
      if (spinner) spinner.style.display = 'flex';
      
      fetch('/api/select_episode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl: targetUrl, seasonMe: season.number || season.title || season.season, episodeMe: ep.number || ep.title || ep.episode })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success && data.stream) {
          playStream(data.stream.url, data.stream.headers ? data.stream.headers['Referer'] : null);
        } else {
          showToast('Failed to load episode');
          if (spinner) spinner.style.display = 'none';
        }
      })
      .catch(function(e) {
        showToast('Error loading episode');
        if (spinner) spinner.style.display = 'none';
      });
    }

    function renderCustomEpisodes(sIdx) {
      var list = document.getElementById('vpEpisodeItems');
      if (!list || !currentTvShow) return;
      list.innerHTML = '';
      var season = currentTvShow.seasons[sIdx];
      (season.episodes || []).forEach(function(ep, idx) {
        var el = document.createElement('div');
        el.className = 'plx-ep-card';
        var title = ep.title || ('Episode ' + (idx+1));
        if (/^\\d+\\s+episode$/i.test(title)) title = 'Episode ' + title.split(' ')[0];
        el.innerHTML = '<div class="plx-ep-num">EP ' + (idx+1) + '</div>'
                     + '<div class="plx-ep-info"><h4>' + title + '</h4><span>' + (ep.duration || '45m') + '</span></div>';
        el.onclick = function() {
          document.querySelectorAll('.plx-ep-card').forEach(function(c){ c.classList.remove('active'); });
          el.classList.add('active');
          var t = document.getElementById('plxTitle');
          if (t) t.innerText = title;
          loadEpisodeStream(season, ep);
        };
        list.appendChild(el);
      });
    }
    function plxOnSeasonChange(val) { renderCustomEpisodes(parseInt(val, 10)); }

    function renderTvControls(tvShow) {
      var sidebar = document.getElementById('plxSidebar');
      var theater = document.getElementById('plxTheater');
      var epBtn   = document.getElementById('plxEpBtn');
      var sGrp    = document.getElementById('seasonGroup');
      var eGrp    = document.getElementById('episodeGroup');

      if (sGrp) sGrp.style.display = 'none'; // Hide legacy UI permanently
      if (eGrp) eGrp.style.display = 'none'; // Hide legacy UI permanently

      if (!tvShow || !tvShow.isTv || !tvShow.seasons) {
        if (sidebar) sidebar.classList.remove('visible');
        if (theater) theater.classList.remove('has-sidebar');
        if (epBtn)   epBtn.style.display = 'none';
        currentTvShow = null;
        return;
      }
      currentTvShow = tvShow;
      if (sidebar) sidebar.classList.add('visible');
      if (theater) theater.classList.add('has-sidebar');
      if (epBtn)   epBtn.style.display = 'flex';

      // fill season select in sidebar & in menu
      ['vpSeasonSelect', 'plxSeasonSel'].forEach(function(id) {
        var sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = '';
        tvShow.seasons.forEach(function(s, idx) {
          var opt = document.createElement('option');
          opt.value = idx; opt.innerText = s.title || ('Season ' + (idx+1));
          sel.appendChild(opt);
        });
      });

      // fill legacy selects
      var sSelect = document.getElementById('seasonSelect');
      if (sSelect) {
        sSelect.innerHTML = '';
        tvShow.seasons.forEach(function(s, idx) {
          var opt = document.createElement('option');
          opt.value = idx+1; opt.innerText = s.title || ('Season ' + (idx+1));
          sSelect.appendChild(opt);
        });
      }
      if (tvShow.seasons[0] && tvShow.seasons[0].episodes) renderCustomEpisodes(0);
      showToast('📺 TV Show: ' + tvShow.seasons.length + ' Season(s) ready');
    }

    // ── renderAudioTracks ── (called by scan events)
    function renderAudioTracks(tracks) {
      var aSelect = document.getElementById('audioSelect');
      if (aSelect) {
        if (currentAudioTracks && currentAudioTracks.length > 0) {
          aSelect.innerHTML = '';
          currentAudioTracks.forEach(function(t, idx) {
            var opt = document.createElement('option');
            opt.value = t.url;
            opt.innerText = '🔊 ' + (t.language || t.title || ('Track ' + (idx+1)));
            opt.selected  = (currentActiveStream === t.url) || (!currentActiveStream && idx === 0);
            aSelect.appendChild(opt);
          });
        } else {
          aSelect.innerHTML = '<option value="-1">🔊 Default Audio</option>';
        }
      }
      plxRenderAudio();
    }

    // ── MAIN playStream ──
    function playStream(streamUrl, ref, resumeTime, autoPlay) {
      if (resumeTime === undefined) resumeTime = 0;
      if (autoPlay   === undefined) autoPlay   = true;
      currentActiveStream = streamUrl;

      var video   = document.getElementById('plxVideo');
      var spinner = document.getElementById('plxSpinner');
      var title   = document.getElementById('plxTitle');
      var badge   = document.getElementById('plxBadge');
      var extBadge= document.getElementById('playerBadge');
      if (!video) return;

      if (spinner) spinner.style.display = 'flex';
      if (extBadge) extBadge.innerText = '▶ Playing';

      var targetRef = ref || document.getElementById('targetUrlInput').value.trim() || 'https://google.com/';
      var proxied   = streamUrl.includes('.workers.dev') ? streamUrl : ('/api/proxy?referer=' + encodeURIComponent(targetRef) + '&target=' + encodeURIComponent(streamUrl));

      var currentTitle = title ? title.innerText : '';
      if (currentTitle && currentTitle !== 'No Stream Selected' && currentTitle !== 'index.m3u8' && !currentTitle.includes('.m3u8')) {
        // Keep existing title (set by episode click)
      } else {
        var tu = document.getElementById('targetUrlInput').value.trim();
        fetchTmdbTitle(tu).then(function(tmdbName) {
          if (title) {
            if (tmdbName) {
              title.innerText = '🎬 ' + tmdbName;
            } else {
              try {
                var baseName = tu ? new URL(tu).hostname.replace('www.', '') : 'Media';
                title.innerText = '🎬 ' + baseName.toUpperCase();
              } catch(e) { 
                title.innerText = '🎬 Premium Stream'; 
              }
            }
          }
        });
      }

      if (plxHls) { plxHls.destroy(); plxHls = null; }
      video.muted = true;

      var isHls = streamUrl.includes('.m3u8') || streamUrl.includes('playlist') || streamUrl.includes('/stream') || streamUrl.includes('master.txt') || streamUrl.includes('index.txt');

      if (typeof Hls !== 'undefined' && Hls.isSupported() && isHls) {
        var hls = new Hls({ enableWorker: true, startLevel: -1, backBufferLength: 60 });
        plxHls = hls;
        hls.loadSource(proxied);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, function(e, data) {
          if (spinner) spinner.style.display = 'none';
          plxRenderQuality(data.levels || []);
          plxRenderAudio();
          if (badge) badge.innerText = (data.levels && data.levels.length) ? data.levels[0].height + 'p' : 'HLS';
          if (resumeTime > 0) video.currentTime = resumeTime;
          if (autoPlay) {
            var p = video.play();
            if (p && p.then) p.then(function(){
              // unmute UI update if needed
            }).catch(function(){ video.muted = true; video.play().catch(function(){}); });
          }
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, function(e, data) {
          if (plxLvls && plxLvls[data.level]) {
            var b = document.getElementById('plxBadge');
            var h = plxLvls[data.level].height;
            if (b) b.innerText = (h > 0) ? h + 'p' : 'HLS';
          }
        });

        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, function(e, data) {
          plxRenderAudio();
        });

        hls.on(Hls.Events.ERROR, function(e, data) {
          if (data.fatal) { if (spinner) spinner.style.display = 'none'; }
        });

      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS
        video.src = proxied;
        if (autoPlay) video.play().catch(function(){});
        if (spinner) spinner.style.display = 'none';
      } else {
        // Fallback: direct play
        video.src = proxied;
        if (autoPlay) video.play().catch(function(){});
        if (spinner) spinner.style.display = 'none';
      }
    }

    // ── Backward compat aliases ──
    function onAudioChange(val) {
      if (val === '-1' || val === -1) return;
      // numeric = HLS.js track id
      if (!isNaN(val) && plxHls && plxHls.audioTracks && plxHls.audioTracks.length > 0) {
        plxHls.audioTrack = parseInt(val, 10);
        plxRenderAudio();
        showToast('🔊 Audio track switched');
        return;
      }
      // URL = multi-host audio switch
      if (typeof val === 'string' && val.startsWith('http')) {
        var ref = document.getElementById('targetUrlInput').value.trim() || 'https://google.com/';
        currentActiveStream = val;
        playStream(val, ref, 0, true);
        showToast('🔊 Audio track switched');
      }
    }
    function onQualityChange(val) {
      if (!plxHls) return;
      plxHls.currentLevel = parseInt(val, 10);
      plxRenderQuality(plxLvls);
      showToast('🎚️ Quality changed');
    }
    function onSubtitleChange(val) {
      if (plxHls) plxHls.subtitleTrack = parseInt(val, 10);
    }
    function onSpeedChange(val) {
      var v = document.getElementById('plxVideo');
      if (v) v.playbackRate = parseFloat(val);
    }

    /* ═══ DOMContentLoaded ═══ */
    window.addEventListener('DOMContentLoaded', function() {
      var video   = document.getElementById('plxVideo');
      var wrapper = document.getElementById('plxWrap');
      if (!video || !wrapper) return;

      // Progress sync
      video.addEventListener('timeupdate',     plxSyncProg);
      video.addEventListener('progress',       plxSyncProg);
      video.addEventListener('durationchange', plxSyncProg);

      // Play/pause sync
      video.addEventListener('play',    function() { plxSyncPlayBtn(false); plxScheduleHide(); });
      video.addEventListener('pause',   function() { plxSyncPlayBtn(true);  plxShowUI(); });
      video.addEventListener('ended',   function() { plxSyncPlayBtn(true);  plxShowUI(); });
      video.addEventListener('waiting', function() { var s = document.getElementById('plxSpinner'); if (s) s.style.display = 'flex'; });
      video.addEventListener('playing', function() { var s = document.getElementById('plxSpinner'); if (s) s.style.display = 'none'; });
      video.addEventListener('volumechange', function() {
        var mi = document.getElementById('plxMuteIco');
        var sl = document.getElementById('plxVolSlider');
        var muted = video.muted || video.volume === 0;
        if (mi) mi.innerHTML = muted 
          ? '<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>' 
          : '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';
        if (sl) sl.value = video.muted ? 0 : video.volume;
      });

      // Click video = toggle play
      video.addEventListener('click', function(e) {
        e.stopPropagation();
        if (document.querySelector('.plx-menu.open')) { plxCloseMenus(); return; }
        if (video.muted) { video.muted = false; plxSetVol(plxLastVol || 1); showToast('🔊 Sound ON!'); }
        else plxTogglePlay();
      });

      // Mouse activity → show controls
      wrapper.addEventListener('mousemove',  plxScheduleHide);
      wrapper.addEventListener('mouseenter', plxShowUI);
      wrapper.addEventListener('mouseleave', function() { if (!video.paused) wrapper.classList.add('plx-hidden'); });
      wrapper.addEventListener('touchstart', function() { plxShowUI(); plxScheduleHide(); }, { passive: true });

      // Progress bar drag
      document.addEventListener('mouseup',   function() { plxDrag = false; });
      document.addEventListener('mousemove', function(e) { if (plxDrag) plxProgSeek(e); });

      // Close menus on outside click
      document.addEventListener('click', function(e) {
        if (!e.target.closest('.plx-menu') && !e.target.closest('.plx-tool'))
          plxCloseMenus();
      });

      // Keyboard shortcuts
      document.addEventListener('keydown', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
        switch(e.code) {
          case 'Space': case 'KeyK': e.preventDefault(); plxTogglePlay();    break;
          case 'KeyF':  e.preventDefault(); plxFullscreen();  break;
          case 'KeyM':  e.preventDefault(); plxToggleMute();  break;
          case 'ArrowLeft':  e.preventDefault(); plxSeek(e.shiftKey ? -30 : -10); break;
          case 'ArrowRight': e.preventDefault(); plxSeek(e.shiftKey ?  30 :  10); break;
          case 'ArrowUp':    e.preventDefault(); plxSetVol(Math.min(1, (document.getElementById('plxVideo')||{volume:1}).volume + 0.1)); break;
          case 'ArrowDown':  e.preventDefault(); plxSetVol(Math.max(0, (document.getElementById('plxVideo')||{volume:1}).volume - 0.1)); break;
          case 'Escape': plxCloseMenus(); break;
        }
      });

      // Init volume
      plxSetVol(1);
    });

  </script>
</body>
</html>`;
}

// ── HTTP & SSE Server Controller ──────────────────────────────────────────────
function startServer() {
  const sseClients = new Set();

  function broadcastSSE(data) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const res of sseClients) {
      try { res.write(payload); } catch(e) {}
    }
  }

  const server = http.createServer(async (req, res) => {
    const parsed = url.parse(req.url, true);

    // 1. Dashboard UI
    if (parsed.pathname === '/' || parsed.pathname === '/index.html') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      });
      res.end(getDashboardHtml());
      return;
    }

    // 2. SSE Events Stream
    if (parsed.pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      res.write('\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    // 3. Start Scan API
    if (parsed.pathname === '/api/start' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const { url: targetUrl } = JSON.parse(body);
          if (!targetUrl) throw new Error('URL is required');

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Scan initiated' }));

          // Run scan asynchronously
          runLiveAudit(targetUrl, {}, broadcastSSE);

        } catch(err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // 4. Stop Scan API
    if (parsed.pathname === '/api/stop' && req.method === 'POST') {
      if (activeSession) activeSession.aborted = true;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Scan stopped' }));
      return;
    }

    // 4.1 TV Show Season & Episode Stream Resolver API
    if (parsed.pathname === '/api/select_episode' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const { targetUrl, seasonMe, episodeMe } = JSON.parse(body);
          if (!targetUrl) throw new Error('Target URL is required');
          const result = await resolveEpisodeStream(targetUrl, seasonMe, episodeMe);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch(err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // 5. Get Latest Report Data
    if (parsed.pathname === '/api/latest') {
      if (fs.existsSync(REPORT_JSON)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        fs.createReadStream(REPORT_JSON).pipe(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No scan data found' }));
      }
      return;
    }

    // 6. Live Stream & Segment Proxy (Bypasses Hotlink 404/403 protection)
    if (parsed.pathname === '/api/proxy') {
      const target = parsed.query.target;
      const ref = parsed.query.referer || 'https://google.com/';

      if (!target || !target.startsWith('http')) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing or invalid target parameter');
        return;
      }
      // console.log('[Proxy] Request for:', target);

      function forwardRequest(fetchUrl, redirectCount = 0) {
        if (redirectCount > 5) {
          res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end('Too many redirects');
          return;
        }

        let pTarget;
        try { pTarget = new URL(fetchUrl); } catch(e) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Malformed URL');
          return;
        }

        const reqHeaders = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Referer': ref,
          'Origin': new URL(ref).origin,
          'Accept': '*/*'
        };
        if (req.headers.range) reqHeaders['Range'] = req.headers.range;

        const lib = pTarget.protocol === 'https:' ? https : http;
        const proxyReq = lib.request({
          hostname: pTarget.hostname,
          port: pTarget.port || (pTarget.protocol === 'https:' ? 443 : 80),
          path: pTarget.pathname + pTarget.search,
          method: 'GET',
          headers: reqHeaders
        }, proxyRes => {
          if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
            let loc = proxyRes.headers.location;
            if (!loc.startsWith('http')) {
              loc = new URL(loc, fetchUrl).href;
            }
            return forwardRequest(loc, redirectCount + 1);
          }

          const ct = (proxyRes.headers['content-type'] || '').toLowerCase();
          const isM3U8 = fetchUrl.includes('.m3u8') || ct.includes('mpegurl') || ct.includes('text/html') || fetchUrl.includes('master.txt') || fetchUrl.includes('index.txt');

          if (isM3U8) {
            let body = '';
            proxyRes.setEncoding('utf8');
            proxyRes.on('data', chunk => body += chunk);
            proxyRes.on('end', () => {
              // Rewrite lines in M3U8 so nested segments/sub-playlists/audio tracks route through proxy
              const lines = body.split('\n');
              const rewritten = lines.map(line => {
                const trimmed = line.trim();
                if (!trimmed) return line;

                // Handle tags with URI attributes (e.g., #EXT-X-MEDIA:TYPE=AUDIO/SUBTITLES, #EXT-X-KEY, #EXT-X-MAP, #EXT-X-I-FRAME-STREAM-INF)
                if (trimmed.startsWith('#')) {
                  if (trimmed.includes('URI=')) {
                    return trimmed.replace(/URI=["']([^"']+)["']/g, (m, rawUri) => {
                      try {
                        const fullUri = new URL(rawUri, fetchUrl).href;
                        return `URI="/api/proxy?referer=${encodeURIComponent(ref)}&target=${encodeURIComponent(fullUri)}"`;
                      } catch (e) {
                        return m;
                      }
                    });
                  }
                  return line;
                }

                // Sub-playlists or media segments (.ts, .m4s, .aac, .m3u8, etc.)
                try {
                  const fullSegment = new URL(trimmed, fetchUrl).href;
                  return `/api/proxy?referer=${encodeURIComponent(ref)}&target=${encodeURIComponent(fullSegment)}`;
                } catch(e) {
                  return line;
                }
              }).join('\n');

              res.writeHead(200, {
                'Content-Type': 'application/vnd.apple.mpegurl',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-cache'
              });
              res.end(rewritten);
            });
          } else {
            // Binary media chunk (.ts, .m4s, key, etc.)
            const resHeaders = {
              'Content-Type': proxyRes.headers['content-type'] || 'video/MP2T',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=3600'
            };
            if (proxyRes.headers['content-length']) resHeaders['Content-Length'] = proxyRes.headers['content-length'];
            if (proxyRes.headers['content-range']) resHeaders['Content-Range'] = proxyRes.headers['content-range'];
            if (proxyRes.headers['accept-ranges']) resHeaders['Accept-Ranges'] = proxyRes.headers['accept-ranges'];

            res.writeHead(proxyRes.statusCode, resHeaders);
            proxyRes.pipe(res);
            
            proxyRes.on('error', err => {
              // Ignore standard stream aborts
              if (err.code !== 'ECONNRESET' && err.code !== 'EPIPE') {
                console.error('[Proxy] proxyRes error:', err.message);
              }
            });
            res.on('error', err => {
              if (err.code !== 'ECONNRESET' && err.code !== 'EPIPE') {
                console.error('[Proxy] res error:', err.message);
              }
            });
          }
        });

        proxyReq.on('error', err => {
          console.error('[Proxy] Request Error:', err.message, 'Target:', pTarget.hostname);
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'text/plain' });
            res.end('Proxy Error: ' + err.message);
          }
        });
        proxyReq.end();
      }

      forwardRequest(target);
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const nextPort = PORT + 1;
      console.log(`\n⚠️ Port ${PORT} is busy, retrying on port ${nextPort}...`);
      server.listen(nextPort, '0.0.0.0');
    } else {
      console.error('❌ Server error:', err.message);
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    const address = server.address();
    const actualPort = address.port;
    console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║   ⚡ OLLYFLIX AUTONOMOUS AI LIVE AD TRACKER & STREAM SNIFFER v8.0    ║');
    console.log(`║   Live Web Dashboard: http://127.0.0.1:${actualPort}                     ║`);
    console.log('╠══════════════════════════════════════════════════════════════════════╣');
    console.log('║   ★ NEW v8.0: ZXC-Prime / Vidstuck Deep Iframe & Backup Routing     ║');
    console.log('║   ★ NEW v8.0: Smart SPA Hydration & Multi-Server Failover           ║');
    console.log('║   ★ NEW v8.0: Automated Audio Dub & Subtitle Protocol Detection     ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝\n');
    console.log(`  🌐 Dashboard is live at: http://127.0.0.1:${actualPort}`);
    console.log(`  🌐 Alternative URL:      http://localhost:${actualPort}`);
    console.log(`  🎬 Features: Real-time SSE Logs + Built-in HLS Player + Ad Blocker`);
    console.log(`  🧠 New: Next.js SPA extractor | fetch() interceptor | API prober`);
    console.log(`  💡 Press Ctrl+C in this terminal to stop the server anytime.\n`);

    // Auto open browser reliably on Windows
    exec(`cmd /c start "" "http://127.0.0.1:${actualPort}"`);
  });
}

// ── Entrypoint: CLI or Web Dashboard ──────────────────────────────────────────
const cliUrl = process.argv[2];

if (cliUrl && cliUrl.startsWith('http')) {
  // Command-Line Mode
  console.log(`\n🚀 Launching CLI Audit for: ${cliUrl}`);
  runLiveAudit(cliUrl, {}, (evt) => {
    if (evt.type === 'log') {
      console.log(`[${evt.level.toUpperCase()}] ${evt.msg}`);
    } else if (evt.type === 'stream_found') {
      console.log(`\n🎯 Direct Stream: ${evt.stream.url}`);
    } else if (evt.type === 'ad_blocked') {
      console.log(`🛑 Ad Blocked [${evt.category}]: ${evt.domain}`);
    }
  }).then(() => {
    console.log('\n✅ CLI Audit Complete! Check LATEST_SCAN_REPORT.txt for full summary.\n');
    process.exit(0);
  });
} else {
  // Web Dashboard Server Mode
  startServer();
}
