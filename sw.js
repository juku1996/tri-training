// Einfacher Service Worker: macht die App offline nutzbar.
// Bei jeder Änderung an den Dateien die Versionsnummer erhöhen,
// damit alle Geräte die neue Version laden.
const CACHE = "tri-training-v1";
const FILES = ["./", "index.html", "manifest.webmanifest"];

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

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((hit) => hit || fetch(event.request))
  );
});
