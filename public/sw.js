const cacheName = 'spotistats';
const cachedItemExpiryTime = 1000 * 60 * 60 * 24 * 4 /* 4 Days */;
const precacheResources = [
    '/',
    '/index.css',
    '/index.js',
    '/jszip/jszip.min.js',
    '/manifest.webmanifest',
    '/fonts/montserrat-v18-latin-700.woff2',
    '/fonts/montserrat-v18-latin-regular.woff2',
    '/assets/placeholder.svg',
    '/assets/people-icon.svg',
    '/assets/lock-icon.svg',
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(cacheName)
            .then(cache => {
                return cache.addAll(precacheResources);
            })
    );
    console.log("Service worker installed!")
});

self.addEventListener('fetch', event => {
    let url = new URL(event.request.url);
    if (url.pathname == "/favourites" || url.pathname == "/taste" || url.pathname == "/recommendations" || url.pathname == "/export" || url.pathname == "/reset") {
        url.pathname = "/";
        event.request.url = url;
    }
    event.respondWith(
        caches.open(cacheName).then(cache => {
            return cache.match(event.request).then(response => {
                if (response) {
                    if (Date.now() < (new Date(response.headers.get('date'))).getTime() + cachedItemExpiryTime) {
                        return response;
                    } else {
                        return fetch(event.request).then(response => {
                            cache.put(event.request, response.clone());
                            return response;
                        }).catch(() => response)
                    }
                }
                return fetch(event.request);
            });
        })
    );
});