const CACHE_NAME = "recetario-v24";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./mobile-grid.css",
  "./logo-theme.css",
  "./app.js",
  "./import-recipe.js",
  "./apple-touch-icon.png",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(indexWithAssets(event.request));
    return;
  }

  if (url.pathname.endsWith("/firebase-config.js")) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(cacheFirst(event.request));
});

async function indexWithAssets(request) {
  const response = await networkFirst(request);
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html")) return response;

  const html = await response.text();
  const withMobileCss = html.includes("mobile-grid.css")
    ? html
    : html.replace(
      '<link rel="stylesheet" href="styles.css">',
      '<link rel="stylesheet" href="styles.css">\n<link rel="stylesheet" href="./mobile-grid.css">'
    );
  const withLogoCss = withMobileCss.includes("logo-theme.css")
    ? withMobileCss
    : withMobileCss.replace(
      '<link rel="stylesheet" href="styles.css">',
      '<link rel="stylesheet" href="styles.css">\n<link rel="stylesheet" href="./logo-theme.css">'
    );

  return new Response(withLogoCss, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
    return response;
  } catch {
    return caches.match(request) || caches.match("./index.html");
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
    return response;
  } catch {
    return caches.match("./index.html");
  }
}
