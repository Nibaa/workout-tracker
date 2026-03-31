/// <reference lib="webworker" />

const CACHE_NAME = 'workout-tracker-v1';

const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => {
			return cache.addAll(['/']);
		})
	);
	sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) => {
			return Promise.all(
				keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
			);
		})
	);
	sw.clients.claim();
});

sw.addEventListener('fetch', (event) => {
	// Network-first strategy for navigation, cache-first for assets
	if (event.request.mode === 'navigate') {
		event.respondWith(
			fetch(event.request).catch(() => caches.match('/') as Promise<Response>)
		);
	} else {
		event.respondWith(
			caches.match(event.request).then((cached) => {
				return cached || fetch(event.request).then((response) => {
					if (response.ok) {
						const clone = response.clone();
						caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
					}
					return response;
				});
			})
		);
	}
});
