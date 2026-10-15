<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { formatDateTime } from '$lib/format';
	import {
		ApiError,
		REAUTH_REQUIRED,
		addPasskey,
		deletePasskey,
		isPasskeyCancel,
		reauthenticate,
		removeOwnPassword,
		renamePasskey,
		setOwnPassword
	} from '$lib/admin/client';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const creds = $derived(data.credentials);
	/** パスワードなしで最後の1つなら、そのパスキーは消せない。 */
	const lastPasskeyLocked = $derived(!creds.hasPassword && creds.passkeys.length <= 1);

	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);
	let busy = $state(false);

	/** 本人確認が要ると言われた操作。確認できたら再実行する。 */
	let pending = $state<{ action: () => Promise<unknown>; done: string } | null>(null);
	let reauthPassword = $state('');

	/** 操作を実行して画面を更新する。428 なら本人確認を挟んでから再実行する。 */
	async function run(action: () => Promise<unknown>, done: string): Promise<boolean> {
		error = null;
		notice = null;
		busy = true;
		try {
			await action();
			await invalidateAll();
			notice = done;
			return true;
		} catch (err) {
			if (err instanceof ApiError && err.status === REAUTH_REQUIRED) {
				pending = { action, done };
			} else if (!isPasskeyCancel(err)) {
				error = err instanceof Error ? err.message : '操作に失敗しました。';
			}
			return false;
		} finally {
			busy = false;
		}
	}

	async function confirmIdentity(password?: string) {
		if (!pending) return;
		const { action, done } = pending;
		error = null;
		busy = true;
		try {
			await reauthenticate(password);
		} catch (err) {
			if (!isPasskeyCancel(err)) error = err instanceof Error ? err.message : '本人確認できませんでした。';
			return;
		} finally {
			busy = false;
		}
		pending = null;
		reauthPassword = '';
		await run(action, done);
	}

	// --- パスキー ---
	let newPasskeyName = $state('');

	async function onAddPasskey(e: SubmitEvent) {
		e.preventDefault();
		const name = newPasskeyName;
		if (await run(() => addPasskey(name), 'パスキーを追加しました。')) newPasskeyName = '';
	}

	function onRename(id: string, current: string) {
		const name = prompt('パスキーの名前', current);
		if (name === null || name.trim() === current) return;
		run(() => renamePasskey(id, name), 'パスキーの名前を変更しました。');
	}

	function onDeletePasskey(id: string, name: string) {
		if (!confirm(`パスキー「${name}」を削除しますか?\nこの端末以外のログインはすべてログアウトされます。`)) return;
		run(() => deletePasskey(id), 'パスキーを削除しました。');
	}

	// --- パスワード ---
	let currentPassword = $state('');
	let newPassword = $state('');
	let newPassword2 = $state('');

	async function onSetPassword(e: SubmitEvent) {
		e.preventDefault();
		if (newPassword !== newPassword2) {
			error = '新しいパスワード(確認)が一致しません。';
			return;
		}
		const pw = newPassword;
		const current = creds.hasPassword ? currentPassword : undefined;
		const ok = await run(
			() => setOwnPassword(pw, current),
			creds.hasPassword ? 'パスワードを変更しました。' : 'パスワードを設定しました。'
		);
		if (ok) currentPassword = newPassword = newPassword2 = '';
	}

	function onRemovePassword() {
		if (!confirm('パスワードを削除して、パスキーでしかログインできないようにしますか?\nこの端末以外のログインはすべてログアウトされます。')) return;
		run(removeOwnPassword, 'パスワードを削除しました。パスキーでログインしてください。');
	}
</script>

<svelte:head><title>アカウント — Lowest Finder</title></svelte:head>

<div class="account card">
	<h1>アカウント</h1>
	<p class="who">ユーザー名: <strong>{data.user.username}</strong></p>

	{#if error}<p class="err">{error}</p>{/if}
	{#if notice}<p class="notice">{notice}</p>{/if}

	{#if pending}
		<section class="reauth">
			<h2>本人確認</h2>
			<p class="hint">ログイン方法を変更するため、本人確認をしてください。</p>
			{#if creds.passkeys.length > 0}
				<button type="button" class="primary" disabled={busy} onclick={() => confirmIdentity()}>
					パスキーで確認
				</button>
			{/if}
			{#if creds.hasPassword}
				<form class="form" onsubmit={(e) => (e.preventDefault(), confirmIdentity(reauthPassword))}>
					<label class="field">
						<span>現在のパスワード</span>
						<input type="password" autocomplete="current-password" bind:value={reauthPassword} required />
					</label>
					<button type="submit" disabled={busy}>パスワードで確認</button>
				</form>
			{/if}
			<button type="button" class="link" onclick={() => (pending = null)}>やめる</button>
		</section>
	{/if}

	<h2>パスキー</h2>
	<p class="hint">指紋・顔認証などで、パスワードを入力せずにログインできます。</p>
	{#if creds.passkeys.length > 0}
		<ul class="passkeys">
			{#each creds.passkeys as pk (pk.id)}
				<li>
					<div class="pk-info">
						<strong>{pk.name}</strong>
						<span class="meta">
							登録 {formatDateTime(pk.createdAt)} ・ 最終使用 {pk.lastUsedAt ? formatDateTime(pk.lastUsedAt) : '未使用'}
						</span>
					</div>
					<div class="pk-actions">
						<button type="button" disabled={busy} onclick={() => onRename(pk.id, pk.name)}>名前変更</button>
						<button
							type="button"
							class="danger"
							disabled={busy || lastPasskeyLocked}
							title={lastPasskeyLocked ? 'パスワードがないため、最後のパスキーは削除できません' : undefined}
							onclick={() => onDeletePasskey(pk.id, pk.name)}
						>
							削除
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="hint">まだ登録されていません。</p>
	{/if}
	<form class="form inline" onsubmit={onAddPasskey}>
		<input type="text" placeholder="名前(例: iPhone)" maxlength="50" bind:value={newPasskeyName} />
		<button type="submit" class="primary" disabled={busy}>パスキーを追加</button>
	</form>

	{#if creds.hasPassword}
		<h2>パスワード変更</h2>
		<p class="hint">変更すると、この端末以外のログインはすべてログアウトされます。</p>
	{:else}
		<h2>パスワード設定</h2>
		<p class="hint">いまはパスキーでのみログインできます。パスワードを設定すると、パスワードでもログインできるようになります。</p>
	{/if}

	<form onsubmit={onSetPassword} class="form">
		{#if creds.hasPassword}
			<label class="field">
				<span>現在のパスワード</span>
				<input type="password" autocomplete="current-password" bind:value={currentPassword} required />
			</label>
		{/if}
		<label class="field">
			<span>新しいパスワード(8文字以上)</span>
			<input type="password" autocomplete="new-password" bind:value={newPassword} required />
		</label>
		<label class="field">
			<span>新しいパスワード(確認)</span>
			<input type="password" autocomplete="new-password" bind:value={newPassword2} required />
		</label>
		<button type="submit" class="primary" disabled={busy}>
			{creds.hasPassword ? 'パスワードを変更' : 'パスワードを設定'}
		</button>
	</form>

	{#if creds.hasPassword}
		<h2>パスワードの削除</h2>
		{#if creds.passkeys.length > 0}
			<p class="hint">パスワードを削除すると、パスキーでしかログインできなくなります。</p>
			<button type="button" class="danger" disabled={busy} onclick={onRemovePassword}>パスワードを削除</button>
		{:else}
			<p class="hint">パスワードを削除するには、先にパスキーを登録してください。</p>
		{/if}
	{/if}
</div>

<style>
	.account {
		max-width: 480px;
		margin: 1rem auto;
		padding: 1.5rem;
	}
	h1 {
		font-size: 1.3rem;
	}
	h2 {
		font-size: 1rem;
		margin-top: 1.5rem;
	}
	.who {
		color: var(--muted);
		font-size: 0.9rem;
	}
	.hint {
		color: var(--muted);
		font-size: 0.85rem;
		margin: 0 0 1rem;
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.form.inline {
		flex-direction: row;
	}
	.form.inline input {
		flex: 1;
		min-width: 0;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.85rem;
		color: var(--muted);
	}
	.passkeys {
		list-style: none;
		padding: 0;
		margin: 0 0 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.passkeys li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.pk-info {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}
	.meta {
		color: var(--muted);
		font-size: 0.8rem;
	}
	.pk-actions {
		display: flex;
		gap: 0.4rem;
	}
	.reauth {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem;
		margin: 1rem 0;
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.reauth h2,
	.reauth .hint {
		margin: 0;
	}
	.link {
		background: none;
		border: none;
		color: var(--muted);
		text-decoration: underline;
		align-self: flex-start;
		padding: 0;
	}
	.err {
		color: var(--danger);
		font-size: 0.9rem;
		margin: 0;
	}
	.notice {
		color: var(--best);
		font-size: 0.9rem;
		margin: 0;
	}
</style>
