/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

// Android Chromeのインストール要件を満たすため、ナビゲーションをオフラインでも
// 処理する。認証済みHTML・API・ユーザー固有データは保存せず、固定の公開ページだけを扱う。

const sw = self as unknown as ServiceWorkerGlobalScope;

const OFFLINE_CACHE_PREFIX = 'lowest-finder-offline-';
const OFFLINE_CACHE = `${OFFLINE_CACHE_PREFIX}v1`;
const OFFLINE_URL = '/offline.html';
// 旧SWがSvelteKitの数値versionで作ったキャッシュ。認証済みHTMLを含み得るため移行時に破棄する。
const LEGACY_ASSET_CACHE = /^cache-\d+$/;

sw.addEventListener('install', (event) => {
	event.waitUntil(
		Promise.all([
			caches
				.open(OFFLINE_CACHE)
				.then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' }))),
			sw.skipWaiting()
		])
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		Promise.all([
			caches
				.keys()
				.then((names) =>
					Promise.all(
						names
							.filter(
								(name) =>
									(name.startsWith(OFFLINE_CACHE_PREFIX) && name !== OFFLINE_CACHE) ||
									LEGACY_ASSET_CACHE.test(name)
							)
							.map((name) => caches.delete(name))
					)
				),
			sw.clients.claim()
		])
	);
});

sw.addEventListener('fetch', (event) => {
	if (event.request.mode !== 'navigate') return;

	event.respondWith(
		fetch(event.request).catch(async () => {
			const offlinePage = await caches.match(OFFLINE_URL);
			return (
				offlinePage ??
				new Response('オフラインです。通信状態を確認してから、もう一度お試しください。', {
					status: 503,
					headers: { 'Content-Type': 'text/plain; charset=utf-8' }
				})
			);
		})
	);
});
