import { parse, type HTMLElement } from 'node-html-parser';
import { parsePrice, extractFromJsonLd } from './parse';

export interface ScrapeResult {
	price: number | null;
	name: string | null;
	adapter: string;
}

interface Adapter {
	name: string;
	matches(url: URL): boolean;
	extract(root: HTMLElement): { price: number | null; name: string | null };
}

/** ページ内の JSON-LD ブロックを集める。 */
function jsonLdBlocks(root: HTMLElement): string[] {
	return root
		.querySelectorAll('script[type="application/ld+json"]')
		.map((s) => s.rawText || s.text || '')
		.filter(Boolean);
}

function ogTitle(root: HTMLElement): string | null {
	const el = root.querySelector('meta[property="og:title"]');
	const content = el?.getAttribute('content')?.trim();
	return content || null;
}

/** Amazon(amazon.co.jp 等)。 */
const amazon: Adapter = {
	name: 'amazon',
	matches: (url) => /(^|\.)amazon\./i.test(url.hostname),
	extract(root) {
		const name =
			root.querySelector('#productTitle')?.text.trim() || ogTitle(root) || null;

		// 1) 表示価格 .a-price .a-offscreen(例: <span class="a-offscreen">¥1,380</span>)
		let price = parsePrice(root.querySelector('.a-price .a-offscreen')?.text);

		// 2) ページ埋め込み JSON の priceAmount
		if (price === null) {
			const m = root.innerHTML.match(/"priceAmount"\s*:\s*([\d.]+)/);
			if (m) price = parsePrice(m[1]);
		}

		// 3) JSON-LD フォールバック
		if (price === null) {
			const jl = extractFromJsonLd(jsonLdBlocks(root));
			price = jl.price;
		}
		return { price, name };
	}
};

/** ヨドバシ(yodobashi.com)。 */
const yodobashi: Adapter = {
	name: 'yodobashi',
	matches: (url) => /(^|\.)yodobashi\.com$/i.test(url.hostname),
	extract(root) {
		const name =
			root.querySelector('h1')?.text.trim() || ogTitle(root) || null;

		// 1) itemprop=price の meta
		let price = parsePrice(
			root.querySelector('meta[itemprop="price"]')?.getAttribute('content')
		);

		// 2) 価格表示要素(クラス名は変わりうるので複数試す)
		if (price === null) {
			const el =
				root.querySelector('.productPrice') ??
				root.querySelector('[class*="price" i] .red') ??
				root.querySelector('[class*="Price"]');
			price = parsePrice(el?.text);
		}

		// 3) JSON-LD フォールバック
		if (price === null) {
			price = extractFromJsonLd(jsonLdBlocks(root)).price;
		}
		return { price, name };
	}
};

/** 汎用 JSON-LD(未対応サイト向けのベストエフォート)。 */
const generic: Adapter = {
	name: 'jsonld',
	matches: () => true,
	extract(root) {
		const jl = extractFromJsonLd(jsonLdBlocks(root));
		return { price: jl.price, name: jl.name ?? ogTitle(root) };
	}
};

const ADAPTERS: Adapter[] = [amazon, yodobashi, generic];

/**
 * URL と HTML から価格・商品名を抽出する。
 * サイト別アダプタを優先し、価格が取れなければ汎用 JSON-LD にフォールバックする。
 */
export function extract(url: URL, html: string): ScrapeResult {
	const root = parse(html);
	const site = ADAPTERS.find((a) => a.name !== 'jsonld' && a.matches(url));

	if (site) {
		const r = site.extract(root);
		if (r.price !== null) return { ...r, adapter: site.name };
		// サイト別で価格が取れなければ汎用にフォールバック。
		const g = generic.extract(root);
		return {
			price: g.price,
			name: r.name ?? g.name,
			adapter: g.price !== null ? 'jsonld' : site.name
		};
	}

	const g = generic.extract(root);
	return { ...g, adapter: 'jsonld' };
}
