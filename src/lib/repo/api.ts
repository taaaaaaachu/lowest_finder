export interface ScrapeResponse {
	price: number | null;
	name: string | null;
	adapter: string;
}

/** URL から価格を取得する(会員限定)。price が null なら価格を特定できなかった。 */
export function scrapeUrl(url: string): Promise<ScrapeResponse> {
	return req<ScrapeResponse>('/api/scrape', {
		method: 'POST',
		body: JSON.stringify({ url })
	});
}

export async function req<T>(input: string, init?: RequestInit): Promise<T> {
	const res = await fetch(input, {
		...init,
		headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) }
	});
	if (!res.ok) {
		let message = `リクエストに失敗しました (${res.status})`;
		try {
			const body = await res.json();
			if (body?.message) message = body.message;
		} catch {
			/* JSON でないレスポンスはそのまま既定メッセージ */
		}
		throw new Error(message);
	}
	if (res.status === 204) return undefined as T;
	return res.json() as Promise<T>;
}
