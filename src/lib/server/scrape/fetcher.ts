import { assertPublicUrl, SsrfError } from './ssrf';

const MAX_BYTES = 2 * 1024 * 1024; // 2MB 上限
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;
// 一般的なブラウザ UA を名乗る(bot 判定を多少避ける。突破は保証しない)。
const USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export class FetchError extends Error {}

/**
 * SSRF 対策を施した上で URL の HTML を取得する。
 * - 各ホップ(リダイレクト含む)ごとに公開 URL 検証
 * - タイムアウト・サイズ上限・リダイレクト回数上限
 */
export async function fetchHtml(urlString: string): Promise<{ finalUrl: string; html: string }> {
	let current = urlString;

	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		const url = await assertPublicUrl(current); // 内部アドレスなら SsrfError

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
		let res: Response;
		try {
			res = await fetch(url, {
				method: 'GET',
				redirect: 'manual', // リダイレクトは自前で検証しながら追う
				signal: controller.signal,
				headers: {
					'user-agent': USER_AGENT,
					accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
					'accept-language': 'ja,en;q=0.8'
				}
			});
		} catch (e) {
			clearTimeout(timer);
			if (e instanceof Error && e.name === 'AbortError') {
				throw new FetchError('取得がタイムアウトしました。');
			}
			throw new FetchError('ページを取得できませんでした。');
		}
		clearTimeout(timer);

		// リダイレクト応答は Location を検証して次ホップへ。
		if (res.status >= 300 && res.status < 400) {
			const location = res.headers.get('location');
			if (!location) throw new FetchError('リダイレクト先が不明です。');
			current = new URL(location, url).toString();
			continue;
		}

		if (!res.ok) {
			throw new FetchError(`ページの取得に失敗しました (${res.status})。`);
		}

		const html = await readCapped(res, MAX_BYTES);
		return { finalUrl: url.toString(), html };
	}

	throw new FetchError('リダイレクトが多すぎます。');
}

/** レスポンスボディを最大 maxBytes まで読み、超えたら打ち切る。 */
async function readCapped(res: Response, maxBytes: number): Promise<string> {
	if (!res.body) return await res.text();
	const reader = res.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) {
			total += value.length;
			if (total > maxBytes) {
				await reader.cancel();
				break;
			}
			chunks.push(value);
		}
	}
	return new TextDecoder('utf-8').decode(concat(chunks));
}

function concat(chunks: Uint8Array[]): Uint8Array {
	const total = chunks.reduce((n, c) => n + c.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const c of chunks) {
		out.set(c, offset);
		offset += c.length;
	}
	return out;
}

export { SsrfError };
