<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head><title>会員登録 — Lowest Finder</title></svelte:head>

<div class="auth card">
	<h1>会員登録</h1>
	<p class="hint">登録するとデータがサーバーに保存され、他の端末からも見られます。</p>

	<form method="POST" use:enhance class="auth-form">
		{#if form?.error}<p class="err">{form.error}</p>{/if}
		<label class="field">
			<span>ユーザー名(3〜32文字, 英数字と _ . -)</span>
			<input name="username" type="text" autocomplete="username" value={form?.username ?? ''} required />
		</label>
		<label class="field">
			<span>パスワード(8文字以上)</span>
			<input name="password" type="password" autocomplete="new-password" required />
		</label>
		<button type="submit" class="primary">登録する</button>
	</form>

	<p class="alt">すでにアカウントがある場合は <a href="/login">ログイン</a></p>
</div>

<style>
	.auth {
		max-width: 420px;
		margin: 2rem auto;
		padding: 1.5rem;
	}
	.hint {
		color: var(--muted);
		font-size: 0.85rem;
		margin: 0 0 1.25rem;
	}
	.auth-form {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.85rem;
		color: var(--muted);
	}
	.err {
		margin: 0;
		color: var(--danger);
		font-size: 0.9rem;
	}
	.alt {
		margin-top: 1.25rem;
		font-size: 0.9rem;
		text-align: center;
	}
</style>
