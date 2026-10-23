<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import {
		ApiError,
		REAUTH_REQUIRED,
		addPasskey,
		isPasskeyCancel,
		reauthenticate,
		setOwnPassword
	} from '$lib/admin/client';

	let error = $state<string | null>(null);
	let busy = $state(false);
	/** ログインから時間が経って本人確認が要ると言われた操作。仮パスワードで確認してから再実行する。 */
	let pending = $state<(() => Promise<unknown>) | null>(null);
	let temporaryPassword = $state('');

	let newPassword = $state('');
	let newPassword2 = $state('');
	let passkeyName = $state('');

	async function run(action: () => Promise<unknown>) {
		error = null;
		busy = true;
		try {
			await action();
			await goto(resolve('/'), { invalidateAll: true });
		} catch (err) {
			if (err instanceof ApiError && err.status === REAUTH_REQUIRED) {
				pending = action;
			} else if (!isPasskeyCancel(err)) {
				error = err instanceof Error ? err.message : '操作に失敗しました。';
			}
		} finally {
			busy = false;
		}
	}

	async function confirmIdentity(e: SubmitEvent) {
		e.preventDefault();
		if (!pending) return;
		const action = pending;
		error = null;
		try {
			await reauthenticate(temporaryPassword);
		} catch (err) {
			error = err instanceof Error ? err.message : '本人確認できませんでした。';
			return;
		}
		pending = null;
		temporaryPassword = '';
		await run(action);
	}

	function onSetPassword(e: SubmitEvent) {
		e.preventDefault();
		if (newPassword !== newPassword2) {
			error = '新しいパスワード(確認)が一致しません。';
			return;
		}
		const pw = newPassword;
		run(() => setOwnPassword(pw));
	}

	function onAddPasskey(e: SubmitEvent) {
		e.preventDefault();
		const name = passkeyName;
		run(() => addPasskey(name));
	}
</script>

<svelte:head><title>パスワードの変更 — Lowest Finder</title></svelte:head>

<div class="card change">
	<h1>パスワードの変更</h1>
	<p class="hint">
		管理者が設定した仮パスワードでログインしています。続けるには、新しいパスワードを設定するか、パスキーを登録してください。
	</p>

	{#if error}<p class="err">{error}</p>{/if}

	{#if pending}
		<form class="form reauth" onsubmit={confirmIdentity}>
			<p class="hint">ログインから時間が経ったため、本人確認をしてください。</p>
			<label class="field">
				<span>仮パスワード</span>
				<input type="password" autocomplete="current-password" bind:value={temporaryPassword} required />
			</label>
			<button type="submit" class="primary" disabled={busy}>確認して続ける</button>
		</form>
	{/if}

	<h2>新しいパスワードを設定</h2>
	<form class="form" onsubmit={onSetPassword}>
		<label class="field">
			<span>新しいパスワード(8文字以上)</span>
			<input type="password" autocomplete="new-password" bind:value={newPassword} required />
		</label>
		<label class="field">
			<span>新しいパスワード(確認)</span>
			<input type="password" autocomplete="new-password" bind:value={newPassword2} required />
		</label>
		<button type="submit" class="primary" disabled={busy}>パスワードを設定</button>
	</form>

	<h2>またはパスキーを登録</h2>
	<p class="hint">パスキーを登録すると仮パスワードは削除され、パスキーでログインするようになります。</p>
	<form class="form inline" onsubmit={onAddPasskey}>
		<input type="text" placeholder="名前(例: iPhone)" maxlength="50" bind:value={passkeyName} />
		<button type="submit" disabled={busy}>パスキーを登録</button>
	</form>
</div>

<style>
	.change {
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
	.reauth {
		padding: 1rem;
		margin: 1rem 0;
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.reauth .hint {
		margin: 0;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.85rem;
		color: var(--muted);
	}
	.err {
		color: var(--danger);
		font-size: 0.9rem;
		margin: 0;
	}
</style>
