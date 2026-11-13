// Uygulamanın internet zayıfken de açılmasını sağlar.
// Önce internetten en yeni sürümü dener, olmazsa kayıtlı kopyayı açar.
// Böylece GitHub'a yüklediğin güncellemeler hemen gelir.
const CACHE = "bebek-gunlugu-v1";
const DOSYALAR = ["./", "./index.html", "./app.js", "./firebase-config.js", "./manifest.webmanifest", "./icons/icon-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(DOSYALAR)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const kopya = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, kopya));
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
  );
});
