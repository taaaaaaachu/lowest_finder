/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';
import { strategyFor } from '$lib/sw/strategy';

// アプリ本体(ビルド成果物・静的ファイル)をプリキャッシュし、オフラインでも起動できるようにする。
// 画面遷移の HTML は network-first で保存する。HTML にはユーザー情報が埋め込まれるため、
// 認証状態が変わる POST でページキャッシュを消す。API レスポンスは保存しない。

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE_PREFIX = 'lowest-finder-';
// 版ごとに分ける。古い HTML が消えた旧アセットを参照しないよう、ページも版ごと。
const ASSET_CACHE = `${CACHE_PREFIX}assets-${version}`;
const PAGE_CACHE = `${CACHE_PREFIX}pages-${version}`;
const OFFLINE_URL = '/offline.html';
const PRECACHED = new Set([...build, ...files]);
// 旧SWがSvelteKitの数値versionで作ったキャッシュ。認証済みHTMLを含み得るため移行時に破棄する。
const LEGACY_ASSET_CACHE = /^cache-\d+$/;

sw.addEventListener('install', (event) => {
	event.waitUntil(
		Promise.all([
			caches
				.open(ASSET_CACHE)
				.then((cache) =>
					cache.addAll([...PRECACHED].map((url) => new Request(url, { cache: 'reload' })))
				),
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
									(name.startsWith(CACHE_PREFIX) && name !== ASSET_CACHE && name !== PAGE_CACHE) ||
									LEGACY_ASSET_CACHE.test(name)
							)
							.map((name) => caches.delete(name))
					)
				),
			sw.clients.claim()
		])
	);
});

async function cacheFirst(request: Request): Promise<Response> {
	return (await caches.match(request, { cacheName: ASSET_CACHE })) ?? fetch(request);
}

// network-first。成功した応答を保存し、通信できなければ保存済みを返す。
async function networkFirstPage(request: Request): Promise<Response> {
	try {
		const response = await fetch(request);
		if (response.ok && !response.redirected && response.type === 'basic') {
			const cache = await caches.open(PAGE_CACHE);
			await cache.put(request, response.clone());
		}
		return response;
	} catch (error) {
		const cached = await caches.match(request, { cacheName: PAGE_CACHE });
		if (cached) return cached;
		// __data.json は SvelteKit 側にエラーを返し、画面遷移だけオフラインページへ。
		if (request.mode !== 'navigate') throw error;
		return (
			(await caches.match(OFFLINE_URL, { cacheName: ASSET_CACHE })) ??
			new Response('オフラインです。通信状態を確認してから、もう一度お試しください。', {
				status: 503,
				headers: { 'Content-Type': 'text/plain; charset=utf-8' }
			})
		);
	}
}

sw.addEventListener('fetch', (event) => {
	switch (strategyFor(event.request, sw.location.origin, PRECACHED)) {
		case 'precache':
			event.respondWith(cacheFirst(event.request));
			return;
		case 'page':
			event.respondWith(networkFirstPage(event.request));
			return;
		case 'clear-user':
			event.waitUntil(caches.delete(PAGE_CACHE));
			return;
	}
});
