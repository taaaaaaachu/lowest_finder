import type { Item } from '$lib/types';

/**
 * 単価 = 価格 ÷ 内容量。
 * 内容量が 0 以下や非有限値の場合は単価を定義できないため null を返す。
 */
export function unitPrice(item: Pick<Item, 'price' | 'volume'>): number | null {
	if (!Number.isFinite(item.volume) || item.volume <= 0) return null;
	if (!Number.isFinite(item.price)) return null;
	return item.price / item.volume;
}

/**
 * グループ内の商品を単価の安い順(昇順)に並べた新しい配列を返す。
 * 元配列は破壊しない。
 * 単価が算出できない(null)アイテムは常に末尾へ回す。
 * 単価が同値の場合は元の並び順を保つ(安定ソート)。
 */
export function sortItemsByUnitPrice<T extends Pick<Item, 'price' | 'volume'>>(items: T[]): T[] {
	return items
		.map((item, index) => ({ item, index, up: unitPrice(item) }))
		.sort((a, b) => {
			if (a.up === null && b.up === null) return a.index - b.index;
			if (a.up === null) return 1;
			if (b.up === null) return -1;
			if (a.up === b.up) return a.index - b.index;
			return a.up - b.up;
		})
		.map((entry) => entry.item);
}
