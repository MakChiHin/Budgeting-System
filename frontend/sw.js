self.addEventListener("install", (e) => {
  e.waitUntil(caches.open("kotau-v1").then((c) => c.addAll([
    "./", "./index.html", "./styles.css", "./app.js", "./manifest.json"
  ]).catch(() => {})));
});
self.addEventListener("fetch", (e) => {
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
