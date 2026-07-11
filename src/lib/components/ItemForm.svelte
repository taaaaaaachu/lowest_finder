<script lang="ts">
	import type { Item } from '$lib/types';
	import type { ItemInput } from '$lib/repo/types';

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

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		localError = null;
		const v = Number(volume);
		const p = Number(price);
		if (!Number.isFinite(v) || v <= 0) {
			localError = '内容量は 0 より大きい数値を入力してください。';
			return;
		}
		if (!Number.isFinite(p) || p < 0) {
			localError = '価格は 0 以上の数値を入力してください。';
			return;
		}
		submitting = true;
		try {
			await onsubmit({
				groupId,
				name: name.trim() || null,
				volume: v,
				price: p,
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

<form class="item-form" onsubmit={handleSubmit}>
	<div class="grid">
		<label class="field">
			<span>名前 / ラベル(任意)</span>
			<input type="text" bind:value={name} placeholder="詰替、本体 など" />
		</label>
		<label class="field">
			<span>内容量{unitLabel.trim() ? `(${unitLabel.trim()})` : ''} *</span>
			<input type="number" inputmode="decimal" step="any" bind:value={volume} placeholder="1380" />
		</label>
		<label class="field">
			<span>価格(円)*</span>
			<input type="number" inputmode="decimal" step="any" bind:value={price} placeholder="300" />
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
</style>
