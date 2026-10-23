import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface ManifestIcon {
	src: string;
	sizes: string;
	type: string;
	purpose?: string;
}

interface WebAppManifest {
	name: string;
	short_name: string;
	description: string;
	id?: string;
	start_url: string;
	scope: string;
	display: string;
	background_color: string;
	theme_color: string;
	lang: string;
	icons: ManifestIcon[];
}

const projectFile = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url));
const projectText = (path: string) => projectFile(path).toString('utf8');

const manifest = JSON.parse(projectText('static/manifest.webmanifest')) as WebAppManifest;
const appTemplate = projectText('src/app.html');
const serviceWorker = projectText('src/service-worker/index.ts');
const rootLayout = projectText('src/routes/+layout.svelte');
const viteConfig = projectText('vite.config.ts');
const offlinePage = projectText('static/offline.html');

function pngDimensions(path: string): { width: number; height: number } {
	const png = projectFile(path);
	expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
	return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe('Android WebAPK向けPWA', () => {
	it('インストールに必要なmanifestメタデータを公開する', () => {
		expect(manifest).toMatchObject({
			name: 'Lowest Finder',
			short_name: 'LowestFinder',
			id: '/',
			start_url: '/',
			scope: '/',
			display: 'standalone',
			lang: 'ja'
		});
		expect(manifest.description).not.toBe('');
		expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
		expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
	});

	it.each([
		['icons/icon-192.png', '192x192', 'any', 192],
		['icons/icon-512.png', '512x512', 'any', 512],
		['icons/maskable-192.png', '192x192', 'maskable', 192],
		['icons/maskable-512.png', '512x512', 'maskable', 512]
	])('%sを正しいPNG寸法で提供する', (src, sizes, purpose, pixels) => {
		expect(manifest.icons).toContainEqual({
			src: `/${src}`,
			sizes,
			type: 'image/png',
			purpose
		});
		expect(pngDimensions(`static/${src}`)).toEqual({ width: pixels, height: pixels });
	});

	it('SVGをWebAPKの主要アイコン候補にしない', () => {
		expect(manifest.icons).not.toContainEqual(
			expect.objectContaining({ type: 'image/svg+xml', sizes: 'any' })
		);
	});

	it('最終HTMLテンプレートにアプリ名とPWAメタデータを含める', () => {
		expect(appTemplate).toContain('<title>Lowest Finder</title>');
		expect(appTemplate).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
		expect(appTemplate).toContain('<meta name="theme-color" content="#2563eb" />');
		expect(appTemplate).toContain('<link rel="icon"');
	});

	it('アプリ本体をプリキャッシュし、認証状態が変わるとページキャッシュを消す', () => {
		expect(serviceWorker).toContain("const OFFLINE_URL = '/offline.html'");
		expect(serviceWorker).toContain("import { immutable, assets } from '$app/manifest'");
		expect(serviceWorker).toContain("import { version } from '$app/env'");
		expect(serviceWorker).toContain('strategyFor(event.request');
		expect(serviceWorker).toContain('caches.delete(PAGE_CACHE)');
		expect(serviceWorker).toContain('deleteMemberDbs()');
		expect(serviceWorker).toContain('const LEGACY_ASSET_CACHE = /^cache-\\d+$/');
		expect(serviceWorker).toContain('LEGACY_ASSET_CACHE.test(name)');
		expect(offlinePage).toContain('<title>オフライン | Lowest Finder</title>');
		expect(offlinePage).toContain('通信状態を確認');
		expect(offlinePage).toContain('再読み込み');
	});

	it('自動登録を無効化し、ビルドversion付きURLで一元登録する', () => {
		expect(viteConfig).toMatch(/serviceWorker:\s*{\s*[^}]*register:\s*false/s);
		expect(rootLayout).toContain("import { version } from '$app/env'");
		expect(rootLayout).toMatch(
			/\.register\(`\/service-worker\.js\?v=\$\{encodeURIComponent\(version\)\}`,\s*{[^}]*scope:\s*['"]\/['"][^}]*type:\s*['"]module['"][^}]*updateViaCache:\s*['"]none['"]/s
		);
	});
});
