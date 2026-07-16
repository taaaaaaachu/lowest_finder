<script lang="ts">
	import { changeOwnPassword } from '$lib/admin/client';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let currentPassword = $state('');
	let newPassword = $state('');
	let newPassword2 = $state('');
	let submitting = $state(false);
	let error = $state<string | null>(null);
	let done = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = null;
		done = false;
		if (newPassword !== newPassword2) {
			error = '新しいパスワード(確認)が一致しません。';
			return;
		}
		submitting = true;
		try {
			await changeOwnPassword(currentPassword, newPassword);
			done = true;
			currentPassword = '';
			newPassword = '';
			newPassword2 = '';
		} catch (err) {
			error = err instanceof Error ? err.message : 'パスワード変更に失敗しました。';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head><title>アカウント — Lowest Finder</title></svelte:head>

<div class="account card">
	<h1>アカウント</h1>
	<p class="who">ユーザー名: <strong>{data.user.username}</strong></p>

	<h2>パスワード変更</h2>
	<p class="hint">変更すると、この端末以外のログインはすべてログアウトされます。</p>

	<form onsubmit={submit} class="form">
		{#if error}<p class="err">{error}</p>{/if}
		{#if done}<p class="notice">パスワードを変更しました。</p>{/if}
		<label class="field">
			<span>現在のパスワード</span>
			<input type="password" autocomplete="current-password" bind:value={currentPassword} required />
		</label>
		<label class="field">
			<span>新しいパスワード(8文字以上)</span>
			<input type="password" autocomplete="new-password" bind:value={newPassword} required />
		</label>
		<label class="field">
			<span>新しいパスワード(確認)</span>
			<input type="password" autocomplete="new-password" bind:value={newPassword2} required />
		</label>
		<button type="submit" class="primary" disabled={submitting}>
			{submitting ? '変更中…' : 'パスワードを変更'}
		</button>
	</form>
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
		margin-top: 1.25rem;
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
	.notice {
		color: var(--best);
		font-size: 0.9rem;
		margin: 0;
	}
</style>
