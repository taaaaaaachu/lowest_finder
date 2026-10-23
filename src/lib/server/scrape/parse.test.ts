import { describe, it, expect } from 'vitest';
import { parsePrice, extractFromJsonLd } from './parse';

describe('parsePrice', () => {
	it('¥1,380 を 1380 に', () => {
		expect(parsePrice('¥1,380')).toBe(1380);
	});
	it('1,380円(税込)を 1380 に', () => {
		expect(parsePrice('1,380円(税込)')).toBe(1380);
	});
	it('全角スペースで区切られていても読む', () => {
		expect(parsePrice('価格　１，３８０円')).toBe(1380);
	});
	it('全角数字・全角￥に対応', () => {
		expect(parsePrice('￥１，３８０')).toBe(1380);
	});
	it('小数を含む価格', () => {
		expect(parsePrice('1234.50')).toBe(1234.5);
	});
	it('数値が無ければ null', () => {
		expect(parsePrice('価格未定')).toBeNull();
		expect(parsePrice('')).toBeNull();
		expect(parsePrice(null)).toBeNull();
	});
});

describe('extractFromJsonLd', () => {
	it('Product/offers から価格と名前を取り出す', () => {
		const block = JSON.stringify({
			'@context': 'https://schema.org',
			'@type': 'Product',
			name: '食器用洗剤 詰替 1380ml',
			offers: { '@type': 'Offer', price: '298', priceCurrency: 'JPY' }
		});
		const r = extractFromJsonLd([block]);
		expect(r.price).toBe(298);
		expect(r.name).toBe('食器用洗剤 詰替 1380ml');
	});
	it('配列/入れ子でも探索できる', () => {
		const block = JSON.stringify([
			{ '@type': 'BreadcrumbList' },
			{ '@type': 'Product', name: 'X', offers: [{ price: 500 }] }
		]);
		const r = extractFromJsonLd([block]);
		expect(r.price).toBe(500);
	});
	it('壊れた JSON は無視する', () => {
		const r = extractFromJsonLd(['{ broken', '{"@type":"Product","offers":{"price":100}}']);
		expect(r.price).toBe(100);
	});
});
