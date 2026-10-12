// Service worker: lets Səyyah install as an app and work offline.
// Network-first for the app's own files so edits show up immediately; the cache is the offline fallback.
const CACHE = "seyyah-v2";
const FONTS = "seyyah-fonts-v1";
const ASSETS = [
  "./", "index.html", "style.css", "game.js", "share.js", "data.js",
  "logo.svg", "favicon.ico", "icons/favicon-16.png", "icons/favicon-32.png",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png",
  "audio/correct.mp3", "audio/error.mp3", "audio/victory.mp3", "audio/defeat.mp3",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== FONTS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Google Fonts: serve from cache, refresh in the background
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(
      caches.open(FONTS).then(async (c) => {
        const hit = await c.match(req);
        const fresh = fetch(req).then((res) => { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || fresh;
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match("index.html")))
  );
});
