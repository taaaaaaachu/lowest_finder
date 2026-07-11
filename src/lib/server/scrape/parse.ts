/**
 * 日本語の価格表記から数値を取り出す。
 * 「¥1,380」「1,380円」「1380 円(税込)」「￥1,380」等に対応。
 * 取れなければ null。
 */
export function parsePrice(text: string | null | undefined): number | null {
	if (!text) return null;
	// 全角数字・全角カンマ・全角￥を半角へ寄せる。
	const normalized = text
		.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
		.replace(/，/g, ',')
		.replace(/[￥　]/g, ' ');
	// 「1,380」または「1380」「1380.00」を拾う。最初に見つかった金額らしき数を採用。
	const m = normalized.match(/(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/);
	if (!m) return null;
	const value = Number(m[0].replace(/,/g, ''));
	if (!Number.isFinite(value) || value <= 0) return null;
	return value;
}

/**
 * JSON-LD(schema.org)から Product/Offer の価格と名前を探す。
 * ページ中の全 <script type="application/ld+json"> を対象に再帰探索する。
 */
export function extractFromJsonLd(jsonLdBlocks: string[]): {
	price: number | null;
	name: string | null;
} {
	let price: number | null = null;
	let name: string | null = null;

	const visit = (node: unknown) => {
		if (node === null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const el of node) visit(el);
			return;
		}
		const obj = node as Record<string, unknown>;

		// offers.price / price を拾う。
		if (price === null && 'price' in obj) {
			const p = parsePrice(String(obj.price));
			if (p !== null) price = p;
		}
		if (name === null && typeof obj.name === 'string' && obj.name.trim()) {
			// Product らしきものの name を優先。
			const type = String(obj['@type'] ?? '');
			if (/product/i.test(type) || !name) name = obj.name.trim();
		}
		for (const value of Object.values(obj)) visit(value);
	};

	for (const block of jsonLdBlocks) {
		try {
			visit(JSON.parse(block));
		} catch {
			/* 壊れた JSON-LD は無視 */
		}
	}
	return { price, name };
}
