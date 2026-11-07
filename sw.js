// Service Worker: macht die App offline startbar.
// Bei jeder Änderung an den Dateien die Versionsnummer erhöhen,
// damit alle Geräte die neue Version laden.
const CACHE = "tri-training-v10";
const FILES = ["./", "index.html", "manifest.webmanifest", "fragebogen.js", "icons/apple-touch-icon.png", "icons/icon-192.png"];
const CDN_HOST = "cdn.jsdelivr.net";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Zuerst aus dem Netz laden (damit Updates sofort ankommen),
// nur offline auf die gespeicherte Kopie zurückgreifen.
// Anfragen an Supabase (Login, Daten) werden nie zwischengespeichert.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && url.hostname !== CDN_HOST) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && (res.ok || res.type === "opaque")) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("./")))
  );
});
