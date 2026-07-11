/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

// SvelteKit ネイティブの Service Worker。アプリシェル(ビルド成果物・静的ファイル)を
// キャッシュし、オフラインでも起動できるようにする。会員データ自体は
// IndexedDB(OfflineCache)側で扱うため、ここでは /api を積極キャッシュしない。

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `cache-${version}`;
const ASSETS = [...build, ...files];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key !== CACHE) await caches.delete(key);
			}
			await sw.clients.claim();
		})()
	);
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== location.origin) return;
	// API はオンライン前提。SW ではキャッシュせずネットワークに任せる。
	if (url.pathname.startsWith('/api/')) return;

	// ビルド済みアセットはキャッシュ優先(不変・version 付き)。
	if (ASSETS.includes(url.pathname)) {
		event.respondWith(
			caches.open(CACHE).then(async (cache) => {
				const cached = await cache.match(url.pathname);
				return cached ?? fetch(request);
			})
		);
		return;
	}

	// それ以外(ページ遷移など)はネットワーク優先、失敗時はキャッシュへフォールバック。
	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);
			try {
				const response = await fetch(request);
				if (response.ok) cache.put(request, response.clone());
				return response;
			} catch {
				const cached = await cache.match(request);
				if (cached) return cached;
				// 最低限、トップページのシェルを返して起動できるようにする。
				const shell = await cache.match('/');
				if (shell) return shell;
				throw new Error('オフラインで利用可能なキャッシュがありません。');
			}
		})()
	);
});
