/**
 * サーバーのレート制限(ユーザーあたり毎分10回 = 6秒に1回)に掛からないよう、
 * 余裕を持たせた間隔。
 */
export const SCRAPE_INTERVAL_MS = 7_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * 複数の対象を間隔を空けて1件ずつ取得する。失敗した対象を返す(途中で失敗しても続行)。
 * onProgress には完了件数を渡す。isCancelled が true を返したら次の対象へ進まない。
 */
export async function scrapeSequentially<T>(
	targets: T[],
	scrapeOne: (target: T) => Promise<void>,
	onProgress: (done: number) => void,
	isCancelled: () => boolean = () => false,
	wait: (ms: number) => Promise<void> = sleep
): Promise<T[]> {
	const failed: T[] = [];
	for (let i = 0; i < targets.length; i++) {
		if (i > 0) await wait(SCRAPE_INTERVAL_MS);
		if (isCancelled()) break;
		try {
			await scrapeOne(targets[i]);
		} catch {
			failed.push(targets[i]);
		}
		onProgress(i + 1);
	}
	return failed;
}
