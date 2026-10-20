import { describe, it, expect } from 'vitest';
import { scrapeSequentially, SCRAPE_INTERVAL_MS } from './scrapeAll';

describe('scrapeSequentially', () => {
	it('間隔を空けて順に取得し、失敗を集めて続行する', async () => {
		const log: string[] = [];
		const progress: number[] = [];
		const failed = await scrapeSequentially(
			['a', 'b', 'c'],
			async (t) => {
				log.push(t);
				if (t === 'b') throw new Error('x');
			},
			(d) => progress.push(d),
			undefined,
			async (ms) => {
				log.push(`wait${ms}`);
			}
		);
		expect(log).toEqual(['a', `wait${SCRAPE_INTERVAL_MS}`, 'b', `wait${SCRAPE_INTERVAL_MS}`, 'c']);
		expect(progress).toEqual([1, 2, 3]);
		expect(failed).toEqual(['b']);
	});

	it('レート制限(毎分10回)を超えない間隔である', () => {
		expect(SCRAPE_INTERVAL_MS).toBeGreaterThan(60_000 / 10);
	});

	it('中止されたら次へ進まない', async () => {
		const done: string[] = [];
		let cancelled = false;
		await scrapeSequentially(
			['a', 'b'],
			async (t) => {
				done.push(t);
				cancelled = true;
			},
			() => {},
			() => cancelled,
			async () => {}
		);
		expect(done).toEqual(['a']);
	});
});
