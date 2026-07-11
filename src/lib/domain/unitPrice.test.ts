import { describe, it, expect } from 'vitest';
import { unitPrice, sortItemsByUnitPrice } from './unitPrice';

const item = (price: number, volume: number, id = '') => ({ id, price, volume });

describe('unitPrice', () => {
	it('価格 ÷ 内容量 を返す', () => {
		expect(unitPrice({ price: 300, volume: 1500 })).toBe(0.2);
	});

	it('内容量が 0 なら null', () => {
		expect(unitPrice({ price: 300, volume: 0 })).toBeNull();
	});

	it('内容量が負なら null', () => {
		expect(unitPrice({ price: 300, volume: -100 })).toBeNull();
	});

	it('内容量が NaN なら null', () => {
		expect(unitPrice({ price: 300, volume: Number.NaN })).toBeNull();
	});

	it('価格が非有限値なら null', () => {
		expect(unitPrice({ price: Number.POSITIVE_INFINITY, volume: 100 })).toBeNull();
	});
});

describe('sortItemsByUnitPrice', () => {
	it('単価の安い順に並べる', () => {
		const items = [
			item(200, 600, 'a'), // 0.333
			item(300, 1380, 'b'), // 0.217
			item(350, 1200, 'c') // 0.291
		];
		const sorted = sortItemsByUnitPrice(items);
		expect(sorted.map((i) => i.id)).toEqual(['b', 'c', 'a']);
	});

	it('元の配列を破壊しない', () => {
		const items = [item(200, 600, 'a'), item(300, 1380, 'b')];
		const before = items.map((i) => i.id);
		sortItemsByUnitPrice(items);
		expect(items.map((i) => i.id)).toEqual(before);
	});

	it('単価を算出できないアイテムは末尾へ回す', () => {
		const items = [
			item(100, 0, 'bad'), // null
			item(300, 1380, 'b'), // 0.217
			item(200, 600, 'a') // 0.333
		];
		const sorted = sortItemsByUnitPrice(items);
		expect(sorted.map((i) => i.id)).toEqual(['b', 'a', 'bad']);
	});

	it('単価が同値なら元の順序を保つ(安定ソート)', () => {
		const items = [
			item(200, 1000, 'x'), // 0.2
			item(100, 500, 'y') // 0.2
		];
		const sorted = sortItemsByUnitPrice(items);
		expect(sorted.map((i) => i.id)).toEqual(['x', 'y']);
	});

	it('空配列でも壊れない', () => {
		expect(sortItemsByUnitPrice([])).toEqual([]);
	});
});
