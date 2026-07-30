<script lang="ts">
	import type { Item } from '$lib/types';
	import type { ItemInput } from '$lib/repo/types';
	import { evaluateExpression, stripCommas, type EvalResult } from '$lib/domain/expression';

	interface Props {
		groupId: string;
		unitLabel: string;
		/** 編集対象。指定時は編集モード。 */
		item?: Item | null;
		onsubmit: (input: ItemInput) => Promise<void> | void;
		oncancel?: () => void;
	}

	let { groupId, unitLabel, item = null, onsubmit, oncancel }: Props = $props();

	let name = $state(item?.name ?? '');
	let volume = $state(item ? String(item.volume) : '');
	let price = $state(item ? String(item.price) : '');
	let url = $state(item?.url ?? '');
	let submitting = $state(false);
	let localError = $state<string | null>(null);

	const isEdit = item !== null;

	// 価格・内容量は計算式(例: 100 * 3)も受け付ける。入力するたびに評価する。
	const volumeResult = $derived(evaluateExpression(volume));
	const priceResult = $derived(evaluateExpression(price));

	/** 入力が計算式(単なる数値ではない)かどうか。式のときだけプレビューを出す。 */
	function isExpression(input: string): boolean {
		return /[+\-*/()]/.test(input.trim().replace(/^[+-]/, ''));
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		localError = null;
		if (!volumeResult.ok || volumeResult.value <= 0) {
			localError = '内容量は 0 より大きい数値(または計算式)を入力してください。';
			return;
		}
		if (!priceResult.ok || priceResult.value < 0) {
			localError = '価格は 0 以上の数値(または計算式)を入力してください。';
			return;
		}
		submitting = true;
		try {
			await onsubmit({
				groupId,
				name: name.trim() || null,
				volume: volumeResult.value,
				price: priceResult.value,
				url: url.trim() || null
			});
			if (!isEdit) {
				// 追加モードは続けて入力できるようリセット。
				name = '';
				volume = '';
				price = '';
				url = '';
			}
		} finally {
			submitting = false;
		}
	}
</script>

<!-- 計算式のときだけ、欄の下に「= 結果」または不正メッセージを即時表示する。 -->
{#snippet calcPreview(raw: string, result: EvalResult)}
	{#if isExpression(raw)}
		{#if result.ok}
			<span class="calc ok">= {result.value.toLocaleString('ja-JP', { maximumFractionDigits: 4 })}</span>
		{:else if result.reason === 'invalid'}
			<span class="calc bad">式が正しくありません</span>
		{/if}
	{/if}
{/snippet}

<form class="item-form" onsubmit={handleSubmit}>
	<div class="grid">
		<label class="field">
			<span>名前 / ラベル(任意)</span>
			<input type="text" bind:value={name} placeholder="詰替、本体 など" />
		</label>
		<label class="field">
			<span>内容量{unitLabel.trim() ? `(${unitLabel.trim()})` : ''} *</span>
			<input
				type="text"
				inputmode="text"
				bind:value={volume}
				oninput={() => (volume = stripCommas(volume))}
				placeholder="1380 または 690*2"
			/>
			{@render calcPreview(volume, volumeResult)}
		</label>
		<label class="field">
			<span>価格(円)*</span>
			<input
				type="text"
				inputmode="text"
				bind:value={price}
				oninput={() => (price = stripCommas(price))}
				placeholder="300 または 1000*1.1"
			/>
			{@render calcPreview(price, priceResult)}
		</label>
		<label class="field url">
			<span>URL(任意)</span>
			<input type="url" bind:value={url} placeholder="https://..." />
		</label>
	</div>

	{#if localError}
		<p class="err">{localError}</p>
	{/if}

	<div class="actions">
		<button type="submit" class="primary" disabled={submitting}>
			{isEdit ? '保存' : '追加'}
		</button>
		{#if oncancel}
			<button type="button" onclick={oncancel} disabled={submitting}>キャンセル</button>
		{/if}
	</div>
</form>

<style>
	.item-form {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.85rem;
		color: var(--muted);
	}

	.field.url {
		grid-column: 1 / -1;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
	}

	.err {
		margin: 0;
		color: var(--danger);
		font-size: 0.85rem;
	}

	.calc {
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
	}

	.calc.ok {
		color: var(--text);
		font-weight: 600;
	}

	.calc.bad {
		color: var(--danger);
	}
</style>
