<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { app } from '$lib/stores/app.svelte';
	import { IndexedDbRepository } from '$lib/repo/indexeddb';
	import { CachingApiRepository } from '$lib/repo/cachingApi';
	import { scrapeUrl } from '$lib/repo/api';
	import type { Item } from '$lib/types';
	import type { ItemInput, Snapshot } from '$lib/repo/types';
	import ItemForm from '$lib/components/ItemForm.svelte';
	import ItemTable from '$lib/components/ItemTable.svelte';

	let ready = $state(false);

	// グループ作成フォーム
	let newTitle = $state('');
	let newUnit = $state('');

	// 商品編集中の対象(null なら追加モード)
	let editingItem = $state<Item | null>(null);

	// 取り込み待ちのゲストデータ(会員ログイン直後にゲストデータがあれば提示)
	let pendingImport = $state<{ snapshot: Snapshot; groups: number; items: number } | null>(null);
	let importing = $state(false);

	const user = $derived(page.data.user);

	onMount(async () => {
		if (user) {
			// 会員モード: サーバーAPI + オフライン閲覧キャッシュ。
			await app.setRepository(new CachingApiRepository((offline) => (app.offline = offline)));
			await maybeOfferImport();
		} else {
			// ゲストモード: IndexedDB のみ(完全クライアント完結)。
			await app.setRepository(new IndexedDbRepository());
		}
		ready = true;
	});

	// ゲスト用 IndexedDB にデータが残っていれば、会員データへの取り込みを提示する。
	async function maybeOfferImport() {
		const guest = new IndexedDbRepository();
		const snapshot = await guest.exportAll();
		if (snapshot.groups.length > 0 || snapshot.items.length > 0) {
			pendingImport = {
				snapshot,
				groups: snapshot.groups.length,
				items: snapshot.items.length
			};
		}
	}

	async function confirmImport() {
		if (!pendingImport || !(app.repo instanceof CachingApiRepository)) return;
		importing = true;
		try {
			await app.repo.importSnapshot(pendingImport.snapshot);
			// 取り込んだゲストデータは二重表示を避けるため消す。
			await new IndexedDbRepository().clearAll();
			pendingImport = null;
			await app.reloadGroups();
		} catch (e) {
			app.error = e instanceof Error ? e.message : '取り込みに失敗しました。';
		} finally {
			importing = false;
		}
	}

	function dismissImport() {
		// 取り込まない場合はゲストデータをそのまま残す(次回また提示)。
		pendingImport = null;
	}

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

	// 価格取得中のアイテムID
	let scrapingId = $state<string | null>(null);

	async function handleScrape(item: Item) {
		if (!item.url) return;
		scrapingId = item.id;
		app.error = null;
		try {
			const res = await scrapeUrl(item.url);
			if (res.price === null) {
				app.error =
					'このページから価格を取得できませんでした。手入力で価格を更新してください。';
				return;
			}
			await app.updateItem(item.id, { price: res.price, lastFetchedAt: Date.now() });
		} catch (e) {
			app.error = e instanceof Error ? e.message : '価格の取得に失敗しました。';
		} finally {
			scrapingId = null;
		}
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
{:else}
	{#if pendingImport}
		<div class="banner import">
			<div>
				<strong>ゲストデータの取り込み</strong>
				<p>
					この端末に保存されたゲストデータ({pendingImport.groups}グループ / {pendingImport.items}商品)を、あなたのアカウントに取り込みますか?
				</p>
			</div>
			<div class="banner-actions">
				<button type="button" class="primary" onclick={confirmImport} disabled={importing}>
					{importing ? '取り込み中…' : '取り込む'}
				</button>
				<button type="button" onclick={dismissImport} disabled={importing}>あとで</button>
			</div>
		</div>
	{/if}

	{#if app.offline}
		<div class="banner offline">
			オフラインです。保存済みデータの閲覧のみできます(追加・編集はオンライン時に行ってください)。
		</div>
	{/if}

	{#if app.error}
		<div class="banner error">
			{app.error}
			<button type="button" class="dismiss" onclick={() => (app.error = null)}>×</button>
		</div>
	{/if}

	{#if app.selectedGroup}
		{@const g = app.selectedGroup}
	<div class="group-detail">
		<div class="detail-head">
			<button type="button" class="back" onclick={backToList}>‹ グループ一覧</button>
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
			onscrape={user && !app.offline ? handleScrape : undefined}
			{scrapingId}
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
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		padding: 0.4rem 0.75rem;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
		border-radius: 8px;
		font-size: 0.9rem;
		font-weight: 600;
		box-shadow: var(--shadow);
		flex-shrink: 0;
	}

	.back:hover {
		background: #f0f2f5;
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
