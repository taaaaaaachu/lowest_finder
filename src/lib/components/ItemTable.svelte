<script lang="ts">
	import type { Item } from '$lib/types';
	import type { ItemInput } from '$lib/repo/types';
	import { unitPrice } from '$lib/domain/unitPrice';
	import { formatPrice, formatUnitPrice, formatDateTime } from '$lib/format';
	import ItemForm from './ItemForm.svelte';

	interface Props {
		/** 単価順にソート済みの想定。 */
		items: Item[];
		unitLabel: string;
		onedit: (item: Item) => void;
		ondelete: (item: Item) => void;
		/** URL から価格取得(会員モードのみ渡す)。未指定なら取得ボタンを出さない。 */
		onscrape?: (item: Item) => void;
		/** 価格取得中のアイテムID。 */
		scrapingId?: string | null;
		/** 編集中のアイテム。指定した行の直下に編集フォームを展開する。 */
		editingItem?: Item | null;
		onsubmitEdit: (input: ItemInput) => Promise<void> | void;
		oncancelEdit: () => void;
	}

	let {
		items,
		unitLabel,
		onedit,
		ondelete,
		onscrape,
		scrapingId = null,
		editingItem = null,
		onsubmitEdit,
		oncancelEdit
	}: Props = $props();

	// 最安(単価が算出できる先頭)を強調するため、最小単価を求める。
	const cheapestId = $derived.by(() => {
		let bestId: string | null = null;
		let best = Number.POSITIVE_INFINITY;
		for (const it of items) {
			const up = unitPrice(it);
			if (up !== null && up < best) {
				best = up;
				bestId = it.id;
			}
		}
		return bestId;
	});
</script>

{#if items.length === 0}
	<p class="empty">まだ商品がありません。下のフォームから追加してください。</p>
{:else}
	<ul class="rows">
		{#each items as item (item.id)}
			{@const up = unitPrice(item)}
			<li class="row" class:best={item.id === cheapestId}>
				<div class="main">
					<div class="top">
						<span class="unit">{formatUnitPrice(up, unitLabel)}</span>
						{#if item.id === cheapestId}<span class="badge">最安</span>{/if}
					</div>
					<div class="sub">
						<span class="label">{item.name || '(名前なし)'}</span>
						<span class="detail">
							{item.volume.toLocaleString('ja-JP')}{unitLabel.trim()} · {formatPrice(item.price)}
						</span>
					</div>
					{#if item.url}
						<div class="meta">
							<a href={item.url} target="_blank" rel="noopener noreferrer">商品ページ ↗</a>
							{#if item.lastFetchedAt}
								<span class="fetched">取得: {formatDateTime(item.lastFetchedAt)}</span>
							{/if}
						</div>
					{/if}
				</div>
				<div class="ops">
					{#if onscrape && item.url}
						<button
							type="button"
							class="scrape"
							onclick={() => onscrape(item)}
							disabled={scrapingId === item.id}
						>
							{scrapingId === item.id ? '取得中…' : '価格取得'}
						</button>
					{/if}
					<button type="button" onclick={() => onedit(item)} aria-label="編集">編集</button>
					<button type="button" class="danger" onclick={() => ondelete(item)} aria-label="削除">
						削除
					</button>
				</div>
			</li>
			{#if editingItem?.id === item.id}
				<li class="edit-row">
					{#key editingItem.id}
						<ItemForm
							groupId={editingItem.groupId}
							{unitLabel}
							item={editingItem}
							onsubmit={onsubmitEdit}
							oncancel={oncancelEdit}
						/>
					{/key}
				</li>
			{/if}
		{/each}
	</ul>
{/if}

<style>
	.empty {
		color: var(--muted);
		text-align: center;
		padding: 1.5rem 0;
	}

	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.7rem 0.85rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}

	.row.best {
		border-color: var(--best);
		background: var(--best-bg);
	}

	.edit-row {
		padding: 0.85rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}

	.main {
		min-width: 0;
	}

	.top {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}

	.unit {
		font-size: 1.1rem;
		font-weight: 700;
	}

	.badge {
		font-size: 0.7rem;
		font-weight: 700;
		color: #fff;
		background: var(--best);
		border-radius: 999px;
		padding: 0.1rem 0.5rem;
	}

	.sub {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.6rem;
		font-size: 0.9rem;
		margin-top: 0.15rem;
	}

	.sub .label {
		font-weight: 600;
	}

	.sub .detail {
		color: var(--muted);
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		font-size: 0.8rem;
		margin-top: 0.2rem;
	}

	.fetched {
		color: var(--muted);
	}

	.ops {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex-shrink: 0;
	}

	.scrape {
		color: var(--primary);
		border-color: var(--primary);
		font-size: 0.85rem;
	}
</style>
