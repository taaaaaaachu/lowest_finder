/** 価格を「¥1,380」のように整形する。 */
export function formatPrice(value: number): string {
	if (!Number.isFinite(value)) return '—';
	return '¥' + Math.round(value).toLocaleString('ja-JP');
}

/**
 * 単価を表示用に整形する。単位ラベルを添えて「¥0.22 / ml」のように出す。
 * null(算出不能)は「—」。
 */
export function formatUnitPrice(unitPrice: number | null, unitLabel: string): string {
	if (unitPrice === null) return '—';
	// 有効数字を確保しつつ冗長な桁を避ける。
	const rounded =
		unitPrice >= 100
			? unitPrice.toFixed(0)
			: unitPrice >= 1
				? unitPrice.toFixed(2)
				: unitPrice.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
	const label = unitLabel.trim() ? ` / ${unitLabel.trim()}` : '';
	return `¥${rounded}${label}`;
}

/** epoch ミリ秒を「2026/07/11 13:47」のように整形する。null は空文字。 */
export function formatDateTime(epochMs: number | null): string {
	if (epochMs === null) return '';
	const d = new Date(epochMs);
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
