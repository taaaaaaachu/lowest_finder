import { error } from '@sveltejs/kit';
import { requireUser } from '#lib/server/apiGuard.js';
import { scrapePrice, SsrfError, FetchError } from '#lib/server/scrape/index.js';
import { rateLimit } from '#lib/server/rateLimit.js';
import type { RequestHandler } from './$types';

/** 価格取得(会員限定)。POST { url } → { price, name, adapter }。 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const user = requireUser(locals);

	// ユーザーあたり毎分10回まで。
	const rl = rateLimit(`scrape:${user.id}`, 10, 60_000);
	if (!rl.allowed) {
		throw error(429, `リクエストが多すぎます。${rl.retryAfterSec}秒後に再試行してください。`);
	}

	const body = await request.json().catch(() => null);
	const url = typeof body?.url === 'string' ? body.url.trim() : '';
	if (!url) throw error(400, 'URL を指定してください。');

	try {
		const result = await scrapePrice(url);
		if (result.price === null) {
			// 取得はできたが価格を特定できなかった(手入力フォールバックへ)。
			return Response.json({ price: null, name: result.name, adapter: result.adapter }, { status: 200 });
		}
		return Response.json(result);
	} catch (e) {
		if (e instanceof SsrfError) throw error(400, e.message);
		if (e instanceof FetchError) throw error(502, e.message);
		throw error(500, '価格の取得中にエラーが発生しました。');
	}
};
