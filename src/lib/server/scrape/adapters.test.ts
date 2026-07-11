import { describe, it, expect } from 'vitest';
import { extract } from './adapters';

describe('extract - Amazon', () => {
	const url = new URL('https://www.amazon.co.jp/dp/B000000000');

	it('.a-price .a-offscreen から価格を取る', () => {
		const html = `<html><body>
			<span id="productTitle">食器用洗剤 詰替 1380ml</span>
			<div class="a-price"><span class="a-offscreen">¥1,380</span></div>
		</body></html>`;
		const r = extract(url, html);
		expect(r.price).toBe(1380);
		expect(r.name).toBe('食器用洗剤 詰替 1380ml');
		expect(r.adapter).toBe('amazon');
	});

	it('priceAmount 埋め込みJSONにフォールバック', () => {
		const html = `<html><body>
			<span id="productTitle">商品X</span>
			<script>var x = {"priceAmount": 298.0, "currency":"JPY"};</script>
		</body></html>`;
		const r = extract(url, html);
		expect(r.price).toBe(298);
	});
});

describe('extract - ヨドバシ', () => {
	const url = new URL('https://www.yodobashi.com/product/100000001003000000/');

	it('meta[itemprop=price] から価格を取る', () => {
		const html = `<html><head>
			<meta itemprop="price" content="2480">
			<meta property="og:title" content="ヨドバシ商品名">
		</head><body><h1>ヨドバシ商品名</h1></body></html>`;
		const r = extract(url, html);
		expect(r.price).toBe(2480);
		expect(r.name).toBe('ヨドバシ商品名');
		expect(r.adapter).toBe('yodobashi');
	});
});

describe('extract - 汎用 JSON-LD', () => {
	it('未対応サイトは JSON-LD から取得', () => {
		const url = new URL('https://example.com/item/1');
		const html = `<html><head>
			<script type="application/ld+json">
			{"@type":"Product","name":"汎用商品","offers":{"price":"777"}}
			</script></head><body></body></html>`;
		const r = extract(url, html);
		expect(r.price).toBe(777);
		expect(r.name).toBe('汎用商品');
		expect(r.adapter).toBe('jsonld');
	});

	it('価格が取れなければ price は null', () => {
		const url = new URL('https://example.com/item/2');
		const r = extract(url, '<html><body>価格情報なし</body></html>');
		expect(r.price).toBeNull();
	});
});
