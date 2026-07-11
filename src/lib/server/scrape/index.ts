import { fetchHtml } from './fetcher';
import { extract, type ScrapeResult } from './adapters';

export { SsrfError } from './ssrf';
export { FetchError } from './fetcher';
export type { ScrapeResult };

/**
 * URL から価格・商品名をベストエフォートで取得する。
 * SSRF 対策済みの取得 → サイト別/汎用アダプタで抽出、の順。
 */
export async function scrapePrice(urlString: string): Promise<ScrapeResult> {
	const { finalUrl, html } = await fetchHtml(urlString);
	return extract(new URL(finalUrl), html);
}
