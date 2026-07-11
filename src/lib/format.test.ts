import { describe, it, expect } from 'vitest';
import { formatPrice, formatUnitPrice, formatDateTime } from './format';

describe('formatPrice', () => {
	it('¥ と桁区切りを付ける', () => {
		expect(formatPrice(1380)).toBe('¥1,380');
	});
	it('小数は丸める', () => {
		expect(formatPrice(199.6)).toBe('¥200');
	});
	it('非有限値は —', () => {
		expect(formatPrice(Number.NaN)).toBe('—');
	});
});

describe('formatUnitPrice', () => {
	it('1以上2桁未満は小数2桁 + 単位ラベル', () => {
		expect(formatUnitPrice(1.5, 'g')).toBe('¥1.50 / g');
	});
	it('1未満は末尾ゼロを落とす', () => {
		expect(formatUnitPrice(0.2174, 'ml')).toBe('¥0.2174 / ml');
		expect(formatUnitPrice(0.2, 'ml')).toBe('¥0.2 / ml');
	});
	it('100以上は整数', () => {
		expect(formatUnitPrice(250.7, '個')).toBe('¥251 / 個');
	});
	it('単位ラベルが空なら単位を付けない', () => {
		expect(formatUnitPrice(0.5, '  ')).toBe('¥0.5');
	});
	it('null は —', () => {
		expect(formatUnitPrice(null, 'ml')).toBe('—');
	});
});

describe('formatDateTime', () => {
	it('null は空文字', () => {
		expect(formatDateTime(null)).toBe('');
	});
	it('ゼロ埋めして整形する', () => {
		const epoch = new Date(2026, 6, 11, 9, 5).getTime(); // 2026/07/11 09:05
		expect(formatDateTime(epoch)).toBe('2026/07/11 09:05');
	});
});
