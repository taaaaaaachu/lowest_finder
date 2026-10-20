<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { app } from '$lib/stores/app.svelte';
	import { IndexedDbRepository } from '$lib/repo/indexeddb';
	import { MemberRepository } from '$lib/repo/member';
	import { scrapeUrl } from '$lib/repo/api';
	import { scrapeSequentially } from '$lib/scrapeAll';
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

	onMount(() => {
		start();
		if (!user) return;
		// 通信回復・画面復帰で未送信の変更を送り、最新を取り直す。
		const sync = () => {
			if (app.repo instanceof MemberRepository) void app.repo.sync();
		};
		const syncIfVisible = () => {
			if (document.visibilityState === 'visible') sync();
		};
		window.addEventListener('online', sync);
		document.addEventListener('visibilitychange', syncIfVisible);
		return () => {
			window.removeEventListener('online', sync);
			document.removeEventListener('visibilitychange', syncIfVisible);
		};
	});

	async function start() {
		if (user) {
			// 会員モード: 端末のローカルDBで読み書きし、サーバーと同期する(オフラインでも記録可)。
			const repo = new MemberRepository(user.id, {
				onSync: (s) => {
					app.offline = s.offline;
					app.pending = s.pending;
					app.authRequired = s.authRequired;
					void app.refresh();
				},
				onRejected: (message) => (app.error = `サーバーに反映できなかった変更を取り消しました: ${message}`)
			});
			await app.setRepository(repo);
			// 端末のデータが消されにくくする(未送信の変更を守るため)。
			void navigator.storage?.persist?.();
			void repo.sync();
			await maybeOfferImport();
		} else {
			// ゲストモード: IndexedDB のみ(完全クライアント完結)。
			await app.setRepository(new IndexedDbRepository());
		}
		ready = true;
	}

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
		if (!pendingImport || !(app.repo instanceof MemberRepository)) return;
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

	// 1件取得して価格を更新する。取得できなければ例外を投げる。
	async function scrapeAndApply(item: Item) {
		const res = await scrapeUrl(item.url!);
		if (res.price === null) {
			throw new Error('このページから価格を取得できませんでした。手入力で価格を更新してください。');
		}
		await app.updateItem(item.id, { price: res.price, lastFetchedAt: Date.now() });
	}

	async function handleScrape(item: Item) {
		if (!item.url) return;
		scrapingId = item.id;
		app.error = null;
		try {
			await scrapeAndApply(item);
		} catch (e) {
			app.error = e instanceof Error ? e.message : '価格の取得に失敗しました。';
		} finally {
			scrapingId = null;
		}
	}

	// グループ内一括取得の進捗(null なら非実行)。
	let bulk = $state<{ done: number; total: number; cancelled: boolean } | null>(null);

	async function handleScrapeAll() {
		const targets = app.sortedItems.filter((i) => i.url);
		if (targets.length === 0) return;
		bulk = { done: 0, total: targets.length, cancelled: false };
		// 画面を離れて別の一括取得が始まっても混ざらないよう、この実行の状態を掴んでおく。
		const run = bulk;
		app.error = null;
		try {
			const failed = await scrapeSequentially(
				targets,
				scrapeAndApply,
				(done) => (run.done = done),
				() => run.cancelled
			);
			if (failed.length > 0) {
				app.error = `${failed.length}件の価格を取得できませんでした: ${failed.map((i) => i.name || '(名前なし)').join('、')}`;
			}
		} finally {
			if (bulk === run) bulk = null;
		}
	}

	function cancelScrapeAll() {
		if (bulk) bulk.cancelled = true;
	}

	async function handleDeleteGroup() {
		const g = app.selectedGroup;
		if (!g) return;
		if (!confirm(`グループ「${g.title}」と配下の商品をすべて削除しますか?`)) return;
		await app.deleteGroup(g.id);
	}

	// グループ編集(タイトル・単位ラベル)。
	let editingGroup = $state(false);
	let editTitle = $state('');
	let editUnit = $state('');

	function startEditGroup() {
		const g = app.selectedGroup;
		if (!g) return;
		editTitle = g.title;
		editUnit = g.unitLabel;
		editingGroup = true;
	}

	function cancelEditGroup() {
		editingGroup = false;
	}

	async function saveEditGroup(e: SubmitEvent) {
		e.preventDefault();
		const g = app.selectedGroup;
		if (!g || !editTitle.trim()) return;
		await app.updateGroup(g.id, { title: editTitle.trim(), unitLabel: editUnit.trim() });
		editingGroup = false;
	}

	function backToList() {
		cancelScrapeAll();
		bulk = null;
		app.selectedGroupId = null;
		app.items = [];
		editingItem = null;
		editingGroup = false;
	}

	function openGroup(id: string) {
		editingGroup = false;
		app.selectGroup(id);
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

	{#if app.authRequired}
		<div class="banner offline">
			ログインの有効期限が切れています。<a href="/login">再ログイン</a>すると未送信の変更({app.pending}件)を送信します。
		</div>
	{:else if app.offline}
		<div class="banner offline">
			オフラインです。変更は端末に保存し、通信が戻ったら送信します{app.pending
				? `(未送信 ${app.pending}件)`
				: ''}。
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
			{#if !editingGroup}
				<button type="button" class="edit" onclick={startEditGroup}>編集</button>
			{/if}
			<button type="button" class="danger" onclick={handleDeleteGroup}>グループ削除</button>
		</div>
		{#if editingGroup}
			<form class="group-edit card" onsubmit={saveEditGroup}>
				<label class="field">
					<span>タイトル *</span>
					<input type="text" bind:value={editTitle} placeholder="食器用洗剤" />
				</label>
				<label class="field">
					<span>単位ラベル(任意・表示用)</span>
					<input type="text" bind:value={editUnit} placeholder="ml" />
				</label>
				<div class="edit-actions">
					<button type="submit" class="primary" disabled={!editTitle.trim()}>保存</button>
					<button type="button" onclick={cancelEditGroup}>キャンセル</button>
				</div>
			</form>
		{/if}
		<p class="hint">
			単価の安い順に並びます。単位はこのグループ内で揃えてください(単位変換はしません)。
		</p>

		{#if bulk}
			<div class="bulk card">
				<progress max={bulk.total} value={bulk.done}></progress>
				<span>価格取得中… {bulk.done} / {bulk.total}</span>
				<button type="button" onclick={cancelScrapeAll} disabled={bulk.cancelled}>
					{bulk.cancelled ? '中止中…' : '中止'}
				</button>
			</div>
		{:else if user && !app.offline && app.items.some((i) => i.url)}
			<button
				type="button"
				class="scrape-all"
				onclick={handleScrapeAll}
				disabled={scrapingId !== null}
			>
				一括価格取得
			</button>
		{/if}

		<ItemTable
			items={app.sortedItems}
			unitLabel={g.unitLabel}
			onedit={(item) => (editingItem = item)}
			ondelete={handleDeleteItem}
			onscrape={user && !app.offline && !bulk ? handleScrape : undefined}
			{scrapingId}
			{editingItem}
			onsubmitEdit={handleUpdateItem}
			oncancelEdit={() => (editingItem = null)}
		/>

		<section class="form-card card">
			<h2>商品を追加</h2>
			<ItemForm groupId={g.id} unitLabel={g.unitLabel} onsubmit={handleAddItem} />
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
						<button type="button" class="group-item" onclick={() => openGroup(group.id)}>
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

	.edit {
		flex-shrink: 0;
		padding: 0.4rem 0.75rem;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
		border-radius: 8px;
		font-size: 0.9rem;
		font-weight: 600;
		box-shadow: var(--shadow);
	}

	.edit:hover {
		background: #f0f2f5;
	}

	.group-edit {
		margin: 0.75rem 0;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.edit-actions {
		display: flex;
		gap: 0.5rem;
	}

	.bulk {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.6rem 0.75rem;
		margin-bottom: 1rem;
		font-size: 0.85rem;
	}

	.bulk progress {
		flex: 1;
		min-width: 0;
		accent-color: var(--primary);
	}

	.scrape-all {
		margin-bottom: 1rem;
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
