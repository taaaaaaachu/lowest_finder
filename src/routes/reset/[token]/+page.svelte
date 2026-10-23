<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { isPasskeyCancel, resetWithPasskey } from '$lib/admin/client';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let passkeyName = $state('');
	let passkeyError = $state<string | null>(null);
	let busy = $state(false);

	async function onPasskey(e: SubmitEvent) {
		e.preventDefault();
		passkeyError = null;
		busy = true;
		try {
			await resetWithPasskey(page.params.token!, passkeyName);
			await goto('/', { invalidateAll: true });
		} catch (err) {
			if (!isPasskeyCancel(err)) {
				passkeyError = err instanceof Error ? err.message : 'パスキーを登録できませんでした。';
			}
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>ログイン方法の再設定 — Lowest Finder</title></svelte:head>

<div class="card reset">
	<h1>ログイン方法の再設定</h1>

	{#if data.username === null}
		<p class="err">このリンクは使えません(期限切れ・使用済み・取り消し済み)。管理者に再発行を依頼してください。</p>
	{:else}
		<p class="hint">
			<strong>{data.username}</strong> の新しいパスワードを設定するか、パスキーを登録してください。
			登録済みのパスキーはすべて削除され、ほかの端末のログインもすべてログアウトされます。
		</p>

		<h2>新しいパスワードを設定</h2>
		<form method="POST" use:enhance class="form">
			{#if form?.error}<p class="err">{form.error}</p>{/if}
			<input type="text" name="username" autocomplete="username" value={data.username} hidden readonly />
			<label class="field">
				<span>新しいパスワード(8文字以上)</span>
				<input name="password" type="password" autocomplete="new-password" required />
			</label>
			<label class="field">
				<span>新しいパスワード(確認)</span>
				<input name="password2" type="password" autocomplete="new-password" required />
			</label>
			<button type="submit" class="primary">パスワードを設定してログイン</button>
		</form>

		<h2>またはパスキーを登録</h2>
		{#if passkeyError}<p class="err">{passkeyError}</p>{/if}
		<form class="form inline" onsubmit={onPasskey}>
			<input type="text" placeholder="名前(例: iPhone)" maxlength="50" bind:value={passkeyName} />
			<button type="submit" disabled={busy}>パスキーを登録</button>
		</form>
	{/if}
</div>

<style>
	.reset {
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
