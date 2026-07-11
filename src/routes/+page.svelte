<script lang="ts">
	import { onMount } from 'svelte';
	import { app } from '$lib/stores/app.svelte';
	import { IndexedDbRepository } from '$lib/repo/indexeddb';
	import type { Item } from '$lib/types';
	import type { ItemInput } from '$lib/repo/types';
	import ItemForm from '$lib/components/ItemForm.svelte';
	import ItemTable from '$lib/components/ItemTable.svelte';

	let ready = $state(false);

	// グループ作成フォーム
	let newTitle = $state('');
	let newUnit = $state('');

	// 商品編集中の対象(null なら追加モード)
	let editingItem = $state<Item | null>(null);

	onMount(async () => {
		// IndexedDB はブラウザ専用のため、マウント後に初期化する。
		await app.setRepository(new IndexedDbRepository());
		ready = true;
	});

	async function createGroup(e: SubmitEvent) {
		e.preventDefault();
		if (!newTitle.trim()) return;
		await app.addGroup({ title: newTitle.trim(), unitLabel: newUnit.trim() });
		newTitle = '';
		newUnit = '';
	}

	async function handleAddItem(input: ItemInput) {
		await app.addItem(input);
	}

	async function handleUpdateItem(input: ItemInput) {
		if (!editingItem) return;
		await app.updateItem(editingItem.id, {
			name: input.name,
			volume: input.volume,
			price: input.price,
			url: input.url
		});
		editingItem = null;
	}

	async function handleDeleteItem(item: Item) {
		if (!confirm(`「${item.name || '(名前なし)'}」を削除しますか?`)) return;
		if (editingItem?.id === item.id) editingItem = null;
		await app.deleteItem(item.id);
	}

	async function handleDeleteGroup() {
		const g = app.selectedGroup;
		if (!g) return;
		if (!confirm(`グループ「${g.title}」と配下の商品をすべて削除しますか?`)) return;
		await app.deleteGroup(g.id);
	}

	function backToList() {
		app.selectedGroupId = null;
		app.items = [];
		editingItem = null;
	}
</script>

{#if !ready}
	<p class="loading">読み込み中…</p>
{:else if app.selectedGroup}
	{@const g = app.selectedGroup}
	<div class="group-detail">
		<div class="detail-head">
			<button type="button" class="back" onclick={backToList}>← 一覧</button>
			<h1>{g.title}</h1>
			<button type="button" class="danger" onclick={handleDeleteGroup}>グループ削除</button>
		</div>
		<p class="hint">
			単価の安い順に並びます。単位はこのグループ内で揃えてください(単位変換はしません)。
		</p>

		<ItemTable
			items={app.sortedItems}
			unitLabel={g.unitLabel}
			onedit={(item) => (editingItem = item)}
			ondelete={handleDeleteItem}
		/>

		<section class="form-card card">
			<h2>{editingItem ? '商品を編集' : '商品を追加'}</h2>
			{#key editingItem?.id ?? 'new'}
				<ItemForm
					groupId={g.id}
					unitLabel={g.unitLabel}
					item={editingItem}
					onsubmit={editingItem ? handleUpdateItem : handleAddItem}
					oncancel={editingItem ? () => (editingItem = null) : undefined}
				/>
			{/key}
		</section>
	</div>
{:else}
	<div class="group-list">
		<h1>グループ</h1>
		<p class="hint">比較したい商品の括り(例: 食器用洗剤)を作り、中に容量違いの商品を登録します。</p>

		{#if app.groups.length === 0}
			<p class="empty">まだグループがありません。</p>
		{:else}
			<ul class="groups">
				{#each app.groups as group (group.id)}
					<li>
						<button type="button" class="group-item" onclick={() => app.selectGroup(group.id)}>
							<span class="g-title">{group.title}</span>
							{#if group.unitLabel.trim()}<span class="g-unit">単位: {group.unitLabel}</span>{/if}
							<span class="chev">›</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}

		<section class="form-card card">
			<h2>グループを追加</h2>
			<form class="group-form" onsubmit={createGroup}>
				<label class="field">
					<span>タイトル *</span>
					<input type="text" bind:value={newTitle} placeholder="食器用洗剤" />
				</label>
				<label class="field">
					<span>単位ラベル(任意・表示用)</span>
					<input type="text" bind:value={newUnit} placeholder="ml" />
				</label>
				<button type="submit" class="primary" disabled={!newTitle.trim()}>追加</button>
			</form>
		</section>
	</div>
{/if}

<style>
	.loading,
	.empty {
		color: var(--muted);
		text-align: center;
		padding: 2rem 0;
	}

	.hint {
		color: var(--muted);
		font-size: 0.85rem;
		margin: 0 0 1rem;
	}

	.detail-head {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.detail-head h1 {
		flex: 1;
		font-size: 1.25rem;
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.back {
		border: none;
		background: transparent;
		padding: 0.35rem 0.4rem;
		color: var(--primary);
	}

	.groups {
		list-style: none;
		margin: 0 0 1rem;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.group-item {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.85rem 1rem;
		text-align: left;
		border-radius: var(--radius);
	}

	.g-title {
		font-weight: 600;
		flex: 1;
	}

	.g-unit {
		font-size: 0.8rem;
		color: var(--muted);
	}

	.chev {
		color: var(--muted);
		font-size: 1.2rem;
	}

	.form-card {
		margin-top: 1.25rem;
		padding: 1rem;
	}

	.form-card h2 {
		font-size: 1rem;
		margin-bottom: 0.75rem;
	}

	.group-form {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.85rem;
		color: var(--muted);
	}
</style>
